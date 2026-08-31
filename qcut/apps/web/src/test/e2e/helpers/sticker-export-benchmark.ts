/**
 * Reproducible sticker export benchmark harness.
 *
 * Every scenario exports the same background clip; only the stickers differ —
 * none, one static, three overlapping static, and one animated (direct-GIF
 * runtime) sticker. That makes the control a true baseline for the sticker
 * pipeline's own cost.
 *
 * The report records the renderer's wall time, the sticker profiler stages
 * (`sticker-timeline`, `sticker-overlay`), per-frame percentiles, resource
 * counters (image cache hits/misses, runtime frames, runtime canvas
 * allocations) and peak process memory.
 */

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getFFmpegPath } from "../../../../../../electron/ffmpeg/paths";
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

const execFileAsync = promisify(execFile);

/** Opaque still used as the static sticker asset. */
export async function generateStickerStill({
	filePath,
	color = "0x20c060",
	size = 256,
}: {
	filePath: string;
	color?: string;
	size?: number;
}): Promise<void> {
	await execFileAsync(getFFmpegPath(), [
		"-y",
		"-f",
		"lavfi",
		"-i",
		`color=c=${color}:s=${size}x${size}`,
		"-frames:v",
		"1",
		filePath,
	]);
}

export const STICKER_BENCHMARK_FPS = 30;
export const STICKER_BENCHMARK_WIDTH = 1280;
export const STICKER_BENCHMARK_HEIGHT = 720;
export const STICKER_BENCHMARK_SECONDS = 6;
export const STICKER_BENCHMARK_FRAMES = Math.round(
	STICKER_BENCHMARK_SECONDS * STICKER_BENCHMARK_FPS
);
/** Stickers occupy the whole timeline so every frame exercises the path. */
export const STICKER_WINDOW = { startTime: 0, duration: 6 } as const;

export type StickerScenarioName =
	| "no-stickers"
	| "single-static"
	| "three-overlapping"
	| "animated-runtime";

/**
 * Normalized placements. The three-overlapping case deliberately overlaps so
 * the composite cost — not just the decode — is exercised.
 */
export const STICKER_PLACEMENTS = [
	{ x: 30, y: 30, width: 26, height: 26 },
	{ x: 42, y: 38, width: 26, height: 26 },
	{ x: 54, y: 46, width: 26, height: 26 },
] as const;

export interface StickerBenchmarkMeasurement {
	scenario: StickerScenarioName;
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

export interface StickerBenchmarkReport {
	schemaVersion: 1;
	kind: "qcut-sticker-export-benchmark-v1";
	label: string;
	recordedAt: string;
	settings: {
		width: number;
		height: number;
		fps: number;
		seconds: number;
	};
	measurements: StickerBenchmarkMeasurement[];
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
 * Builds one sticker scenario over a fixed background clip.
 *
 * Stickers are timeline sticker elements (the shape a user places from the
 * sticker panel); the animated scenario additionally carries the direct-GIF
 * runtime descriptor so the animated code path runs.
 */
export async function buildStickerTimeline({
	page,
	scenario,
	videoName,
	stickerName,
	gifName,
	stickerRuntime,
}: {
	page: Page;
	scenario: StickerScenarioName;
	videoName: string;
	stickerName: string;
	gifName: string;
	stickerRuntime: unknown;
}): Promise<{ projectId: string; duration: number; stickerCount: number }> {
	return page.evaluate(
		({
			scenario,
			videoName,
			stickerName,
			gifName,
			stickerRuntime,
			seconds,
			placements,
			window: stickerWindow,
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

			const timeline = editorWindow.__timelineStore.getState();
			const mainTrack = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!mainTrack) throw new Error("Missing main media track");

			const videoId = timeline.addElementToTrack(mainTrack.id, {
				type: "media",
				mediaId: byName(videoName).id,
				name: "sticker-bench-video",
				startTime: 0,
				duration: seconds,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!videoId) throw new Error("Failed to add the background clip");

			const stickerCount =
				scenario === "no-stickers"
					? 0
					: scenario === "three-overlapping"
						? placements.length
						: 1;
			const animated = scenario === "animated-runtime";
			for (let index = 0; index < stickerCount; index += 1) {
				const placement = placements[index];
				const trackId = timeline.insertTrackAt("sticker", 0);
				const media = byName(animated ? gifName : stickerName);
				const added = timeline.addElementToTrack(trackId, {
					type: "sticker",
					mediaId: media.id,
					stickerId: `bench-sticker-${index}`,
					name: `bench-sticker-${index}`,
					startTime: stickerWindow.startTime,
					duration: stickerWindow.duration,
					trimStart: 0,
					trimEnd: 0,
					// StickerElement carries geometry flat: x/y are the centre as a
					// percentage of the canvas, width/height a percentage of the
					// shorter canvas dimension.
					x: placement.x,
					y: placement.y,
					width: placement.width,
					height: placement.height,
					rotation: 0,
					opacity: 1,
					maintainAspectRatio: true,
					...(animated ? { stickerRuntime } : {}),
				});
				if (!added) throw new Error(`Failed to add sticker ${index}`);
			}

			return {
				projectId,
				duration: timeline.getTotalDuration(),
				stickerCount,
			};
		},
		{
			scenario,
			videoName,
			stickerName,
			gifName,
			stickerRuntime,
			seconds: STICKER_BENCHMARK_SECONDS,
			placements: STICKER_PLACEMENTS,
			window: STICKER_WINDOW,
		}
	);
}

export async function measureStickerScenario({
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
	scenario: StickerScenarioName;
	outputPath: string;
	profilePath: string;
	token?: string;
	waitForJob: (input: {
		jobId: string;
	}) => Promise<{ status: string; error?: string }>;
	memoryIntervalMs?: number;
}): Promise<{
	measurement: StickerBenchmarkMeasurement;
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
			width: STICKER_BENCHMARK_WIDTH,
			height: STICKER_BENCHMARK_HEIGHT,
			fps: STICKER_BENCHMARK_FPS,
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

export async function writeStickerBenchmarkReport({
	directory,
	fileName,
	label,
	measurements,
}: {
	directory: string;
	fileName: string;
	label: string;
	measurements: StickerBenchmarkMeasurement[];
}): Promise<string> {
	const report: StickerBenchmarkReport = {
		schemaVersion: 1,
		kind: "qcut-sticker-export-benchmark-v1",
		label,
		recordedAt: new Date().toISOString(),
		settings: {
			width: STICKER_BENCHMARK_WIDTH,
			height: STICKER_BENCHMARK_HEIGHT,
			fps: STICKER_BENCHMARK_FPS,
			seconds: STICKER_BENCHMARK_SECONDS,
		},
		measurements,
	};
	const filePath = path.join(directory, fileName);
	await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return filePath;
}
