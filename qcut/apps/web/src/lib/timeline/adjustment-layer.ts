import type { TimelineTrack } from "@/types/timeline";
import type { TimelineStore } from "@/stores/timeline/types";

export const DEFAULT_ADJUSTMENT_LAYER_DURATION = 5;

type AdjustmentLayerTimeline = Pick<
	TimelineStore,
	"tracks" | "insertTrackAt" | "addElementToTrack" | "getTotalDuration"
> &
	Partial<Pick<TimelineStore, "overlayStacking">>;

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
	overlayStacking = "byType",
}: {
	tracks: readonly Pick<TimelineTrack, "type">[];
	overlayStacking?: import("@/types/project").OverlayStackingMode;
}): number {
	// byArrival (T6): the newest overlay lane stacks on top of everything —
	// including text/sticker overlays — matching Jianying's floating layers.
	if (overlayStacking === "byArrival") return 0;
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
		adjustmentTrackInsertionIndex({
			tracks: timeline.tracks,
			overlayStacking: timeline.overlayStacking,
		})
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
