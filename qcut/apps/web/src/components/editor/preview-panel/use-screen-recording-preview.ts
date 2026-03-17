import { useState, useEffect, useMemo } from "react";
import { useScreenRecordingEnhancementStore } from "@/stores/screen-recording-store";
import { computeZoomTransform } from "@/lib/screen-recording/zoom-transform";
import type { ZoomTransform } from "@/lib/screen-recording/zoom-transform";

interface ScreenRecordingPreviewParams {
	isPlaying: boolean;
	currentTime: number;
	previewWidth: number;
	previewHeight: number;
}

interface ScreenRecordingPreviewResult {
	/** Continuous time (seconds) that updates every frame during playback. */
	smoothTime: number;
	/** Current zoom transform, or null when no zoom is active. */
	zoomTransform: ZoomTransform | null;
	/** CSS style to apply zoom, or undefined when identity. */
	zoomStyle: React.CSSProperties | undefined;
	/** Store selectors forwarded for convenience. */
	cursorTelemetry: ReturnType<
		typeof useScreenRecordingEnhancementStore
	> extends { cursorTelemetry: infer T } ? T : never;
	cursorConfig: ReturnType<
		typeof useScreenRecordingEnhancementStore
	> extends { cursorConfig: infer T } ? T : never;
	showCursorOverlay: boolean;
	recordingBackground: ReturnType<
		typeof useScreenRecordingEnhancementStore
	> extends { background: infer T } ? T : never;
	zoomRegions: ReturnType<
		typeof useScreenRecordingEnhancementStore
	> extends { zoomRegions: infer T } ? T : never;
}

/**
 * Encapsulates screen-recording preview state: smooth playback time,
 * zoom transform computation, and store selectors.
 */
export function useScreenRecordingPreview({
	isPlaying,
	currentTime,
	previewWidth,
	previewHeight,
}: ScreenRecordingPreviewParams): ScreenRecordingPreviewResult {
	const cursorTelemetry = useScreenRecordingEnhancementStore(
		(s) => s.cursorTelemetry,
	);
	const cursorConfig = useScreenRecordingEnhancementStore(
		(s) => s.cursorConfig,
	);
	const showCursorOverlay = useScreenRecordingEnhancementStore(
		(s) => s.showCursorOverlay,
	);
	const recordingBackground = useScreenRecordingEnhancementStore(
		(s) => s.background,
	);
	const zoomRegions = useScreenRecordingEnhancementStore(
		(s) => s.zoomRegions,
	);

	// Continuous time for smooth zoom/cursor animation during playback.
	// The main playbackTime only updates on element boundary crossings,
	// so we listen to every playback-update event for per-frame fidelity.
	const [smoothTime, setSmoothTime] = useState(currentTime);
	useEffect(() => {
		if (!isPlaying) {
			setSmoothTime(currentTime);
			return;
		}
		const handleUpdate = (e: Event) => {
			setSmoothTime((e as CustomEvent).detail.time as number);
		};
		window.addEventListener("playback-update", handleUpdate);
		return () => window.removeEventListener("playback-update", handleUpdate);
	}, [isPlaying, currentTime]);

	// Compute zoom transform using preview dimensions (not canvas dimensions)
	// so translation values match the CSS-sized preview container.
	const zoomTransform = useMemo(() => {
		if (zoomRegions.length === 0) return null;
		const timeMs = (isPlaying ? smoothTime : currentTime) * 1000;
		return computeZoomTransform(
			timeMs,
			zoomRegions,
			previewWidth,
			previewHeight,
		);
	}, [zoomRegions, isPlaying, smoothTime, currentTime, previewWidth, previewHeight]);

	const zoomStyle: React.CSSProperties | undefined =
		zoomTransform && zoomTransform.scale > 1.001
			? {
					transform: `scale(${zoomTransform.scale}) translate(${zoomTransform.translateX / zoomTransform.scale}px, ${zoomTransform.translateY / zoomTransform.scale}px)`,
					transformOrigin: "top left",
				}
			: undefined;

	return {
		smoothTime,
		zoomTransform,
		zoomStyle,
		cursorTelemetry,
		cursorConfig,
		showCursorOverlay,
		recordingBackground,
		zoomRegions,
	};
}
