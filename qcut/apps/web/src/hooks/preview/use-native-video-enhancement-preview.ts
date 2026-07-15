import { platform } from "@qcut/platform-core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaEnhancements, MediaFitMode } from "@/types/timeline";
import { hasMediaEnhancements } from "@/lib/video/video-properties";
import {
	createPngObjectUrl,
	revokeObjectUrlAfterCommit,
} from "./preview-frame-url";

type NativeEnhancementPreviewStatus = "idle" | "rendering" | "ready" | "error";

interface NativeEnhancementPreviewState {
	url?: string;
	status: NativeEnhancementPreviewStatus;
	error?: string;
	cacheHit?: boolean;
}

let previewRequestSequence = 0;

function findVideoElement({
	videoId,
}: {
	videoId: string;
}): HTMLVideoElement | undefined {
	return Array.from(document.querySelectorAll<HTMLVideoElement>("video")).find(
		(video) => video.dataset.videoId === videoId
	);
}

function previewDimensions({
	width,
	height,
}: {
	width: number;
	height: number;
}): { width: number; height: number } {
	const safeWidth = Math.max(2, Math.round(width));
	const safeHeight = Math.max(2, Math.round(height));
	const scale = Math.min(1, 960 / Math.max(safeWidth, safeHeight));
	return {
		width: Math.max(2, Math.round(safeWidth * scale)),
		height: Math.max(2, Math.round(safeHeight * scale)),
	};
}

export function useNativeVideoEnhancementPreview({
	enabled,
	elementId,
	videoId,
	sourcePath,
	sourceTimeOffset = 0,
	currentTime,
	width,
	height,
	fps,
	fitMode,
	enhancements,
}: {
	enabled: boolean;
	elementId: string;
	videoId: string;
	sourcePath?: string;
	sourceTimeOffset?: number;
	currentTime: number;
	width: number;
	height: number;
	fps: number;
	fitMode: MediaFitMode;
	enhancements: MediaEnhancements;
}): NativeEnhancementPreviewState {
	const [state, setState] = useState<NativeEnhancementPreviewState>({
		status: "idle",
	});
	const previewUrlRef = useRef<string | undefined>(undefined);
	const timelineFrame = Math.round(currentTime * fps);
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
			!hasMediaEnhancements({ enhancements: enhancementSnapshot })
		) {
			revokeObjectUrlAfterCommit({ url: previewUrlRef.current });
			previewUrlRef.current = undefined;
			setState({ status: "idle" });
			return;
		}

		let cancelled = false;
		let waitingVideo: HTMLVideoElement | undefined;
		const requestId = `video-enhancement-${elementId}-${timelineFrame}-${++previewRequestSequence}`;
		const dimensions = previewDimensions({ width, height });
		const render = async () => {
			const video = findVideoElement({ videoId });
			if (!video) return;
			if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
				waitingVideo = video;
				video.addEventListener("loadeddata", render, { once: true });
				return;
			}
			if (video.seeking) {
				waitingVideo = video;
				video.addEventListener("seeked", render, { once: true });
				return;
			}
			const sourceTime =
				sourceTimeOffset +
				Math.max(
					0,
					Math.min(
						video.currentTime,
						Number.isFinite(video.duration)
							? Math.max(0, video.duration - 1 / Math.max(1, fps))
							: video.currentTime
					)
				);
			setState((current) => ({
				...current,
				status: "rendering",
				error: undefined,
			}));
			try {
				const result = await platform().ffmpeg.renderVideoFramePreview({
					requestId,
					sourcePath,
					sourceTime,
					width: dimensions.width,
					height: dimensions.height,
					fps,
					fitMode,
					enhancements: enhancementSnapshot,
				});
				if (cancelled || result.requestId !== requestId) return;
				const data =
					result.pngData instanceof Uint8Array
						? result.pngData
						: new Uint8Array(result.pngData);
				const nextUrl = createPngObjectUrl({ pngData: data });
				revokeObjectUrlAfterCommit({ url: previewUrlRef.current });
				previewUrlRef.current = nextUrl;
				setState({
					url: nextUrl,
					status: "ready",
					cacheHit: result.cacheHit,
				});
			} catch (error) {
				if (cancelled) return;
				revokeObjectUrlAfterCommit({ url: previewUrlRef.current });
				previewUrlRef.current = undefined;
				setState({
					status: "error",
					error: error instanceof Error ? error.message : String(error),
				});
			}
		};
		const timer = window.setTimeout(() => void render(), 120);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
			waitingVideo?.removeEventListener("seeked", render);
			waitingVideo?.removeEventListener("loadeddata", render);
			void platform().ffmpeg.cancelVideoFramePreview(requestId);
		};
	}, [
		elementId,
		enabled,
		enhancementSnapshot,
		fitMode,
		fps,
		height,
		sourcePath,
		sourceTimeOffset,
		timelineFrame,
		videoId,
		width,
	]);

	useEffect(
		() => () => {
			if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
		},
		[]
	);

	return state;
}
