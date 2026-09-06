/**
 * Reproducible visual-effects export benchmark harness.
 *
 * Every scenario exports the same background clip; only the effect elements
 * differ — none, one simple CSS-filter effect, three stacked effects, and one
 * animated distortion effect whose parameters drive the advanced (per-pixel)
 * effect path. The control therefore isolates the effect pipeline's own cost.
 *
 * Region effect elements are used deliberately: they read their parameters
 * straight off the timeline element, so a scenario is fully described by the
 * timeline and needs no store access from the test.
 */

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
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

export const EFFECTS_BENCHMARK_FPS = 30;
export const EFFECTS_BENCHMARK_WIDTH = 1280;
export const EFFECTS_BENCHMARK_HEIGHT = 720;
export const EFFECTS_BENCHMARK_SECONDS = 6;
export const EFFECTS_BENCHMARK_FRAMES = Math.round(
	EFFECTS_BENCHMARK_SECONDS * EFFECTS_BENCHMARK_FPS
);

export type EffectsScenarioName =
	| "no-effects"
	| "single-simple"
	| "three-stacked"
	| "animated-distortion";

/** Background clip with a moving pattern so effects have real detail to work on. */
export async function generateEffectsBackground({
	filePath,
	seconds,
	fps = EFFECTS_BENCHMARK_FPS,
	width = EFFECTS_BENCHMARK_WIDTH,
	height = EFFECTS_BENCHMARK_HEIGHT,
}: {
	filePath: string;
	seconds: number;
	fps?: number;
	width?: number;
	height?: number;
}): Promise<void> {
	await execFileAsync(getFFmpegPath(), [
		"-y",
		"-f",
		"lavfi",
		"-i",
		`testsrc2=size=${width}x${height}:rate=${fps}:duration=${seconds}`,
		"-f",
		"lavfi",
		"-i",
		`sine=frequency=220:duration=${seconds}:sample_rate=48000`,
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-colorspace",
		"bt709",
		"-color_primaries",
		"bt709",
		"-color_trc",
		"bt709",
		"-c:a",
		"aac",
		"-shortest",
		filePath,
	]);
}

/**
 * Mean absolute per-pixel difference between two frames, over a rect.
 *
 * Mean colour alone cannot see a geometric distortion — a wave shifts rows
 * sideways without changing the average — so the effect gates compare pixels
 * rather than averages.
 */
export function meanAbsolutePixelDiff({
	left,
	right,
	rect,
}: {
	left: { height: number; pixels: Buffer; width: number };
	right: { height: number; pixels: Buffer; width: number };
	rect: { x0: number; x1: number; y0: number; y1: number };
}): number {
	if (left.width !== right.width || left.height !== right.height) {
		throw new Error("Frame sizes differ");
	}
	const fromX = Math.max(0, Math.floor(rect.x0 * left.width));
	const toX = Math.min(left.width, Math.ceil(rect.x1 * left.width));
	const fromY = Math.max(0, Math.floor(rect.y0 * left.height));
	const toY = Math.min(left.height, Math.ceil(rect.y1 * left.height));
	let total = 0;
	let samples = 0;
	for (let y = fromY; y < toY; y += 1) {
		for (let x = fromX; x < toX; x += 1) {
			const offset = (y * left.width + x) * 3;
			total += Math.abs(left.pixels[offset] - right.pixels[offset]);
			total += Math.abs(left.pixels[offset + 1] - right.pixels[offset + 1]);
			total += Math.abs(left.pixels[offset + 2] - right.pixels[offset + 2]);
			samples += 3;
		}
	}
	return samples === 0 ? 0 : total / samples;
}

export interface EffectsBenchmarkMeasurement {
	scenario: EffectsScenarioName;
	exportWallMs: number;
	frameCount: number;
	frameTotalP50Ms: number;
	frameTotalP95Ms: number;
	stageTotalsMs: Record<string, number>;
	stageCounts: Record<string, number>;
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

export interface EffectsBenchmarkReport {
	schemaVersion: 1;
	kind: "qcut-effects-export-benchmark-v1";
	label: string;
	recordedAt: string;
	settings: {
		width: number;
		height: number;
		fps: number;
		seconds: number;
	};
	measurements: EffectsBenchmarkMeasurement[];
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
 * Effect parameter sets per scenario.
 *
 * `single-simple` stays on the CSS-filter path; `three-stacked` layers three
 * of them; `animated-distortion` sets the wave parameters that route into the
 * advanced per-pixel path, which is the one suspected of allocating a canvas
 * per frame.
 */
export const EFFECT_PARAMETER_SETS: Record<
	Exclude<EffectsScenarioName, "no-effects">,
	Array<{
		name: string;
		effectType: string;
		parameters: Record<string, number>;
	}>
> = {
	"single-simple": [
		{
			name: "bench-brightness",
			effectType: "brightness",
			parameters: { brightness: 18, contrast: 10 },
		},
	],
	"three-stacked": [
		{
			name: "bench-brightness",
			effectType: "brightness",
			parameters: { brightness: 18 },
		},
		{
			name: "bench-saturation",
			effectType: "saturation",
			parameters: { saturation: 30 },
		},
		{
			name: "bench-blur",
			effectType: "blur",
			parameters: { blur: 2, contrast: 12 },
		},
	],
	"animated-distortion": [
		{
			name: "bench-wave",
			effectType: "distortion",
			parameters: { waveAmplitude: 12, waveFrequency: 3 },
		},
	],
};

export async function buildEffectsTimeline({
	page,
	scenario,
	videoName,
}: {
	page: Page;
	scenario: EffectsScenarioName;
	videoName: string;
}): Promise<{ projectId: string; duration: number; effectCount: number }> {
	return page.evaluate(
		({ scenario, videoName, seconds, parameterSets }) => {
			const editorWindow = window as unknown as ExposedWindow;
			const projectId =
				editorWindow.__projectStore.getState().activeProject?.id;
			if (!projectId) throw new Error("No active project");
			const items = editorWindow.__mediaStore.getState().mediaItems;
			const media = items.find((candidate) => candidate.name === videoName);
			if (!media) throw new Error(`Media ${videoName} was not imported`);

			const timeline = editorWindow.__timelineStore.getState();
			const mainTrack = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!mainTrack) throw new Error("Missing main media track");

			const videoId = timeline.addElementToTrack(mainTrack.id, {
				type: "media",
				mediaId: media.id,
				name: "effects-bench-video",
				startTime: 0,
				duration: seconds,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!videoId) throw new Error("Failed to add the background clip");

			const specs =
				scenario === "no-effects" ? [] : (parameterSets[scenario] ?? []);
			for (const [index, spec] of specs.entries()) {
				const trackId = timeline.insertTrackAt("effect", 0);
				const added = timeline.addElementToTrack(trackId, {
					type: "effect",
					name: spec.name,
					startTime: 0,
					duration: seconds,
					trimStart: 0,
					trimEnd: 0,
					effect: {
						id: `bench-effect-${index}`,
						name: spec.name,
						effectType: spec.effectType,
						parameters: spec.parameters,
						duration: seconds,
						enabled: true,
						engine: "qcut",
					},
				});
				if (!added) throw new Error(`Failed to add effect ${spec.name}`);
			}

			return {
				projectId,
				duration: timeline.getTotalDuration(),
				effectCount: specs.length,
			};
		},
		{
			scenario,
			videoName,
			seconds: EFFECTS_BENCHMARK_SECONDS,
			parameterSets: EFFECT_PARAMETER_SETS,
		}
	);
}

export async function measureEffectsScenario({
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
	scenario: EffectsScenarioName;
	outputPath: string;
	profilePath: string;
	token?: string;
	waitForJob: (input: {
		jobId: string;
	}) => Promise<{ status: string; error?: string }>;
	memoryIntervalMs?: number;
}): Promise<{
	measurement: EffectsBenchmarkMeasurement;
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
			width: EFFECTS_BENCHMARK_WIDTH,
			height: EFFECTS_BENCHMARK_HEIGHT,
			fps: EFFECTS_BENCHMARK_FPS,
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
			stageCounts: profile.stageCounts,
			counters: profile.counters,
			peakMemoryMbByType: peakByType(samples),
			memorySampleCount: samples.length,
		},
	};
}

export async function writeEffectsBenchmarkReport({
	directory,
	fileName,
	label,
	measurements,
}: {
	directory: string;
	fileName: string;
	label: string;
	measurements: EffectsBenchmarkMeasurement[];
}): Promise<string> {
	const report: EffectsBenchmarkReport = {
		schemaVersion: 1,
		kind: "qcut-effects-export-benchmark-v1",
		label,
		recordedAt: new Date().toISOString(),
		settings: {
			width: EFFECTS_BENCHMARK_WIDTH,
			height: EFFECTS_BENCHMARK_HEIGHT,
			fps: EFFECTS_BENCHMARK_FPS,
			seconds: EFFECTS_BENCHMARK_SECONDS,
		},
		measurements,
	};
	const filePath = path.join(directory, fileName);
	await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return filePath;
}
