"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureMediaColorFrame } from "@/lib/color/color-analysis";
import { processColorImageData } from "@/lib/color/color-pixel-processor";
import { resolveMediaColorAtTime } from "@/lib/color/color-properties";
import { getActiveElements } from "@/lib/export/export-engine-utils";
import { mapMediaTimelineTime } from "@/lib/video/video-timing";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useMediaStore } from "@/stores/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement } from "@/types/timeline";

/** Minimum interval between scope refreshes while playing (~5 Hz). */
const PLAYBACK_REFRESH_INTERVAL_MS = 200;

/**
 * Produces the color-graded frame pixels feeding the scope dock.
 *
 * Samples the topmost visible video/image layer at the playhead, applies its
 * color settings (so scopes reflect the grade), throttles refreshes during
 * playback, and refreshes immediately after seeks.
 */
export function useScopeDockFrame({ enabled }: { enabled: boolean }): {
	imageData: ImageData | null;
} {
	const [imageData, setImageData] = useState<ImageData | null>(null);
	const busyRef = useRef(false);
	const lastRefreshRef = useRef(0);
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const tracks = useTimelineStore((state) => state.tracks);

	const refresh = useCallback(async () => {
		if (busyRef.current) return;
		busyRef.current = true;
		try {
			const time = usePlaybackStore.getState().currentTime;
			const { tracks: liveTracks } = useTimelineStore.getState();
			const mediaItems = useMediaStore.getState().mediaItems;
			const fps = useProjectStore.getState().activeProject?.fps ?? 30;
			const activeElements = getActiveElements(
				liveTracks,
				mediaItems,
				time,
				fps
			);
			// Visual layers render bottom-up, so scan from the end for the
			// topmost element that has drawable pixels.
			let source: {
				element: MediaElement;
				mediaItem: NonNullable<(typeof activeElements)[number]["mediaItem"]>;
			} | null = null;
			for (let index = activeElements.length - 1; index >= 0; index -= 1) {
				const candidate = activeElements[index];
				if (
					candidate.element.type === "media" &&
					!candidate.element.hidden &&
					candidate.mediaItem &&
					(candidate.mediaItem.type === "video" ||
						candidate.mediaItem.type === "image")
				) {
					source = {
						element: candidate.element,
						mediaItem: candidate.mediaItem,
					};
					break;
				}
			}
			if (!source) {
				setImageData(null);
				return;
			}
			const { element, mediaItem } = source;
			const sourceTime =
				(element.trimStart ?? 0) +
				mapMediaTimelineTime({
					element,
					localTimelineTime: time - element.startTime,
					fps,
				}).sourceTime;
			const frame = await captureMediaColorFrame({ mediaItem, sourceTime });
			const settings = resolveMediaColorAtTime({
				element,
				currentTime: time,
				fps,
			});
			const frameSeed = Math.max(
				0,
				Math.round((time - element.startTime) * fps)
			);
			setImageData(
				processColorImageData({
					imageData: frame,
					settings,
					frameSeed,
					timestampSeconds: time,
				})
			);
			lastRefreshRef.current = performance.now();
		} catch {
			// Frame capture can fail transiently (e.g. video not ready) —
			// keep the previous scope contents rather than flickering.
		} finally {
			busyRef.current = false;
		}
	}, []);

	// Paused: refresh whenever the playhead or timeline content changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: store subscriptions deliberately trigger a fresh state pull.
	useEffect(() => {
		if (!enabled) {
			setImageData(null);
			return;
		}
		void refresh();
	}, [enabled, refresh, currentTime, tracks]);

	// Playing: the store time is intentionally stale, so follow the rAF
	// playback events with a throttle, and refresh instantly on seeks.
	useEffect(() => {
		if (!enabled) return;
		const handleTick = () => {
			if (
				performance.now() - lastRefreshRef.current <
				PLAYBACK_REFRESH_INTERVAL_MS
			) {
				return;
			}
			void refresh();
		};
		const handleSeek = () => {
			void refresh();
		};
		window.addEventListener("playback-update", handleTick);
		window.addEventListener("playback-seek", handleSeek);
		return () => {
			window.removeEventListener("playback-update", handleTick);
			window.removeEventListener("playback-seek", handleSeek);
		};
	}, [enabled, refresh]);

	return { imageData };
}
