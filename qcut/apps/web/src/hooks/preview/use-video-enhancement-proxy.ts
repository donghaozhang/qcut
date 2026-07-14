import { platform } from "@qcut/platform-core";
import { useCallback, useEffect, useMemo, useState } from "react";
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
const DEFAULT_PROXY_CHUNK_SECONDS = 12;
const DEFAULT_PROXY_CHUNK_OVERLAP_SECONDS = 2;

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
			!hasMediaEnhancements({ enhancements: enhancementSnapshot }) ||
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
		});
		setState({
			status: "generating",
			progress: 0,
			sourceTimeOffset: sourceStart,
		});
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
		retrySequence,
		sourceDuration,
		sourceHeight,
		sourcePath,
		sourceStart,
		sourceWidth,
	]);

	return { ...state, retry };
}
