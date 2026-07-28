import { platform } from "@qcut/platform-core";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
	extractImageSources,
	extractStickerSources,
	extractVideoSources,
	extractVideoTransitions,
} from "@/lib/export-cli/sources";
import type { StickerSourceForFilter } from "@/lib/export-cli/types";
import { buildTimelineAssLayers } from "@/lib/export/export-engine-cli-text";
import { hasMediaVisualEdits } from "@/lib/video/video-properties";
import type { ActiveElement } from "@/components/editor/preview-panel/types";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineTrack } from "@/types/timeline";
import {
	createPngObjectUrl,
	revokeObjectUrlAfterCommit,
} from "./preview-frame-url";

type NativeCompositionPreviewStatus = "idle" | "rendering" | "ready" | "error";

export interface NativeCompositionPreviewState {
	url?: string;
	status: NativeCompositionPreviewStatus;
	error?: string;
	cacheHit?: boolean;
	timelineTime?: number;
}

let compositionPreviewRequestSequence = 0;

interface PreviewExportSession {
	sessionId: string;
	framesDir: string;
}

interface StickerSourceCache {
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	width: number;
	height: number;
	fps: number;
	totalDuration: number;
	promise: Promise<StickerSourceForFilter[]>;
}

function isSupportedOverlayType({ type }: { type: string }): boolean {
	return (
		type === "text" ||
		type === "captions" ||
		type === "markdown" ||
		type === "sticker"
	);
}

function hasRasterTextAnimation({
	active,
}: {
	active: ActiveElement;
}): boolean {
	if (active.element.type !== "text") return false;
	const animations = active.element.textAnimations;
	return Boolean(
		animations && (animations.entrance || animations.exit || animations.loop)
	);
}

function hasActiveTimelineSticker({
	tracks,
	timelineTime,
}: {
	tracks: TimelineTrack[];
	timelineTime: number;
}): boolean {
	for (const track of tracks) {
		if (track.hidden || track.type !== "sticker") continue;
		for (const element of track.elements) {
			if (element.hidden || element.type !== "sticker") continue;
			const startTime = element.startTime + element.trimStart;
			const endTime = element.startTime + element.duration - element.trimEnd;
			if (timelineTime >= startTime && timelineTime <= endTime) return true;
		}
	}
	return false;
}

function stickerSourceCacheMatches({
	cache,
	tracks,
	mediaItems,
	width,
	height,
	fps,
	totalDuration,
}: {
	cache: StickerSourceCache;
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	width: number;
	height: number;
	fps: number;
	totalDuration: number;
}): boolean {
	return (
		cache.tracks === tracks &&
		cache.mediaItems === mediaItems &&
		cache.width === width &&
		cache.height === height &&
		cache.fps === fps &&
		cache.totalDuration === totalDuration
	);
}

function getStickerPreviewSources({
	cacheRef,
	sessionRef,
	pendingExtractionsRef,
	tracks,
	mediaItems,
	width,
	height,
	fps,
	totalDuration,
}: {
	cacheRef: MutableRefObject<StickerSourceCache | undefined>;
	sessionRef: MutableRefObject<Promise<PreviewExportSession> | undefined>;
	pendingExtractionsRef: MutableRefObject<
		Set<Promise<StickerSourceForFilter[]>>
	>;
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	width: number;
	height: number;
	fps: number;
	totalDuration: number;
}): Promise<StickerSourceForFilter[]> {
	const cached = cacheRef.current;
	if (
		cached &&
		stickerSourceCacheMatches({
			cache: cached,
			tracks,
			mediaItems,
			width,
			height,
			fps,
			totalDuration,
		})
	) {
		return cached.promise;
	}

	const sessionPromise =
		sessionRef.current ?? platform().ffmpeg.createExportSession();
	sessionRef.current = sessionPromise;
	const promise = sessionPromise.then(({ sessionId }) =>
		extractStickerSources(
			mediaItems,
			sessionId,
			width,
			height,
			totalDuration,
			undefined,
			undefined,
			undefined,
			fps
		)
	);
	cacheRef.current = {
		tracks,
		mediaItems,
		width,
		height,
		fps,
		totalDuration,
		promise,
	};
	pendingExtractionsRef.current.add(promise);
	void promise.then(
		() => pendingExtractionsRef.current.delete(promise),
		() => {
			pendingExtractionsRef.current.delete(promise);
			if (cacheRef.current?.promise === promise) cacheRef.current = undefined;
		}
	);
	return promise;
}

async function cleanupStickerPreviewSession({
	sessionPromise,
	pendingExtractions,
}: {
	sessionPromise?: Promise<PreviewExportSession>;
	pendingExtractions: Promise<StickerSourceForFilter[]>[];
}): Promise<void> {
	await Promise.allSettled(pendingExtractions);
	if (!sessionPromise) return;
	try {
		const { sessionId } = await sessionPromise;
		await platform().ffmpeg.cleanupExportSession(sessionId);
	} catch {
		// Session creation may fail during shutdown; no directory exists to clean.
	}
}

export function canUseNativeCompositionPreview({
	activeElements,
	hasActiveTransition,
	hasSelection = false,
}: {
	activeElements: ActiveElement[];
	hasActiveTransition: boolean;
	hasSelection?: boolean;
}): boolean {
	if (hasSelection) return false;
	let hasVisualMedia = false;
	let hasVisualEdits = false;
	let hasCompositedOverlay = false;
	for (const active of activeElements) {
		if (active.element.type !== "media") {
			if (!isSupportedOverlayType({ type: active.element.type })) return false;
			if (hasRasterTextAnimation({ active })) return false;
			hasCompositedOverlay = true;
			continue;
		}
		if (active.mediaItem?.type === "audio") continue;
		if (
			active.mediaItem?.type !== "video" &&
			active.mediaItem?.type !== "image"
		) {
			return false;
		}
		hasVisualMedia = true;
		hasVisualEdits ||= hasMediaVisualEdits(active.element);
	}
	return (
		hasVisualMedia &&
		(hasVisualEdits || hasCompositedOverlay || hasActiveTransition)
	);
}

export function useNativeCompositionFramePreview({
	enabled,
	tracks,
	mediaItems,
	currentTime,
	totalDuration,
	width,
	height,
	fps,
	backgroundColor,
}: {
	enabled: boolean;
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	currentTime: number;
	totalDuration: number;
	width: number;
	height: number;
	fps: number;
	backgroundColor?: string;
}): NativeCompositionPreviewState {
	const [state, setState] = useState<NativeCompositionPreviewState>({
		status: "idle",
	});
	const previewUrlRef = useRef<string | undefined>(undefined);
	const stickerSourceCacheRef = useRef<StickerSourceCache | undefined>(
		undefined
	);
	const previewSessionRef = useRef<Promise<PreviewExportSession> | undefined>(
		undefined
	);
	const pendingStickerExtractionsRef = useRef(
		new Set<Promise<StickerSourceForFilter[]>>()
	);
	const timelineFrame = Math.round(currentTime * fps);

	useEffect(() => {
		if (
			!enabled ||
			!platform().isElectron ||
			width < 2 ||
			height < 2 ||
			fps < 1 ||
			totalDuration <= 0
		) {
			revokeObjectUrlAfterCommit({ url: previewUrlRef.current });
			previewUrlRef.current = undefined;
			setState({ status: "idle" });
			return;
		}

		let cancelled = false;
		const requestId = `video-composition-${timelineFrame}-${++compositionPreviewRequestSequence}`;
		const frameDuration = 1 / fps;
		const duration = Math.max(frameDuration, totalDuration);
		const timelineTime = Math.min(
			timelineFrame / fps,
			duration - frameDuration
		);
		const render = async () => {
			revokeObjectUrlAfterCommit({ url: previewUrlRef.current });
			previewUrlRef.current = undefined;
			setState({ status: "rendering", timelineTime });
			try {
				const stickerSourcesPromise = hasActiveTimelineSticker({
					tracks,
					timelineTime,
				})
					? getStickerPreviewSources({
							cacheRef: stickerSourceCacheRef,
							sessionRef: previewSessionRef,
							pendingExtractionsRef: pendingStickerExtractionsRef,
							tracks,
							mediaItems,
							width: Math.round(width),
							height: Math.round(height),
							fps,
							totalDuration: duration,
						})
					: Promise.resolve([] as StickerSourceForFilter[]);
				const [videoSources, imageSources, allStickerSources] =
					await Promise.all([
						extractVideoSources(
							tracks,
							mediaItems,
							null,
							undefined,
							undefined,
							fps
						),
						extractImageSources(
							tracks,
							mediaItems,
							null,
							undefined,
							undefined,
							fps
						),
						stickerSourcesPromise,
					]);
				if (videoSources.length === 0 && imageSources.length === 0) {
					throw new Error("No local visual sources are available for preview");
				}
				const stickerSources = allStickerSources.filter(
					(source) =>
						timelineTime >= source.startTime && timelineTime <= source.endTime
				);
				const runtimePlatform = window.electronAPI?.platform;
				const captionPlatform =
					runtimePlatform === "darwin" ||
					runtimePlatform === "win32" ||
					runtimePlatform === "linux"
						? runtimePlatform
						: undefined;
				const textAssLayers = buildTimelineAssLayers({
					tracks,
					canvasWidth: Math.round(width),
					canvasHeight: Math.round(height),
					fps,
					platform: captionPlatform,
				}).layers;
				const result =
					await platform().ffmpeg.renderVideoCompositionFramePreview({
						requestId,
						timelineTime,
						duration,
						width: Math.round(width),
						height: Math.round(height),
						fps,
						backgroundColor,
						videoSources,
						videoTransitions: extractVideoTransitions({
							tracks,
							mediaItems,
							fps,
						}),
						imageSources,
						stickerSources,
						textAssLayers,
					});
				if (cancelled || result.requestId !== requestId) return;
				const data =
					result.pngData instanceof Uint8Array
						? result.pngData
						: new Uint8Array(result.pngData);
				const nextUrl = createPngObjectUrl({ pngData: data });
				previewUrlRef.current = nextUrl;
				setState({
					url: nextUrl,
					status: "ready",
					cacheHit: result.cacheHit,
					timelineTime: result.timelineTime,
				});
			} catch (error) {
				if (cancelled) return;
				setState({
					status: "error",
					error: error instanceof Error ? error.message : String(error),
					timelineTime,
				});
			}
		};
		const timer = window.setTimeout(() => void render(), 120);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
			void platform().ffmpeg.cancelVideoFramePreview(requestId);
		};
	}, [
		backgroundColor,
		enabled,
		fps,
		height,
		mediaItems,
		timelineFrame,
		totalDuration,
		tracks,
		width,
	]);

	useEffect(
		() => () => {
			if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
			const sessionPromise = previewSessionRef.current;
			const pendingExtractions = Array.from(
				pendingStickerExtractionsRef.current
			);
			previewSessionRef.current = undefined;
			stickerSourceCacheRef.current = undefined;
			void cleanupStickerPreviewSession({
				sessionPromise,
				pendingExtractions,
			});
		},
		[]
	);

	return state;
}
