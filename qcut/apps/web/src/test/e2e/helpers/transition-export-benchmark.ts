/**
 * Reproducible transition export benchmark harness.
 *
 * Every scenario exports the same two source clips meeting at the same seam;
 * only the transition differs (including a no-transition control), so any
 * difference in export time is attributable to the transition itself.
 *
 * The report records the renderer's own wall time, the per-frame render cost,
 * the transition-specific profiler stages (resolve / offscreen layer setup /
 * composite back), how many frames actually ran through a transition layer,
 * and peak process memory.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
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

export const TRANSITION_BENCHMARK_FPS = 30;
export const TRANSITION_BENCHMARK_WIDTH = 1280;
export const TRANSITION_BENCHMARK_HEIGHT = 720;
/** Each clip runs half the timeline; the seam sits exactly in the middle. */
export const TRANSITION_BENCHMARK_SECONDS = 6;
export const TRANSITION_BENCHMARK_FRAMES = Math.round(
	TRANSITION_BENCHMARK_SECONDS * TRANSITION_BENCHMARK_FPS
);
export const TRANSITION_SEAM_SECONDS = TRANSITION_BENCHMARK_SECONDS / 2;
export const TRANSITION_DURATION_SECONDS = 1;

/**
 * Scenarios: a control with no seam transition, a cross dissolve, a slide, and
 * a filter-driven type whose presentation carries canvas filters — the most
 * expensive canvas-renderable family.
 */
export type TransitionScenarioName =
	| "no-transition"
	| "dissolve"
	| "slide"
	| "zoom-blur";

export const TRANSITION_SCENARIO_TYPES: Record<
	Exclude<TransitionScenarioName, "no-transition">,
	{ type: string; presetId: string; direction?: string }
> = {
	dissolve: { type: "dissolve", presetId: "dissolve" },
	slide: { type: "slide", presetId: "slide-left", direction: "left" },
	"zoom-blur": { type: "zoom-blur", presetId: "zoom-blur" },
};

export interface TransitionBenchmarkMeasurement {
	scenario: TransitionScenarioName;
	/** Wall time as the renderer measured it (job polling is too coarse). */
	exportWallMs: number;
	frameCount: number;
	frameTotalP50Ms: number;
	frameTotalP95Ms: number;
	stageTotalsMs: Record<string, number>;
	counters: Record<string, number>;
	peakMemoryMbByType: Record<string, number>;
	memorySampleCount: number;
	probe?: {
		frameCount: number;
		durationSeconds: number;
		width: number;
		height: number;
		hasAudio: boolean;
	};
}

export interface TransitionBenchmarkReport {
	schemaVersion: 1;
	kind: "qcut-transition-export-benchmark-v1";
	label: string;
	recordedAt: string;
	settings: {
		width: number;
		height: number;
		fps: number;
		seconds: number;
		seamSeconds: number;
		transitionSeconds: number;
	};
	measurements: TransitionBenchmarkMeasurement[];
}

interface TimelineStoreWithSetState {
	getState: () => { tracks: unknown[] };
	setState: (state: Record<string, unknown>) => void;
}

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
		editorWindow.__timelineStore.setState({
			_tracks: JSON.parse(serialized),
			tracks: JSON.parse(serialized) as unknown[],
			selectedElements: [],
		});
	}, snapshot);
}

/**
 * Places two clips back to back on the main track and, for every scenario
 * except the control, adds the seam transition. The clip layout is identical
 * across scenarios so the control isolates the transition's own cost.
 */
export async function buildTransitionTimeline({
	page,
	scenario,
	clipAName,
	clipBName,
}: {
	page: Page;
	scenario: TransitionScenarioName;
	clipAName: string;
	clipBName: string;
}): Promise<{
	projectId: string;
	duration: number;
	transitionId: string | null;
}> {
	return page.evaluate(
		({
			scenario,
			clipAName,
			clipBName,
			seam,
			seconds,
			transitionSeconds,
			types,
		}) => {
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
			const clipA = byName(clipAName);
			const clipB = byName(clipBName);

			const timeline = editorWindow.__timelineStore.getState();
			const mainTrack = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!mainTrack) throw new Error("Missing main media track");

			const first = timeline.addElementToTrack(mainTrack.id, {
				type: "media",
				mediaId: clipA.id,
				name: "seam-a",
				startTime: 0,
				duration: seam,
				trimStart: 0,
				trimEnd: 0,
			});
			const second = timeline.addElementToTrack(mainTrack.id, {
				type: "media",
				mediaId: clipB.id,
				name: "seam-b",
				startTime: seam,
				duration: seconds - seam,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!first || !second) throw new Error("Failed to place seam clips");

			let transitionId: string | null = null;
			if (scenario !== "no-transition") {
				const spec = types[scenario];
				transitionId = timeline.addTransition({
					trackId: mainTrack.id,
					fromElementId: first,
					toElementId: second,
					videoMediaIds: new Set([clipA.id, clipB.id]),
					presetId: spec.presetId,
					engine: "qcut",
					type: spec.type,
					...(spec.direction ? { direction: spec.direction } : {}),
					duration: transitionSeconds,
					easing: "linear",
				});
				if (!transitionId) {
					throw new Error(`Failed to add the ${scenario} seam`);
				}
			}

			return {
				projectId,
				duration: timeline.getTotalDuration(),
				transitionId,
			};
		},
		{
			scenario,
			clipAName,
			clipBName,
			seam: TRANSITION_SEAM_SECONDS,
			seconds: TRANSITION_BENCHMARK_SECONDS,
			transitionSeconds: TRANSITION_DURATION_SECONDS,
			types: TRANSITION_SCENARIO_TYPES,
		}
	);
}

export async function measureTransitionScenario({
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
	scenario: TransitionScenarioName;
	outputPath: string;
	profilePath: string;
	token?: string;
	waitForJob: (input: {
		jobId: string;
	}) => Promise<{ status: string; error?: string }>;
	memoryIntervalMs?: number;
}): Promise<{
	measurement: TransitionBenchmarkMeasurement;
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
				// A sample racing teardown must not fail the benchmark.
			}
			await new Promise((resolve) => setTimeout(resolve, memoryIntervalMs));
		}
	})();

	try {
		const { jobId } = await startRendererMuxerExport({
			apiPort,
			projectId,
			outputPath,
			profilePath,
			width: TRANSITION_BENCHMARK_WIDTH,
			height: TRANSITION_BENCHMARK_HEIGHT,
			fps: TRANSITION_BENCHMARK_FPS,
			token,
		});
		const job = await waitForJob({ jobId });
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
	// The shared summary omits the per-frame percentiles, which are the most
	// direct measure of what a transition adds to a single frame.
	const raw = JSON.parse(await readFile(profilePath, "utf8")) as {
		frameTotalP50Ms?: number;
		frameTotalP95Ms?: number;
	};
	return {
		profile,
		measurement: {
			scenario,
			exportWallMs: profile.wallMs,
			frameCount: profile.frameCount,
			frameTotalP50Ms: raw.frameTotalP50Ms ?? 0,
			frameTotalP95Ms: raw.frameTotalP95Ms ?? 0,
			stageTotalsMs: profile.stageTotalsMs,
			counters: profile.counters,
			peakMemoryMbByType: peakByType(samples),
			memorySampleCount: samples.length,
		},
	};
}

export async function writeTransitionBenchmarkReport({
	directory,
	fileName,
	label,
	measurements,
}: {
	directory: string;
	fileName: string;
	label: string;
	measurements: TransitionBenchmarkMeasurement[];
}): Promise<string> {
	const report: TransitionBenchmarkReport = {
		schemaVersion: 1,
		kind: "qcut-transition-export-benchmark-v1",
		label,
		recordedAt: new Date().toISOString(),
		settings: {
			width: TRANSITION_BENCHMARK_WIDTH,
			height: TRANSITION_BENCHMARK_HEIGHT,
			fps: TRANSITION_BENCHMARK_FPS,
			seconds: TRANSITION_BENCHMARK_SECONDS,
			seamSeconds: TRANSITION_SEAM_SECONDS,
			transitionSeconds: TRANSITION_DURATION_SECONDS,
		},
		measurements,
	};
	const filePath = path.join(directory, fileName);
	await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return filePath;
}
