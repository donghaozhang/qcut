import { useCallback, useEffect, useRef, useState } from "react";
import {
	isQcutVideoFrameEvent,
	QCUT_VIDEO_FRAME_EVENT,
} from "@/lib/preview/preview-health-events";
import type { TProject } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";

const MIN_OVERLAY_VISIBLE_MS = 120;
const MAX_OVERLAY_VISIBLE_MS = 1200;
const TIMELINE_FRAME_TOLERANCE_SECONDS = 1 / 15;

type FrameCacheLookupStatus = "idle" | "hit" | "miss";

interface CachedFrameOverlay {
	token: number;
	time: number;
	shownAt: number;
}

interface UseCachedPreviewFrameParams {
	activeProject: TProject | null;
	cacheIdentity: string;
	getCachedFrame: (
		time: number,
		tracks: TimelineTrack[],
		mediaItems: MediaItem[],
		activeProject: TProject | null
	) => ImageData | null;
	isPlaying: boolean;
	mediaItems: MediaItem[];
	tracks: TimelineTrack[];
}

export function useCachedPreviewFrame({
	activeProject,
	cacheIdentity,
	getCachedFrame,
	isPlaying,
	mediaItems,
	tracks,
}: UseCachedPreviewFrameParams) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const overlayRef = useRef<CachedFrameOverlay | null>(null);
	const overlayTokenRef = useRef(0);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const maxVisibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cacheIdentityRef = useRef(cacheIdentity);
	const [overlay, setOverlay] = useState<CachedFrameOverlay | null>(null);
	const [lookupStatus, setLookupStatus] =
		useState<FrameCacheLookupStatus>("idle");
	const [presentedFrameRevision, setPresentedFrameRevision] = useState(0);

	const clearHideTimers = useCallback(() => {
		if (hideTimerRef.current) {
			clearTimeout(hideTimerRef.current);
			hideTimerRef.current = null;
		}
		if (maxVisibleTimerRef.current) {
			clearTimeout(maxVisibleTimerRef.current);
			maxVisibleTimerRef.current = null;
		}
	}, []);

	const clearOverlayForToken = useCallback(
		({ token }: { token: number }) => {
			if (overlayRef.current?.token !== token) return;
			clearHideTimers();
			overlayRef.current = null;
			setOverlay(null);
		},
		[clearHideTimers]
	);

	const clearOverlay = useCallback(() => {
		clearHideTimers();
		overlayRef.current = null;
		setOverlay(null);
	}, [clearHideTimers]);

	const requestOverlayHide = useCallback(
		({ token }: { token: number }) => {
			const currentOverlay = overlayRef.current;
			if (!currentOverlay || currentOverlay.token !== token) return;

			const elapsedMs = performance.now() - currentOverlay.shownAt;
			const remainingMs = Math.max(0, MIN_OVERLAY_VISIBLE_MS - elapsedMs);
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
			hideTimerRef.current = setTimeout(() => {
				clearOverlayForToken({ token });
			}, remainingMs);
		},
		[clearOverlayForToken]
	);

	const showCachedFrame = useCallback(
		({ time }: { time: number }) => {
			if (isPlaying) {
				clearOverlay();
				setLookupStatus("idle");
				return;
			}

			const imageData = getCachedFrame(time, tracks, mediaItems, activeProject);
			const canvas = canvasRef.current;
			const context = canvas?.getContext("2d");
			if (!imageData || !canvas || !context) {
				clearOverlay();
				setLookupStatus("miss");
				return;
			}

			try {
				canvas.width = imageData.width;
				canvas.height = imageData.height;
				context.putImageData(imageData, 0, 0);
			} catch {
				clearOverlay();
				setLookupStatus("miss");
				return;
			}

			clearHideTimers();
			const nextOverlay = {
				token: ++overlayTokenRef.current,
				time,
				shownAt: performance.now(),
			};
			overlayRef.current = nextOverlay;
			setOverlay(nextOverlay);
			setLookupStatus("hit");
			maxVisibleTimerRef.current = setTimeout(() => {
				clearOverlayForToken({ token: nextOverlay.token });
			}, MAX_OVERLAY_VISIBLE_MS);
		},
		[
			activeProject,
			clearHideTimers,
			clearOverlay,
			clearOverlayForToken,
			getCachedFrame,
			isPlaying,
			mediaItems,
			tracks,
		]
	);

	useEffect(() => {
		const handlePlaybackSeek = (event: Event) => {
			const detail = (event as CustomEvent<{ time?: unknown }>).detail;
			if (typeof detail?.time !== "number") return;
			showCachedFrame({ time: detail.time });
		};

		window.addEventListener(
			"playback-seek",
			handlePlaybackSeek as EventListener
		);
		return () =>
			window.removeEventListener(
				"playback-seek",
				handlePlaybackSeek as EventListener
			);
	}, [showCachedFrame]);

	useEffect(() => {
		const handlePresentedVideoFrame = (event: Event) => {
			if (!isQcutVideoFrameEvent(event)) return;
			const currentOverlay = overlayRef.current;
			const timelineTime = event.detail.timelineTime;
			if (typeof timelineTime !== "number") return;
			if (!isPlaying) {
				setPresentedFrameRevision((revision) => revision + 1);
			}
			if (!currentOverlay) return;
			if (
				Math.abs(timelineTime - currentOverlay.time) >
				TIMELINE_FRAME_TOLERANCE_SECONDS
			) {
				return;
			}
			requestOverlayHide({ token: currentOverlay.token });
		};

		window.addEventListener(QCUT_VIDEO_FRAME_EVENT, handlePresentedVideoFrame);
		return () =>
			window.removeEventListener(
				QCUT_VIDEO_FRAME_EVENT,
				handlePresentedVideoFrame
			);
	}, [isPlaying, requestOverlayHide]);

	useEffect(() => {
		if (cacheIdentityRef.current === cacheIdentity) return;
		cacheIdentityRef.current = cacheIdentity;
		clearOverlay();
		setLookupStatus("idle");
	}, [cacheIdentity, clearOverlay]);

	useEffect(() => {
		if (!isPlaying) return;
		clearOverlay();
		setLookupStatus("idle");
	}, [clearOverlay, isPlaying]);

	useEffect(
		() => () => {
			clearHideTimers();
		},
		[clearHideTimers]
	);

	return {
		canvasRef,
		cachedFrameTime: overlay?.time ?? null,
		isCachedFrameVisible: overlay !== null,
		lookupStatus,
		presentedFrameRevision,
	};
}
