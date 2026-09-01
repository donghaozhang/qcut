/**
 * Reproducible export benchmark harness.
 *
 * Builds a fixed set of timeline shapes (single track, stacked multi-track,
 * and a filter/transition/audio combination), exports each through the
 * production renderer-muxer HTTP route with the structured profiler armed,
 * and records wall time, per-stage timings, counters and peak process memory
 * into one JSON report.
 *
 * The report is the input for optimization work: stage totals localize the
 * bottleneck, and re-running the same scenarios after a change gives a
 * before/after comparison on identical inputs.
 */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ElectronApplication, Page } from "@playwright/test";
import { getFFmpegPath } from "../../../../../../electron/ffmpeg/paths";
import {
	type MemorySnapshot,
	peakByType,
	sampleMemory,
} from "./export-lifecycle-memory";
import {
	type ExportProfileSummary,
	readExportProfile,
	startRendererMuxerExport,
} from "./sequential-decode-evidence";
import type { ExposedWindow } from "./sequential-decode-timeline";

const execFileAsync = promisify(execFile);

export const BENCHMARK_FPS = 30;
export const BENCHMARK_WIDTH = 1280;
export const BENCHMARK_HEIGHT = 720;
/** Every scenario spans the same window so wall times compare directly. */
export const BENCHMARK_SECONDS = 6;
export const BENCHMARK_FRAMES = Math.round(BENCHMARK_SECONDS * BENCHMARK_FPS);

export type BenchmarkScenarioName =
	| "single-track"
	| "multi-track-3"
	| "filters-transition-audio"
	| "image-overlay";

export interface BenchmarkScenarioMedia {
	/** Media item names as imported into the media panel. */
	clipA: string;
	clipB: string;
	clipC: string;
	audio: string;
	image: string;
}

export interface BenchmarkMeasurement {
	scenario: BenchmarkScenarioName;
	wallMs: number;
	frameCount: number;
	msPerFrame: number;
	stageTotalsMs: Record<string, number>;
	stageCounts: Record<string, number>;
	counters: Record<string, number>;
	peakMemoryMbByType: Record<string, number>;
	memorySampleCount: number;
}

export interface BenchmarkReport {
	schemaVersion: 1;
	kind: "qcut-export-benchmark-v1";
	label: string;
	recordedAt: string;
	settings: {
		width: number;
		height: number;
		fps: number;
		seconds: number;
	};
	measurements: BenchmarkMeasurement[];
}

/** A single opaque PNG, used as a still overlay in the image scenario. */
export async function generateStillImage({
	filePath,
	color = "0x3080ff",
	width = 640,
	height = 360,
}: {
	filePath: string;
	color?: string;
	width?: number;
	height?: number;
}): Promise<void> {
	await execFileAsync(getFFmpegPath(), [
		"-y",
		"-f",
		"lavfi",
		"-i",
		`color=c=${color}:s=${width}x${height}`,
		"-frames:v",
		"1",
		filePath,
	]);
}

interface TimelineStoreWithSetState {
	getState: () => { tracks: unknown[] };
	setState: (state: Record<string, unknown>) => void;
}

/** Serialized copy of the project's pristine track list. */
export async function snapshotTimelineTracks({
	page,
}: {
	page: Page;
}): Promise<string> {
	return page.evaluate(() => {
		const editorWindow = window as unknown as {
			__timelineStore: TimelineStoreWithSetState;
		};
		return JSON.stringify(editorWindow.__timelineStore.getState().tracks);
	});
}

/**
 * Restores the pristine track list. Scenarios share one project (creating a
 * second project mid-session needs a navigation the harness should not depend
 * on), so each run starts from the same empty timeline.
 */
export async function restoreTimelineTracks({
	page,
	snapshot,
}: {
	page: Page;
	snapshot: string;
}): Promise<void> {
	await page.evaluate((serialized) => {
		const editorWindow = window as unknown as {
			__timelineStore: TimelineStoreWithSetState;
		};
		const tracks = JSON.parse(serialized) as unknown[];
		editorWindow.__timelineStore.setState({
			_tracks: JSON.parse(serialized),
			tracks,
			selectedElements: [],
		});
	}, snapshot);
}

/**
 * Builds one benchmark timeline shape on the already-open project.
 *
 * Track array order is UI top-to-bottom and draw order is reversed, so index 0
 * renders on top — the stacked scenario therefore forces the renderer to
 * composite every overlay for every frame.
 */
export async function buildBenchmarkTimeline({
	page,
	scenario,
	media,
}: {
	page: Page;
	scenario: BenchmarkScenarioName;
	media: BenchmarkScenarioMedia;
}): Promise<{ projectId: string; duration: number }> {
	return page.evaluate(
		({ scenario, media, seconds }) => {
			const editorWindow = window as unknown as ExposedWindow;
			const projectId =
				editorWindow.__projectStore.getState().activeProject?.id;
			if (!projectId) throw new Error("No active project");
			const items = editorWindow.__mediaStore.getState().mediaItems;
			const byName = (name: string) => {
				const item = items.find((candidate) => candidate.name === name);
				if (!item) throw new Error(`Media ${name} was not imported`);
				return item;
			};

			const timeline = editorWindow.__timelineStore.getState();
			const mainTrack = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!mainTrack) throw new Error("Missing main media track");

			const addClip = ({
				trackId,
				name,
				mediaId,
				startTime,
				duration,
				extra = {},
			}: {
				trackId: string;
				name: string;
				mediaId: string;
				startTime: number;
				duration: number;
				extra?: Record<string, unknown>;
			}): string => {
				const id = timeline.addElementToTrack(trackId, {
					type: "media",
					mediaId,
					name,
					startTime,
					duration,
					trimStart: 0,
					trimEnd: 0,
					...extra,
				});
				if (!id) throw new Error(`Failed to add ${name}`);
				return id;
			};

			if (scenario === "single-track") {
				const clip = byName(media.clipA);
				addClip({
					trackId: mainTrack.id,
					name: "bench-main",
					mediaId: clip.id,
					startTime: 0,
					duration: seconds,
				});
			} else if (scenario === "multi-track-3") {
				// Three video elements are visible on every frame, so each frame
				// needs three source decodes plus three composite draws.
				const overlayTop = timeline.insertTrackAt("media", 0);
				const overlayMid = timeline.insertTrackAt("media", 0);
				addClip({
					trackId: mainTrack.id,
					name: "bench-main",
					mediaId: byName(media.clipA).id,
					startTime: 0,
					duration: seconds,
				});
				addClip({
					trackId: overlayMid,
					name: "bench-pip-1",
					mediaId: byName(media.clipB).id,
					startTime: 0,
					duration: seconds,
					extra: { x: -220, y: -110, scaleX: 0.45, scaleY: 0.45 },
				});
				addClip({
					trackId: overlayTop,
					name: "bench-pip-2",
					mediaId: byName(media.clipC).id,
					startTime: 0,
					duration: seconds,
					extra: { x: 220, y: 110, scaleX: 0.45, scaleY: 0.45 },
				});
			} else if (scenario === "image-overlay") {
				// One video plus two still overlays. Stills are the case where a
				// per-frame image decode would dominate: the same file is drawn
				// on every output frame.
				const overlayTop = timeline.insertTrackAt("media", 0);
				const overlayMid = timeline.insertTrackAt("media", 0);
				addClip({
					trackId: mainTrack.id,
					name: "bench-main",
					mediaId: byName(media.clipA).id,
					startTime: 0,
					duration: seconds,
				});
				addClip({
					trackId: overlayMid,
					name: "bench-still-1",
					mediaId: byName(media.image).id,
					startTime: 0,
					duration: seconds,
					extra: { x: -220, y: -110, scaleX: 0.4, scaleY: 0.4 },
				});
				addClip({
					trackId: overlayTop,
					name: "bench-still-2",
					mediaId: byName(media.image).id,
					startTime: 0,
					duration: seconds,
					extra: { x: 220, y: 110, scaleX: 0.4, scaleY: 0.4 },
				});
			} else {
				// Two clips meeting at a transition seam, an always-on colour
				// adjustment layer, and a parallel audio track.
				const half = seconds / 2;
				const adjustmentTrackId = timeline.insertTrackAt("adjustment", 0);
				const audioTrackId = timeline.addTrack("audio");
				const first = addClip({
					trackId: mainTrack.id,
					name: "bench-seam-a",
					mediaId: byName(media.clipA).id,
					startTime: 0,
					duration: half,
					extra: {
						color: {
							enabled: true,
							basic: { saturation: 18, contrast: 12, temperature: 8 },
						},
					},
				});
				const second = addClip({
					trackId: mainTrack.id,
					name: "bench-seam-b",
					mediaId: byName(media.clipB).id,
					startTime: half,
					duration: half,
					extra: {
						color: {
							enabled: true,
							basic: { saturation: -12, contrast: 6, temperature: -10 },
						},
					},
				});
				const transitionId = timeline.addTransition({
					trackId: mainTrack.id,
					fromElementId: first,
					toElementId: second,
					// The store validates the seam against the known video media
					// ids, so both sides must be listed here.
					videoMediaIds: new Set([
						byName(media.clipA).id,
						byName(media.clipB).id,
						byName(media.clipC).id,
					]),
					presetId: "fade",
					engine: "qcut",
					type: "fade",
					duration: 0.8,
					easing: "linear",
				});
				if (!transitionId) throw new Error("Failed to add the transition seam");
				const adjustmentId = timeline.addElementToTrack(adjustmentTrackId, {
					type: "adjustment",
					name: "bench-adjustment",
					startTime: 0,
					duration: seconds,
					trimStart: 0,
					trimEnd: 0,
					adjustments: { brightness: 6, contrast: 10, saturation: 12 },
				});
				if (!adjustmentId) throw new Error("Failed to add adjustment layer");
				const audioId = timeline.addElementToTrack(audioTrackId, {
					type: "media",
					mediaId: byName(media.audio).id,
					name: "bench-audio",
					startTime: 0,
					duration: seconds,
					trimStart: 0,
					trimEnd: 0,
				});
				if (!audioId) throw new Error("Failed to add audio element");
			}

			return { projectId, duration: timeline.getTotalDuration() };
		},
		{ scenario, media, seconds: BENCHMARK_SECONDS }
	);
}

/**
 * Runs one export while polling process memory, and folds the profiler report
 * and the memory series into a single measurement.
 */
export async function measureExportScenario({
	apiPort,
	electronApp,
	projectId,
	scenario,
	outputPath,
	profilePath,
	token,
	waitForJob,
	memoryIntervalMs = 500,
}: {
	apiPort: number;
	electronApp: ElectronApplication;
	projectId: string;
	scenario: BenchmarkScenarioName;
	outputPath: string;
	profilePath: string;
	token?: string;
	waitForJob: (input: {
		jobId: string;
	}) => Promise<{ status: string; error?: string }>;
	memoryIntervalMs?: number;
}): Promise<{
	measurement: BenchmarkMeasurement;
	profile: ExportProfileSummary;
}> {
	const samples: MemorySnapshot[] = [];
	let sampling = true;
	const collect = (async () => {
		while (sampling) {
			try {
				samples.push({
					atMs: Date.now(),
					label: scenario,
					samples: await sampleMemory({ electronApp }),
				});
			} catch {
				// A sample that races teardown must not fail the benchmark.
			}
			await new Promise((resolve) => setTimeout(resolve, memoryIntervalMs));
		}
	})();

	const startedAt = Date.now();
	let wallMs = 0;
	try {
		const { jobId } = await startRendererMuxerExport({
			apiPort,
			projectId,
			outputPath,
			profilePath,
			width: BENCHMARK_WIDTH,
			height: BENCHMARK_HEIGHT,
			fps: BENCHMARK_FPS,
			token,
		});
		const job = await waitForJob({ jobId });
		wallMs = Date.now() - startedAt;
		if (job.status !== "completed") {
			throw new Error(
				`${scenario} export did not complete: ${job.error ?? job.status}`
			);
		}
	} finally {
		sampling = false;
		await collect;
	}

	const profile = await readExportProfile({ filePath: profilePath });
	const frameCount = profile.frameCount || BENCHMARK_FRAMES;
	return {
		profile,
		measurement: {
			scenario,
			wallMs,
			frameCount,
			msPerFrame: Number((wallMs / Math.max(1, frameCount)).toFixed(3)),
			stageTotalsMs: profile.stageTotalsMs,
			stageCounts: profile.stageCounts,
			counters: profile.counters,
			peakMemoryMbByType: peakByType(samples),
			memorySampleCount: samples.length,
		},
	};
}

/** Stage totals sorted by cost, so the dominant stage is unambiguous. */
export function rankStages({
	measurement,
}: {
	measurement: BenchmarkMeasurement;
}): Array<{ stage: string; totalMs: number; shareOfWall: number }> {
	return Object.entries(measurement.stageTotalsMs)
		.map(([stage, totalMs]) => ({
			stage,
			totalMs,
			shareOfWall: Number(
				(totalMs / Math.max(1, measurement.wallMs)).toFixed(4)
			),
		}))
		.sort((a, b) => b.totalMs - a.totalMs);
}

export async function writeBenchmarkReport({
	directory,
	fileName,
	label,
	measurements,
}: {
	directory: string;
	fileName: string;
	label: string;
	measurements: BenchmarkMeasurement[];
}): Promise<string> {
	const report: BenchmarkReport = {
		schemaVersion: 1,
		kind: "qcut-export-benchmark-v1",
		label,
		recordedAt: new Date().toISOString(),
		settings: {
			width: BENCHMARK_WIDTH,
			height: BENCHMARK_HEIGHT,
			fps: BENCHMARK_FPS,
			seconds: BENCHMARK_SECONDS,
		},
		measurements,
	};
	const filePath = path.join(directory, fileName);
	await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return filePath;
}
