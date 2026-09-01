/**
 * High-frame-rate preview benchmark helpers.
 *
 * Drives real playback in the editor and reads the app's own playback
 * diagnostics collector (`window.__qcutPlaybackDiagnostics`), the same data
 * source `scripts/playback-diagnose.ts` reports over HTTP, so the numbers here
 * are comparable to that tool rather than a parallel implementation.
 *
 * Media fixtures are generated with ffmpeg at test time and kept out of the
 * repository.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";

export interface PreviewClipSpec {
	fps: number;
	seconds: number;
	width: number;
	height: number;
	/** Distinguishes layers visually and by content hash. */
	variant: "primary" | "secondary";
}

/** Generates a deterministic clip. Cached by filename across runs. */
export function generatePreviewClip({
	directory,
	spec,
}: {
	directory: string;
	spec: PreviewClipSpec;
}): string {
	mkdirSync(directory, { recursive: true });
	const filePath = path.join(
		directory,
		`preview-${spec.width}x${spec.height}p${spec.fps}-${spec.variant}.mp4`
	);
	if (existsSync(filePath)) return filePath;
	// testsrc2 gives per-frame-distinct content, which makes frame identity and
	// presented-frame counts meaningful; the hue split separates the layers.
	const source =
		spec.variant === "primary"
			? `testsrc2=size=${spec.width}x${spec.height}:rate=${spec.fps}:duration=${spec.seconds}`
			: `smptebars=size=${spec.width}x${spec.height}:rate=${spec.fps}:duration=${spec.seconds}`;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			source,
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-pix_fmt",
			"yuv420p",
			"-g",
			String(spec.fps),
			"-colorspace",
			"bt709",
			"-color_primaries",
			"bt709",
			"-color_trc",
			"bt709",
			"-movflags",
			"+faststart",
			filePath,
		],
		{ stdio: "pipe" }
	);
	return filePath;
}

export interface DiagnosticsSnapshot {
	installed: boolean;
	now: number;
	clockIntervalsMs: number[];
	presentedFrames: Array<{
		at: number;
		videoId: string;
		intervalMs: number | null;
	}>;
	previewRenderTotalCount: number;
	longTaskTotalCount: number;
	longTaskTotalDurationMs: number;
	mediaEvents: Array<{ at: number; type: string; videoId: string }>;
	videos: Array<{
		videoId: string;
		droppedVideoFrames: number | null;
		totalVideoFrames: number | null;
		currentTime: number;
		playbackRate: number;
		paused: boolean;
		readyState: number;
	}>;
	smoothTimeReason: string | null;
	playbackStore: { isPlaying: boolean; currentTime: number } | null;
}

/** Reads the app's diagnostics snapshot. */
export async function snapshotDiagnostics({
	page,
}: {
	page: Page;
}): Promise<DiagnosticsSnapshot> {
	return await page.evaluate(() => {
		const api = (
			window as unknown as {
				__qcutPlaybackDiagnostics?: { snapshot: () => unknown };
			}
		).__qcutPlaybackDiagnostics;
		if (!api) {
			throw new Error(
				"Playback diagnostics collector is not installed — is the editor open?"
			);
		}
		return api.snapshot() as unknown as DiagnosticsSnapshot;
	});
}

/** Clears the collector's ring buffers. */
export async function resetDiagnostics({
	page,
}: {
	page: Page;
}): Promise<void> {
	await page.evaluate(() => {
		const api = (
			window as unknown as {
				__qcutPlaybackDiagnostics?: { reset: () => void };
			}
		).__qcutPlaybackDiagnostics;
		api?.reset();
	});
}

export interface PlaybackMetrics {
	scenario: string;
	windowSeconds: number;
	/** Master clock ticks per second, from the rAF loop's dispatch intervals. */
	clockHz: number;
	clockIntervalP50Ms: number;
	clockIntervalP95Ms: number;
	/**
	 * Presented video frames per second, per video element, derived from the
	 * collector's requestVideoFrameCallback records.
	 *
	 * The collector keeps those records in a 300-entry ring, so with two 60fps
	 * layers it saturates in about 2.5s and under-reports. `saturated` says when
	 * that happened; prefer `presentedFpsByQuality` in that case.
	 */
	presentedFpsByVideo: Record<string, number>;
	bestPresentedFps: number;
	presentedRecordsSaturated: boolean;
	/**
	 * Presented video frames per second from getVideoPlaybackQuality's
	 * cumulative totalVideoFrames counter, which no ring buffer truncates.
	 * This is the authoritative presentation rate.
	 */
	presentedFpsByQuality: Record<string, number>;
	bestQualityFps: number;
	presentIntervalP50Ms: number;
	presentIntervalP95Ms: number;
	droppedFrames: number;
	totalFrames: number;
	stalls: number;
	seeks: number;
	longTasks: number;
	longTaskMs: number;
	previewRenders: number;
	smoothTimeReason: string | null;
	cpuPercent: number;
	peakMemoryMb: number;
}

/** The collector's presented-frame ring capacity (PRESENTED_RING_SIZE). */
export const PRESENTED_RING_CAPACITY = 300;

export interface FrameRateInputs {
	presentedRecords: ReadonlyArray<{ videoId: string }>;
	videosBefore: ReadonlyArray<{
		videoId: string;
		totalVideoFrames: number | null;
		droppedVideoFrames: number | null;
	}>;
	videosAfter: ReadonlyArray<{
		videoId: string;
		totalVideoFrames: number | null;
		droppedVideoFrames: number | null;
	}>;
	elapsedSeconds: number;
	ringCapacity?: number;
}

export interface FrameRates {
	/** From requestVideoFrameCallback records — truncated by the ring buffer. */
	presentedFpsByVideo: Record<string, number>;
	/** From getVideoPlaybackQuality totals — authoritative. */
	presentedFpsByQuality: Record<string, number>;
	presentedRecordsSaturated: boolean;
	droppedFrames: number;
	totalFrames: number;
}

/**
 * Derives presentation rates from a diagnostics window.
 *
 * Two traps this encodes, both of which produce a convincing but false "60fps
 * collapsed to 30fps" reading:
 *  - the collector's presented-frame ring holds only `ringCapacity` records, so
 *    two 60fps layers saturate it in a few seconds and each appears to present
 *    at half rate;
 *  - requestVideoFrameCallback runs on the main thread, so a busy main thread
 *    suppresses the callbacks without suppressing presentation.
 * `getVideoPlaybackQuality` is immune to both, so it is the authority.
 */
export function deriveFrameRates({
	presentedRecords,
	videosBefore,
	videosAfter,
	elapsedSeconds,
	ringCapacity = PRESENTED_RING_CAPACITY,
}: FrameRateInputs): FrameRates {
	const seconds = Math.max(0.001, elapsedSeconds);
	const counts: Record<string, number> = {};
	for (const record of presentedRecords) {
		counts[record.videoId] = (counts[record.videoId] ?? 0) + 1;
	}
	const presentedFpsByVideo: Record<string, number> = {};
	for (const [videoId, count] of Object.entries(counts)) {
		presentedFpsByVideo[videoId] = Number((count / seconds).toFixed(2));
	}

	const baseline = new Map(
		videosBefore.map((video) => [video.videoId, video] as const)
	);
	const presentedFpsByQuality: Record<string, number> = {};
	let droppedFrames = 0;
	let totalFrames = 0;
	for (const video of videosAfter) {
		const before = baseline.get(video.videoId);
		if (video.droppedVideoFrames !== null) {
			droppedFrames +=
				video.droppedVideoFrames - (before?.droppedVideoFrames ?? 0);
		}
		if (video.totalVideoFrames !== null) {
			const delta = video.totalVideoFrames - (before?.totalVideoFrames ?? 0);
			totalFrames += delta;
			presentedFpsByQuality[video.videoId] = Number(
				(delta / seconds).toFixed(2)
			);
		}
	}

	return {
		droppedFrames,
		presentedFpsByQuality,
		presentedFpsByVideo,
		presentedRecordsSaturated: presentedRecords.length >= ringCapacity,
		totalFrames,
	};
}

function percentile(values: readonly number[], fraction: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(
		sorted.length - 1,
		Math.floor(sorted.length * fraction)
	);
	return Number(sorted[index].toFixed(2));
}

/** Sums renderer CPU and memory across Electron's processes. */
export async function readProcessMetrics({
	electronApp,
}: {
	electronApp: ElectronApplication;
}): Promise<{ cpuPercent: number; memoryMb: number }> {
	return await electronApp.evaluate(({ app }) => {
		const metrics = app.getAppMetrics();
		let cpuPercent = 0;
		let memoryKb = 0;
		for (const entry of metrics) {
			cpuPercent += entry.cpu?.percentCPUUsage ?? 0;
			memoryKb += entry.memory?.workingSetSize ?? 0;
		}
		return { cpuPercent, memoryMb: memoryKb / 1024 };
	});
}

/**
 * Plays from `startTime` for `windowSeconds` and derives playback health from
 * the app's own collector.
 */
export async function measurePlaybackWindow({
	page,
	electronApp,
	scenario,
	windowSeconds,
	startTime = 0,
}: {
	page: Page;
	electronApp: ElectronApplication;
	scenario: string;
	windowSeconds: number;
	startTime?: number;
}): Promise<PlaybackMetrics> {
	await page.evaluate((seekTo) => {
		const playback = (
			window as unknown as {
				__playbackStore: {
					getState: () => { seek: (t: number) => void; pause: () => void };
				};
			}
		).__playbackStore.getState();
		playback.pause();
		playback.seek(seekTo);
	}, startTime);
	// Let the seek settle before the measurement window opens.
	await page.waitForTimeout(600);
	await resetDiagnostics({ page });

	const before = await snapshotDiagnostics({ page });
	const beforeVideos = new Map(
		before.videos.map((video) => [video.videoId, video])
	);

	await page.evaluate((durationMs) => {
		const playback = (
			window as unknown as {
				__playbackStore: {
					getState: () => { play: () => void; pause: () => void };
				};
			}
		).__playbackStore.getState();
		playback.play();
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				(
					window as unknown as {
						__playbackStore: { getState: () => { pause: () => void } };
					}
				).__playbackStore
					.getState()
					.pause();
				resolve();
			}, durationMs);
		});
	}, windowSeconds * 1000);

	const after = await snapshotDiagnostics({ page });
	const processMetrics = await readProcessMetrics({ electronApp });

	const elapsedSeconds = Math.max(0.001, (after.now - before.now) / 1000);
	const clockIntervals = after.clockIntervalsMs;
	const presentIntervals = after.presentedFrames
		.map((record) => record.intervalMs)
		.filter((value): value is number => typeof value === "number");

	const rates = deriveFrameRates({
		elapsedSeconds,
		presentedRecords: after.presentedFrames,
		videosAfter: after.videos,
		videosBefore: before.videos,
	});

	const stalls = after.mediaEvents.filter((event) =>
		["waiting", "stalled"].includes(event.type)
	).length;
	const seeks = after.mediaEvents.filter((event) =>
		["seeking", "seeked"].includes(event.type)
	).length;

	return {
		bestPresentedFps: Math.max(0, ...Object.values(rates.presentedFpsByVideo)),
		bestQualityFps: Math.max(0, ...Object.values(rates.presentedFpsByQuality)),
		presentedFpsByQuality: rates.presentedFpsByQuality,
		presentedRecordsSaturated: rates.presentedRecordsSaturated,
		clockHz: Number((clockIntervals.length / elapsedSeconds).toFixed(2)),
		clockIntervalP50Ms: percentile(clockIntervals, 0.5),
		clockIntervalP95Ms: percentile(clockIntervals, 0.95),
		cpuPercent: Number(processMetrics.cpuPercent.toFixed(1)),
		droppedFrames: rates.droppedFrames,
		longTaskMs: Number(after.longTaskTotalDurationMs.toFixed(1)),
		longTasks: after.longTaskTotalCount,
		peakMemoryMb: Number(processMetrics.memoryMb.toFixed(1)),
		presentIntervalP50Ms: percentile(presentIntervals, 0.5),
		presentIntervalP95Ms: percentile(presentIntervals, 0.95),
		presentedFpsByVideo: rates.presentedFpsByVideo,
		previewRenders: after.previewRenderTotalCount,
		scenario,
		seeks,
		smoothTimeReason: after.smoothTimeReason,
		stalls,
		totalFrames: rates.totalFrames,
		windowSeconds: Number(elapsedSeconds.toFixed(2)),
	};
}

/**
 * Attaches a test-only `playback-update` listener that burns `busyMs` of main
 * thread per tick, which halves (or worse) the rAF master clock rate.
 *
 * This exists to answer the causal question directly: if a slow master clock
 * genuinely throttled video presentation, forcing the clock down would drag
 * presented FPS down with it. Production code is untouched; the listener is
 * added and removed from the test.
 */
export async function installClockLoad({
	page,
	busyMs,
}: {
	page: Page;
	busyMs: number;
}): Promise<void> {
	await page.evaluate((budget) => {
		const target = window as unknown as {
			__hifpsClockLoad?: (event: Event) => void;
		};
		if (target.__hifpsClockLoad) {
			window.removeEventListener("playback-update", target.__hifpsClockLoad);
		}
		const listener = (): void => {
			const until = performance.now() + budget;
			// Deliberate busy-wait: a sleep would yield and not stretch the tick.
			while (performance.now() < until) {
				// spin
			}
		};
		target.__hifpsClockLoad = listener;
		window.addEventListener("playback-update", listener);
	}, busyMs);
}

/** Removes the synthetic main-thread load. */
export async function removeClockLoad({ page }: { page: Page }): Promise<void> {
	await page.evaluate(() => {
		const target = window as unknown as {
			__hifpsClockLoad?: (event: Event) => void;
		};
		if (!target.__hifpsClockLoad) return;
		window.removeEventListener("playback-update", target.__hifpsClockLoad);
		target.__hifpsClockLoad = undefined;
	});
}

/**
 * Seeks to each time and hashes a screenshot of the preview surface.
 *
 * The fixtures are per-frame distinct, so these hashes are a frame-identity
 * fixture: the same time must always show the same frame, and different times
 * must show different frames.
 */
export async function capturePreviewFrameHashes({
	page,
	times,
}: {
	page: Page;
	times: readonly number[];
}): Promise<Array<{ time: number; hash: string }>> {
	const { createHash } = await import("node:crypto");
	const results: Array<{ time: number; hash: string }> = [];
	const surface = page.getByTestId("preview-panel");
	for (const time of times) {
		await page.evaluate((seekTo) => {
			(
				window as unknown as {
					__playbackStore: { getState: () => { seek: (t: number) => void } };
				}
			).__playbackStore
				.getState()
				.seek(seekTo);
		}, time);
		await page.evaluate(
			() =>
				new Promise<void>((resolve) => {
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
				})
		);
		// Give the decoder a moment to present the seeked frame.
		await page.waitForTimeout(250);
		const shot = await surface.screenshot({ animations: "disabled" });
		results.push({
			hash: createHash("sha256").update(shot).digest("hex").slice(0, 16),
			time,
		});
	}
	return results;
}

/** Formats one measurement for the test log. */
export function formatPlaybackMetrics({
	metrics,
}: {
	metrics: PlaybackMetrics;
}): string {
	return (
		`[hifps] ${metrics.scenario.padEnd(24)} ` +
		`clockHz=${metrics.clockHz.toFixed(1).padStart(6)} ` +
		`qualityFps=${metrics.bestQualityFps.toFixed(1).padStart(6)} ` +
		`rvfcFps=${metrics.bestPresentedFps.toFixed(1).padStart(6)}${metrics.presentedRecordsSaturated ? "(SAT)" : "     "} ` +
		`window=${metrics.windowSeconds.toFixed(2)}s ` +
		`presentP50=${metrics.presentIntervalP50Ms.toFixed(1).padStart(6)}ms ` +
		`presentP95=${metrics.presentIntervalP95Ms.toFixed(1).padStart(6)}ms ` +
		`clockP50=${metrics.clockIntervalP50Ms.toFixed(1).padStart(6)}ms ` +
		`clockP95=${metrics.clockIntervalP95Ms.toFixed(1).padStart(6)}ms ` +
		`dropped=${metrics.droppedFrames} total=${metrics.totalFrames} ` +
		`stalls=${metrics.stalls} longTasks=${metrics.longTasks}(${metrics.longTaskMs}ms) ` +
		`renders=${metrics.previewRenders} cpu=${metrics.cpuPercent}% mem=${metrics.peakMemoryMb}MB ` +
		`smooth=${metrics.smoothTimeReason ?? "none"}`
	);
}
