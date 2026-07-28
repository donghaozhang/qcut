/**
 * Sticker Timeline Query
 *
 * Provides synchronous lookups for sticker timing from the timeline store.
 * The timeline is the source of truth for WHEN stickers appear.
 * The overlay store is the source of truth for WHERE/HOW they look.
 */

import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { sortTracksByOrder, type StickerElement } from "@/types/timeline";
import { getTimelineElementDuration } from "@/lib/timeline";

export interface StickerTiming {
	startTime: number;
	endTime: number;
	trackId: string;
	trackOrder: number;
	elementOrder: number;
	element?: StickerElement;
}

/**
 * Build a Map of stickerId → timing from all sticker elements in the timeline.
 * Accounts for trimStart/trimEnd when calculating effective timing.
 */
export function getStickerTimingMap(): Map<string, StickerTiming> {
	const timingMap = new Map<string, StickerTiming>();
	const store = useTimelineStore.getState();
	const tracks = sortTracksByOrder(store._tracks);

	for (let trackOrder = 0; trackOrder < tracks.length; trackOrder++) {
		const track = tracks[trackOrder];
		if (track.hidden || track.type !== "sticker") continue;

		for (
			let elementOrder = 0;
			elementOrder < track.elements.length;
			elementOrder++
		) {
			const element = track.elements[elementOrder];
			if (element.hidden || element.type !== "sticker") continue;

			const stickerEl = element as StickerElement;
			const startTime = stickerEl.startTime;
			const endTime =
				startTime + getTimelineElementDuration({ element: stickerEl });

			timingMap.set(stickerEl.stickerId, {
				startTime,
				endTime,
				trackId: track.id,
				trackOrder,
				elementOrder,
				element: stickerEl,
			});
		}
	}

	return timingMap;
}

/**
 * Get timing for a single sticker by its overlay store ID.
 * Returns null if sticker is not on the timeline.
 */
export function getStickerTiming(stickerId: string): StickerTiming | null {
	const store = useTimelineStore.getState();
	const tracks = sortTracksByOrder(store._tracks);

	for (let trackOrder = 0; trackOrder < tracks.length; trackOrder++) {
		const track = tracks[trackOrder];
		if (track.hidden || track.type !== "sticker") continue;

		for (
			let elementOrder = 0;
			elementOrder < track.elements.length;
			elementOrder++
		) {
			const element = track.elements[elementOrder];
			if (element.hidden || element.type !== "sticker") continue;

			const stickerEl = element as StickerElement;
			if (stickerEl.stickerId === stickerId) {
				const startTime = stickerEl.startTime;
				return {
					startTime,
					endTime:
						startTime + getTimelineElementDuration({ element: stickerEl }),
					trackId: track.id,
					trackOrder,
					elementOrder,
					element: stickerEl,
				};
			}
		}
	}

	return null;
}
