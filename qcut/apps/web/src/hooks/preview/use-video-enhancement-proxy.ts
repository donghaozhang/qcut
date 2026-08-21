import { platform } from "@qcut/platform-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasMediaEnhancements } from "@/lib/video/video-properties";
import { getMediaSourcePlaybackTime } from "@/lib/video/video-timing";
import type { MediaElement, MediaEnhancements } from "@/types/timeline";

type VideoEnhancementProxyStatus = "idle" | "generating" | "ready" | "error";

interface VideoEnhancementProxyState {
	url?: string;
	status: VideoEnhancementProxyStatus;
	progress: number;
	error?: string;
	cacheHit?: boolean;
	sourceTimeOffset: number;
	retry: () => void;
}

let proxyRequestSequence = 0;
const DEFAULT_PROXY_CHUNK_SECONDS = 30;
const DEFAULT_PROXY_CHUNK_OVERLAP_SECONDS = 2;
/** Seconds before a chunk boundary at which the next chunk is pre-generated
 * into the main-process cache, so the boundary switch never encodes live. */
const PROXY_PREFETCH_LEAD_SECONDS = 10;

export function getVideoEnhancementProxyWindow({
	element,
	currentTime,
	chunkDuration = DEFAULT_PROXY_CHUNK_SECONDS,
	chunkOverlap = DEFAULT_PROXY_CHUNK_OVERLAP_SECONDS,
}: {
	element: MediaElement;
	currentTime: number;
	chunkDuration?: number;
	chunkOverlap?: number;
}): { sourceStart: number; sourceDuration: number } {
	const clipStart = Math.max(0, element.trimStart);
	const clipEnd = Math.max(clipStart, element.duration - element.trimEnd);
	const safeChunkDuration = Math.max(1, chunkDuration);
	const stride = Math.max(1, safeChunkDuration - Math.max(0, chunkOverlap));
	const sourceTime = Math.min(
		clipEnd,
		Math.max(
			clipStart,
			getMediaSourcePlaybackTime({
				element,
				localTimelineTime: Math.max(0, currentTime - element.startTime),
			})
		)
	);
	const alignedStart =
		clipStart + Math.floor((sourceTime - clipStart) / stride) * stride;
	const sourceStart = Math.max(
		clipStart,
		Math.min(alignedStart, Math.max(clipStart, clipEnd - safeChunkDuration))
	);
	return {
		sourceStart: Number(sourceStart.toFixed(6)),
		sourceDuration: Number(
			Math.min(safeChunkDuration, clipEnd - sourceStart).toFixed(6)
		),
	};
}

export interface VideoEnhancementProxyWindow {
	sourceStart: number;
	sourceDuration: number;
}

export interface VideoEnhancementProxyWindowState
	extends VideoEnhancementProxyWindow {
	/** Upcoming chunk to pre-generate, set while inside the prefetch lead. */
	prefetch: VideoEnhancementProxyWindow | null;
}

const EMPTY_PROXY_WINDOW: VideoEnhancementProxyWindowState = {
	sourceStart: 0,
	sourceDuration: 0,
	prefetch: null,
};

function sameProxyWindow(
	previous: VideoEnhancementProxyWindowState,
	next: VideoEnhancementProxyWindowState
): boolean {
	return (
		previous.sourceStart === next.sourceStart &&
		previous.sourceDuration === next.sourceDuration &&
		(previous.prefetch?.sourceStart ?? null) ===
			(next.prefetch?.sourceStart ?? null) &&
		(previous.prefetch?.sourceDuration ?? null) ===
			(next.prefetch?.sourceDuration ?? null)
	);
}

function resolveProxyWindowState({
	element,
	currentTime,
	withPrefetch,
}: {
	element: MediaElement;
	currentTime: number;
	withPrefetch: boolean;
}): VideoEnhancementProxyWindowState {
	const window = getVideoEnhancementProxyWindow({ element, currentTime });
	if (!withPrefetch) return { ...window, prefetch: null };
	const ahead = getVideoEnhancementProxyWindow({
		element,
		currentTime: currentTime + PROXY_PREFETCH_LEAD_SECONDS,
	});
	return {
		...window,
		prefetch: ahead.sourceStart !== window.sourceStart ? ahead : null,
	};
}

/**
 * Current proxy chunk window for a media element, advanced by
 * "playback-update" events during playback instead of per-frame React
 * renders. State only changes when the stride-aligned chunk changes
 * (~once per DEFAULT_PROXY_CHUNK_SECONDS), so proxy-backed playback does
 * not force the preview tree to re-render every frame.
 */
export function useVideoEnhancementProxyWindow({
	element,
	currentTime,
	isPlaying,
}: {
	element: MediaElement | null;
	currentTime: number;
	isPlaying: boolean;
}): VideoEnhancementProxyWindowState {
	const [proxyWindow, setProxyWindow] =
		useState<VideoEnhancementProxyWindowState>(EMPTY_PROXY_WINDOW);
	const elementRef = useRef(element);

	useEffect(() => {
		elementRef.current = element;
	}, [element]);

	// Seeks, pauses, and element switches resolve from the rendered time.
	useEffect(() => {
		const next = element
			? resolveProxyWindowState({ element, currentTime, withPrefetch: false })
			: EMPTY_PROXY_WINDOW;
		setProxyWindow((previous) =>
			sameProxyWindow(previous, next) ? previous : next
		);
	}, [element, currentTime]);

	// Playback advances the chunk from the shared clock events.
	useEffect(() => {
		if (!isPlaying || !element) return;
		const handleUpdate = (event: Event) => {
			const time = (event as CustomEvent).detail.time as number;
			const currentElement = elementRef.current;
			if (!currentElement || !Number.isFinite(time)) return;
			const next = resolveProxyWindowState({
				element: currentElement,
				currentTime: time,
				withPrefetch: true,
			});
			setProxyWindow((previous) =>
				sameProxyWindow(previous, next) ? previous : next
			);
		};
		window.addEventListener("playback-update", handleUpdate);
		return () => window.removeEventListener("playback-update", handleUpdate);
	}, [isPlaying, element]);

	return proxyWindow;
}

export function videoEnhancementProxyDimensions({
	width,
	height,
	maxDimension = 960,
}: {
	width: number;
	height: number;
	maxDimension?: number;
}): { width: number; height: number } {
	const safeWidth = Math.max(2, Number.isFinite(width) ? width : 2);
	const safeHeight = Math.max(2, Number.isFinite(height) ? height : 2);
	const scale = Math.min(1, maxDimension / Math.max(safeWidth, safeHeight));
	const even = ({ value }: { value: number }) =>
		Math.max(2, Math.round((value * scale) / 2) * 2);
	return {
		width: even({ value: safeWidth }),
		height: even({ value: safeHeight }),
	};
}

export function useVideoEnhancementProxy({
	enabled,
	elementId,
	sourcePath,
	sourceStart,
	sourceDuration,
	sourceWidth,
	sourceHeight,
	fps,
	enhancements,
	forceProxy = false,
	maxDimension = 960,
	prefetchWindow = null,
}: {
	enabled: boolean;
	elementId: string;
	sourcePath?: string;
	sourceStart: number;
	sourceDuration: number;
	sourceWidth: number;
	sourceHeight: number;
	fps: number;
	enhancements: MediaEnhancements;
	forceProxy?: boolean;
	maxDimension?: number;
	prefetchWindow?: VideoEnhancementProxyWindow | null;
}): VideoEnhancementProxyState {
	const [retrySequence, setRetrySequence] = useState(0);
	const [state, setState] = useState<Omit<VideoEnhancementProxyState, "retry">>(
		{
			status: "idle",
			progress: 0,
			sourceTimeOffset: 0,
		}
	);
	const retry = useCallback(() => setRetrySequence((value) => value + 1), []);
	const enhancementSnapshot = useMemo<MediaEnhancements>(
		() => ({
			stabilization: enhancements.stabilization,
			denoise: enhancements.denoise,
			clarity: enhancements.clarity,
			upscale: enhancements.upscale,
			relight: enhancements.relight,
			beauty: enhancements.beauty,
		}),
		[
			enhancements.beauty,
			enhancements.clarity,
			enhancements.denoise,
			enhancements.relight,
			enhancements.stabilization,
			enhancements.upscale,
		]
	);

	useEffect(() => {
		if (
			!enabled ||
			!sourcePath ||
			!platform().isElectron ||
			(!forceProxy &&
				!hasMediaEnhancements({ enhancements: enhancementSnapshot })) ||
			!Number.isFinite(sourceDuration) ||
			sourceDuration <= 0
		) {
			setState({ status: "idle", progress: 0, sourceTimeOffset: 0 });
			return;
		}

		let cancelled = false;
		const requestId = `video-proxy-${elementId}-${++proxyRequestSequence}`;
		const dimensions = videoEnhancementProxyDimensions({
			width: sourceWidth,
			height: sourceHeight,
			maxDimension,
		});
		// Keep the previous chunk's url/offset while the next one generates —
		// the old chunk keeps playing through its overlap instead of flapping
		// back to the original source (two src reloads per boundary).
		setState((current) => ({
			...current,
			status: "generating",
			progress: 0,
		}));
		const removeProgressListener =
			platform().ffmpeg.onVideoPreviewProxyProgress((progress) => {
				if (cancelled || progress.requestId !== requestId) return;
				setState((current) => ({
					...current,
					progress: Math.max(0, Math.min(1, progress.progress)),
				}));
			});
		void (async () => {
			try {
				const result = await platform().ffmpeg.renderVideoPreviewProxy({
					requestId,
					sourcePath,
					sourceStart,
					sourceDuration,
					width: dimensions.width,
					height: dimensions.height,
					fps,
					enhancements: enhancementSnapshot,
				});
				if (cancelled || result.requestId !== requestId) return;
				setState({
					url: result.proxyUrl,
					status: "ready",
					progress: 1,
					cacheHit: result.cacheHit,
					sourceTimeOffset: result.sourceStart,
				});
			} catch (error) {
				if (cancelled) return;
				setState({
					status: "error",
					progress: 0,
					error: error instanceof Error ? error.message : String(error),
					sourceTimeOffset: sourceStart,
				});
			} finally {
				removeProgressListener();
			}
		})();

		return () => {
			cancelled = true;
			removeProgressListener();
			void platform().ffmpeg.cancelVideoPreviewProxy(requestId);
		};
	}, [
		elementId,
		enabled,
		enhancementSnapshot,
		fps,
		forceProxy,
		maxDimension,
		retrySequence,
		sourceDuration,
		sourceHeight,
		sourcePath,
		sourceStart,
		sourceWidth,
	]);

	// Warm the main-process cache with the upcoming chunk while the current
	// one still plays, so the boundary switch resolves from cache instead of
	// encoding live. Fire-and-forget: failures fall back to the live encode.
	const activePrefetchRef = useRef<{ requestId: string; key: string } | null>(
		null
	);
	useEffect(() => {
		if (
			!prefetchWindow ||
			prefetchWindow.sourceDuration <= 0 ||
			!enabled ||
			!sourcePath ||
			!platform().isElectron ||
			(!forceProxy &&
				!hasMediaEnhancements({ enhancements: enhancementSnapshot }))
		) {
			return;
		}
		const dimensions = videoEnhancementProxyDimensions({
			width: sourceWidth,
			height: sourceHeight,
			maxDimension,
		});
		const requestId = `video-proxy-prefetch-${elementId}-${++proxyRequestSequence}`;
		const key = `${sourcePath}:${prefetchWindow.sourceStart}:${prefetchWindow.sourceDuration}:${dimensions.width}x${dimensions.height}`;
		// A seek can retarget the prefetch before the previous chunk finished
		// encoding — cancel the superseded job so it stops competing with live
		// preview work. The boundary handoff itself is untouched: the window
		// going null keeps the completed (or completing) prefetch in cache.
		const previous = activePrefetchRef.current;
		if (previous && previous.key !== key) {
			void platform()
				.ffmpeg.cancelVideoPreviewProxy(previous.requestId)
				.catch(() => {});
		}
		activePrefetchRef.current = { requestId, key };
		void platform()
			.ffmpeg.renderVideoPreviewProxy({
				requestId,
				sourcePath,
				sourceStart: prefetchWindow.sourceStart,
				sourceDuration: prefetchWindow.sourceDuration,
				width: dimensions.width,
				height: dimensions.height,
				fps,
				enhancements: enhancementSnapshot,
			})
			.catch(() => {
				// Best-effort warmup only.
			})
			.finally(() => {
				if (activePrefetchRef.current?.requestId === requestId) {
					activePrefetchRef.current = null;
				}
			});
	}, [
		prefetchWindow,
		enabled,
		elementId,
		enhancementSnapshot,
		forceProxy,
		fps,
		maxDimension,
		sourceHeight,
		sourcePath,
		sourceWidth,
	]);

	return { ...state, retry };
}
