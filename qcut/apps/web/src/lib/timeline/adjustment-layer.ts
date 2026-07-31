import type { TimelineTrack } from "@/types/timeline";
import type { TimelineStore } from "@/stores/timeline/types";

export const DEFAULT_ADJUSTMENT_LAYER_DURATION = 5;

type AdjustmentLayerTimeline = Pick<
	TimelineStore,
	"tracks" | "insertTrackAt" | "addElementToTrack" | "getTotalDuration"
>;

export interface CreatedAdjustmentLayer {
	trackId: string;
	elementId: string | null;
}

/**
 * An adjustment layer only grades the tracks rendered below it, so a track
 * appended at the bottom of the timeline would grade nothing. Insert directly
 * above the topmost media track instead — covering every media/audio track
 * while leaving text and sticker overlays above it untouched, matching the
 * legacy type-priority order (adjustment between sticker and media).
 */
export function adjustmentTrackInsertionIndex({
	tracks,
}: {
	tracks: readonly Pick<TimelineTrack, "type">[];
}): number {
	const topmostMediaIndex = tracks.findIndex((track) => track.type === "media");
	return topmostMediaIndex === -1 ? tracks.length : topmostMediaIndex;
}

export function addAdjustmentLayer({
	timeline,
	currentTime,
	name = "Adjustment Layer",
}: {
	timeline: AdjustmentLayerTimeline;
	currentTime: number;
	name?: string;
}): CreatedAdjustmentLayer {
	const trackId = timeline.insertTrackAt(
		"adjustment",
		adjustmentTrackInsertionIndex({ tracks: timeline.tracks })
	);
	const projectEnd = timeline.getTotalDuration();
	const duration = Math.max(
		DEFAULT_ADJUSTMENT_LAYER_DURATION,
		projectEnd - currentTime
	);
	const elementId = timeline.addElementToTrack(
		trackId,
		{
			type: "adjustment",
			name,
			startTime: currentTime,
			duration,
			trimStart: 0,
			trimEnd: 0,
			opacity: 1,
			effects: [],
			effectChains: [],
		},
		{
			pushHistory: false,
			selectElement: true,
		}
	);
	return { trackId, elementId };
}
