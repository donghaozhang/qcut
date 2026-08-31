/**
 * Reproducible audio export benchmark harness.
 *
 * Builds timelines that isolate audio cost — no audio at all, one sound
 * effect, several stacked sound effects, and sound effects mixed under a
 * video's own soundtrack — exports each through the production renderer-muxer
 * route with the profiler armed, and records the audio sub-stage breakdown
 * (read / decode / schedule / offline render) alongside wall time and peak
 * process memory.
 *
 * Sub-stage totals are what localize the bottleneck: `audio-render` on its own
 * only says the whole pass is slow.
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

export const AUDIO_BENCHMARK_FPS = 30;
export const AUDIO_BENCHMARK_WIDTH = 1280;
export const AUDIO_BENCHMARK_HEIGHT = 720;
export const AUDIO_BENCHMARK_SECONDS = 6;
export const AUDIO_BENCHMARK_FRAMES = Math.round(
	AUDIO_BENCHMARK_SECONDS * AUDIO_BENCHMARK_FPS
);
/** Sample rate the offline render always targets. */
export const AUDIO_BENCHMARK_SAMPLE_RATE = 48_000;

export type AudioScenarioName =
	| "silent-video"
	| "single-effect"
	| "stacked-effects"
	| "video-audio-plus-effects";

export interface AudioScenarioMedia {
	/** Video whose own soundtrack participates in the mix. */
	videoWithAudio: string;
	/** Video with no audio stream at all. */
	videoSilent: string;
	/** Short sound-effect files, layered by the stacked scenario. */
	effects: readonly string[];
}

export interface AudioBenchmarkMeasurement {
	scenario: AudioScenarioName;
	/**
	 * Export wall time as the renderer itself measured it. The harness also
	 * observes wall time by polling the job endpoint, but that poll runs every
	 * 500 ms and so cannot resolve sub-second differences — this is the metric
	 * to compare runs on.
	 */
	exportWallMs: number;
	/** Poll-quantized wall time, kept for continuity with other suites. */
	wallMs: number;
	frameCount: number;
	audioRenderMs: number;
	audioStageMs: Record<string, number>;
	counters: Record<string, number>;
	peakMemoryMbByType: Record<string, number>;
	memorySampleCount: number;
	/** Fidelity fingerprint, recorded so runs can be compared numerically. */
	fidelity?: {
		integratedLufs: number;
		truePeakDb: number;
		sampleRate: number;
		channels: number;
		durationSeconds: number;
		rmsWindows: number[];
	};
}

export interface AudioBenchmarkReport {
	schemaVersion: 1;
	kind: "qcut-audio-export-benchmark-v1";
	label: string;
	recordedAt: string;
	settings: {
		width: number;
		height: number;
		fps: number;
		seconds: number;
		sampleRate: number;
	};
	measurements: AudioBenchmarkMeasurement[];
}

/** Sound effect: a short decaying tone, distinct per index. */
export async function generateSoundEffect({
	filePath,
	toneHz,
	seconds = 1.5,
}: {
	filePath: string;
	toneHz: number;
	seconds?: number;
}): Promise<void> {
	await execFileAsync(getFFmpegPath(), [
		"-y",
		"-f",
		"lavfi",
		"-i",
		`sine=frequency=${toneHz}:duration=${seconds}:sample_rate=48000`,
		"-af",
		`afade=t=out:st=${Math.max(0, seconds - 0.4)}:d=0.4`,
		"-c:a",
		"pcm_s16le",
		filePath,
	]);
}

/** Video with no audio stream, so the mix contains only what we add. */
export async function generateSilentVideo({
	filePath,
	seconds,
	fps = AUDIO_BENCHMARK_FPS,
	width = AUDIO_BENCHMARK_WIDTH,
	height = AUDIO_BENCHMARK_HEIGHT,
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
		"-an",
		filePath,
	]);
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
 * Builds one audio scenario. The video layer is identical across scenarios
 * (one full-length clip) so any wall-time difference is attributable to the
 * audio work rather than to picture compositing.
 */
export async function buildAudioScenarioTimeline({
	page,
	scenario,
	media,
}: {
	page: Page;
	scenario: AudioScenarioName;
	media: AudioScenarioMedia;
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

			// Scenarios that should contribute no source audio use the silent
			// video; the mixing scenario uses the one with a soundtrack.
			const videoName =
				scenario === "video-audio-plus-effects"
					? media.videoWithAudio
					: media.videoSilent;
			const videoId = timeline.addElementToTrack(mainTrack.id, {
				type: "media",
				mediaId: byName(videoName).id,
				name: "bench-video",
				startTime: 0,
				duration: seconds,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!videoId) throw new Error("Failed to add the video layer");

			const effectCount =
				scenario === "silent-video"
					? 0
					: scenario === "single-effect"
						? 1
						: media.effects.length;
			for (let index = 0; index < effectCount; index += 1) {
				const trackId = timeline.addTrack("audio");
				// Stagger the effects so they overlap without stacking at one
				// instant: a realistic layered-sound-effect timeline.
				const startTime = Number((index * 0.75).toFixed(3));
				const added = timeline.addElementToTrack(trackId, {
					type: "media",
					mediaId: byName(media.effects[index]).id,
					name: `bench-effect-${index}`,
					startTime,
					duration: 1.5,
					trimStart: 0,
					trimEnd: 0,
				});
				if (!added) throw new Error(`Failed to add effect ${index}`);
			}

			return { projectId, duration: timeline.getTotalDuration() };
		},
		{ scenario, media, seconds: AUDIO_BENCHMARK_SECONDS }
	);
}

/** Audio-related profiler stages, in pipeline order. */
export const AUDIO_STAGES = [
	"audio-render",
	"audio-collect",
	"audio-read-bytes",
	"audio-decode-data",
	"audio-decode",
	"audio-pitch-setup",
	"audio-schedule",
	"audio-offline-render",
] as const;

export async function measureAudioScenario({
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
	scenario: AudioScenarioName;
	outputPath: string;
	profilePath: string;
	token?: string;
	waitForJob: (input: {
		jobId: string;
	}) => Promise<{ status: string; error?: string }>;
	memoryIntervalMs?: number;
}): Promise<{
	measurement: AudioBenchmarkMeasurement;
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

	const startedAt = Date.now();
	let wallMs = 0;
	try {
		const { jobId } = await startRendererMuxerExport({
			apiPort,
			projectId,
			outputPath,
			profilePath,
			width: AUDIO_BENCHMARK_WIDTH,
			height: AUDIO_BENCHMARK_HEIGHT,
			fps: AUDIO_BENCHMARK_FPS,
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
	const audioStageMs: Record<string, number> = {};
	for (const stage of AUDIO_STAGES) {
		const total = profile.stageTotalsMs[stage];
		if (typeof total === "number") audioStageMs[stage] = total;
	}
	return {
		profile,
		measurement: {
			scenario,
			exportWallMs: profile.wallMs,
			wallMs,
			frameCount: profile.frameCount,
			audioRenderMs: profile.stageTotalsMs["audio-render"] ?? 0,
			audioStageMs,
			counters: profile.counters,
			peakMemoryMbByType: peakByType(samples),
			memorySampleCount: samples.length,
		},
	};
}

export async function writeAudioBenchmarkReport({
	directory,
	fileName,
	label,
	measurements,
}: {
	directory: string;
	fileName: string;
	label: string;
	measurements: AudioBenchmarkMeasurement[];
}): Promise<string> {
	const report: AudioBenchmarkReport = {
		schemaVersion: 1,
		kind: "qcut-audio-export-benchmark-v1",
		label,
		recordedAt: new Date().toISOString(),
		settings: {
			width: AUDIO_BENCHMARK_WIDTH,
			height: AUDIO_BENCHMARK_HEIGHT,
			fps: AUDIO_BENCHMARK_FPS,
			seconds: AUDIO_BENCHMARK_SECONDS,
			sampleRate: AUDIO_BENCHMARK_SAMPLE_RATE,
		},
		measurements,
	};
	const filePath = path.join(directory, fileName);
	await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return filePath;
}
