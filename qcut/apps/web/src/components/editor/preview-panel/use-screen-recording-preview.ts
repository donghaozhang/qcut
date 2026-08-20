import { useMemo } from "react";
import { useScreenRecordingEnhancementStore } from "@/stores/screen-recording-store";
import { computeZoomTransform } from "@/lib/screen-recording/zoom-transform";
import type { ZoomTransform } from "@/lib/screen-recording/zoom-transform";
import type { ZoomRegion } from "@/lib/screen-recording/zoom-region-utils";
import type { CursorTelemetryData } from "@/types/electron/cursor-telemetry";
import type { CursorRenderConfig } from "@/lib/screen-recording/cursor-renderer";
import type { BackgroundConfig } from "@/lib/screen-recording/wallpapers";

interface ScreenRecordingPreviewParams {
	isPlaying: boolean;
	currentTime: number;
	/** Continuous playback time from useSmoothPlaybackTime (gated per-frame). */
	smoothTime: number;
	previewWidth: number;
	previewHeight: number;
}

interface ScreenRecordingPreviewResult {
	/** Current zoom transform, or null when no zoom is active. */
	zoomTransform: ZoomTransform | null;
	/** CSS style to apply zoom, or undefined when identity. */
	zoomStyle: React.CSSProperties | undefined;
	cursorTelemetry: CursorTelemetryData | null;
	cursorConfig: CursorRenderConfig;
	showCursorOverlay: boolean;
	recordingBackground: BackgroundConfig;
	zoomRegions: ZoomRegion[];
}

/**
 * Encapsulates screen-recording preview state: zoom transform computation
 * and store selectors. Smooth playback time is supplied by the caller
 * (useSmoothPlaybackTime) so per-frame updates stay gated in one place.
 */
export function useScreenRecordingPreview({
	isPlaying,
	currentTime,
	smoothTime,
	previewWidth,
	previewHeight,
}: ScreenRecordingPreviewParams): ScreenRecordingPreviewResult {
	const cursorTelemetry = useScreenRecordingEnhancementStore(
		(s) => s.cursorTelemetry
	);
	const cursorConfig = useScreenRecordingEnhancementStore(
		(s) => s.cursorConfig
	);
	const showCursorOverlay = useScreenRecordingEnhancementStore(
		(s) => s.showCursorOverlay
	);
	const recordingBackground = useScreenRecordingEnhancementStore(
		(s) => s.background
	);
	const zoomRegions = useScreenRecordingEnhancementStore((s) => s.zoomRegions);

	// Compute zoom transform using preview dimensions (not canvas dimensions)
	// so translation values match the CSS-sized preview container.
	const zoomTransform = useMemo(() => {
		if (zoomRegions.length === 0) return null;
		const timeMs = (isPlaying ? smoothTime : currentTime) * 1000;
		return computeZoomTransform(
			timeMs,
			zoomRegions,
			previewWidth,
			previewHeight
		);
	}, [
		zoomRegions,
		isPlaying,
		smoothTime,
		currentTime,
		previewWidth,
		previewHeight,
	]);

	const zoomStyle: React.CSSProperties | undefined =
		zoomTransform && zoomTransform.scale > 1.001
			? {
					transform: `scale(${zoomTransform.scale}) translate(${zoomTransform.translateX / zoomTransform.scale}px, ${zoomTransform.translateY / zoomTransform.scale}px)`,
					transformOrigin: "top left",
				}
			: undefined;

	return {
		zoomTransform,
		zoomStyle,
		cursorTelemetry,
		cursorConfig,
		showCursorOverlay,
		recordingBackground,
		zoomRegions,
	};
}
