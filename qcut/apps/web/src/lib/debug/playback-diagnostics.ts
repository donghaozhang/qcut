/**
 * Playback diagnostics collector.
 *
 * Always-on, near-zero-cost ring buffers that record what actually happens
 * during preview playback: master-clock tick intervals, main-thread long
 * tasks, media element lifecycle events (seeks, stalls, source reloads),
 * presented-frame cadence, and preview re-render counts.
 *
 * The snapshot is pulled from outside the app via
 * `GET /api/claude/playback/diagnostics` (main process executeJavaScript →
 * `window.__qcutPlaybackDiagnostics.snapshot()`), which powers
 * `bun scripts/playback-diagnose.ts`.
 */

import { QCUT_VIDEO_FRAME_EVENT } from "@/lib/preview/preview-health-events";

const CLOCK_RING_SIZE = 900;
const LONG_TASK_RING_SIZE = 200;
const MEDIA_EVENT_RING_SIZE = 400;
const RENDER_RING_SIZE = 900;
const PRESENTED_RING_SIZE = 300;

const MEDIA_EVENT_TYPES = [
	"loadstart",
	"loadedmetadata",
	"seeking",
	"seeked",
	"waiting",
	"stalled",
	"playing",
	"pause",
	"ended",
	"error",
] as const;

interface RingBuffer<T> {
	values: T[];
	capacity: number;
}

function pushRing<T>(ring: RingBuffer<T>, value: T): void {
	ring.values.push(value);
	if (ring.values.length > ring.capacity) {
		ring.values.splice(0, ring.values.length - ring.capacity);
	}
}

interface MediaEventRecord {
	at: number;
	type: string;
	videoId: string;
	src: string;
}

interface LongTaskRecord {
	at: number;
	durationMs: number;
}

interface PresentedFrameRecord {
	at: number;
	videoId: string;
	intervalMs: number | null;
}

interface VideoElementSample {
	videoId: string;
	srcKind: string;
	readyState: number;
	networkState: number;
	paused: boolean;
	currentTime: number;
	playbackRate: number;
	droppedVideoFrames: number | null;
	totalVideoFrames: number | null;
	presentedFramesAttr: number | null;
}

interface PlaybackStoreSample {
	isPlaying: boolean;
	currentTime: number;
	previewQuality: string;
	runtimePreviewQuality: string | null;
	runtimeDiagnosticReason: string | null;
}

export interface PlaybackDiagnosticsSnapshot {
	installed: true;
	now: number;
	installedAt: number;
	clockIntervalsMs: number[];
	lastClockTickAt: number | null;
	longTasks: LongTaskRecord[];
	longTaskTotalCount: number;
	mediaEvents: MediaEventRecord[];
	previewRenderTimestamps: number[];
	previewRenderTotalCount: number;
	presentedFrames: PresentedFrameRecord[];
	videos: VideoElementSample[];
	smoothTimeReason: string | null;
	playbackStore: PlaybackStoreSample | null;
}

interface CollectorState {
	installedAt: number;
	clockIntervals: RingBuffer<number>;
	lastClockTickAt: number | null;
	longTasks: RingBuffer<LongTaskRecord>;
	longTaskTotalCount: number;
	mediaEvents: RingBuffer<MediaEventRecord>;
	renderTimestamps: RingBuffer<number>;
	renderTotalCount: number;
	presented: RingBuffer<PresentedFrameRecord>;
}

let state: CollectorState | null = null;

function srcKind(src: string): string {
	if (!src) return "none";
	if (src.startsWith("blob:")) return "blob";
	try {
		return new URL(src).protocol.replace(":", "");
	} catch {
		return "other";
	}
}

/** Called from the preview panel render body; safe before installation. */
export function recordPreviewPanelRender(): void {
	if (!state) return;
	state.renderTotalCount++;
	pushRing(state.renderTimestamps, performance.now());
}

function sampleVideos(): VideoElementSample[] {
	const samples: VideoElementSample[] = [];
	const videos = document.querySelectorAll<HTMLVideoElement>("video");
	for (const video of videos) {
		let dropped: number | null = null;
		let total: number | null = null;
		try {
			const quality = video.getVideoPlaybackQuality?.();
			if (quality) {
				dropped = quality.droppedVideoFrames;
				total = quality.totalVideoFrames;
			}
		} catch {
			// Not supported — leave null.
		}
		const presentedAttr = video.getAttribute("data-qcut-presented-frames");
		samples.push({
			videoId: video.getAttribute("data-video-id") ?? "unknown",
			srcKind: srcKind(video.currentSrc || video.src || ""),
			readyState: video.readyState,
			networkState: video.networkState,
			paused: video.paused,
			currentTime: video.currentTime,
			playbackRate: video.playbackRate,
			droppedVideoFrames: dropped,
			totalVideoFrames: total,
			presentedFramesAttr: presentedAttr ? Number(presentedAttr) : null,
		});
	}
	return samples;
}

function samplePlaybackStore(): PlaybackStoreSample | null {
	const store = (
		window as unknown as {
			__playbackStore?: {
				getState: () => {
					isPlaying: boolean;
					currentTime: number;
					previewQuality: string;
					runtimePreviewQuality: string | null;
					runtimePreviewQualityDiagnostic: { reason?: string } | null;
				};
			};
		}
	).__playbackStore;
	if (!store) return null;
	try {
		const snapshot = store.getState();
		return {
			isPlaying: snapshot.isPlaying,
			currentTime: snapshot.currentTime,
			previewQuality: snapshot.previewQuality,
			runtimePreviewQuality: snapshot.runtimePreviewQuality,
			runtimeDiagnosticReason:
				snapshot.runtimePreviewQualityDiagnostic?.reason ?? null,
		};
	} catch {
		return null;
	}
}

function buildSnapshot(): PlaybackDiagnosticsSnapshot {
	const current = state;
	if (!current) {
		throw new Error("Playback diagnostics not installed");
	}
	const captureSurface = document.querySelector(
		'[data-testid="preview-capture-surface"]'
	);
	return {
		installed: true,
		now: performance.now(),
		installedAt: current.installedAt,
		clockIntervalsMs: [...current.clockIntervals.values],
		lastClockTickAt: current.lastClockTickAt,
		longTasks: [...current.longTasks.values],
		longTaskTotalCount: current.longTaskTotalCount,
		mediaEvents: [...current.mediaEvents.values],
		previewRenderTimestamps: [...current.renderTimestamps.values],
		previewRenderTotalCount: current.renderTotalCount,
		presentedFrames: [...current.presented.values],
		videos: sampleVideos(),
		smoothTimeReason:
			captureSurface?.getAttribute("data-smooth-time-reason") ?? null,
		playbackStore: samplePlaybackStore(),
	};
}

function resetCollector(): void {
	if (!state) return;
	state.clockIntervals.values = [];
	state.lastClockTickAt = null;
	state.longTasks.values = [];
	state.longTaskTotalCount = 0;
	state.mediaEvents.values = [];
	state.renderTimestamps.values = [];
	state.renderTotalCount = 0;
	state.presented.values = [];
}

/** Idempotent. Installs listeners and exposes window.__qcutPlaybackDiagnostics. */
export function installPlaybackDiagnostics(): void {
	if (state || typeof window === "undefined") return;
	state = {
		installedAt: performance.now(),
		clockIntervals: { values: [], capacity: CLOCK_RING_SIZE },
		lastClockTickAt: null,
		longTasks: { values: [], capacity: LONG_TASK_RING_SIZE },
		longTaskTotalCount: 0,
		mediaEvents: { values: [], capacity: MEDIA_EVENT_RING_SIZE },
		renderTimestamps: { values: [], capacity: RENDER_RING_SIZE },
		renderTotalCount: 0,
		presented: { values: [], capacity: PRESENTED_RING_SIZE },
	};

	window.addEventListener("playback-update", () => {
		const current = state;
		if (!current) return;
		const now = performance.now();
		if (current.lastClockTickAt !== null) {
			pushRing(current.clockIntervals, now - current.lastClockTickAt);
		}
		current.lastClockTickAt = now;
	});

	window.addEventListener("playback-seek", () => {
		if (state) state.lastClockTickAt = null;
	});

	window.addEventListener(QCUT_VIDEO_FRAME_EVENT, (event) => {
		const current = state;
		if (!current) return;
		const detail = (event as CustomEvent).detail as
			| { videoId?: string; intervalMs?: number | null }
			| undefined;
		pushRing(current.presented, {
			at: performance.now(),
			videoId: detail?.videoId ?? "unknown",
			intervalMs:
				typeof detail?.intervalMs === "number" ? detail.intervalMs : null,
		});
	});

	for (const type of MEDIA_EVENT_TYPES) {
		document.addEventListener(
			type,
			(event) => {
				const current = state;
				if (!current) return;
				const target = event.target;
				if (!(target instanceof HTMLVideoElement)) return;
				pushRing(current.mediaEvents, {
					at: performance.now(),
					type,
					videoId: target.getAttribute("data-video-id") ?? "unknown",
					src: srcKind(target.currentSrc || target.src || ""),
				});
			},
			true
		);
	}

	try {
		const observer = new PerformanceObserver((list) => {
			const current = state;
			if (!current) return;
			for (const entry of list.getEntries()) {
				current.longTaskTotalCount++;
				pushRing(current.longTasks, {
					at: entry.startTime,
					durationMs: entry.duration,
				});
			}
		});
		observer.observe({ entryTypes: ["longtask"] });
	} catch {
		// longtask observer unsupported — diagnostics still useful without it.
	}

	(
		window as unknown as {
			__qcutPlaybackDiagnostics?: {
				snapshot: () => PlaybackDiagnosticsSnapshot;
				reset: () => void;
			};
		}
	).__qcutPlaybackDiagnostics = {
		snapshot: buildSnapshot,
		reset: resetCollector,
	};
}
