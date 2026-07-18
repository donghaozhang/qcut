import type { TimelineStore } from "@/stores/timeline/types";

export const DEFAULT_ADJUSTMENT_LAYER_DURATION = 5;

type AdjustmentLayerTimeline = Pick<
	TimelineStore,
	"addTrack" | "addElementToTrack" | "getTotalDuration"
>;

export interface CreatedAdjustmentLayer {
	trackId: string;
	elementId: string | null;
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
	const trackId = timeline.addTrack("adjustment");
	const projectEnd = timeline.getTotalDuration();
	const duration = Math.max(
		DEFAULT_ADJUSTMENT_LAYER_DURATION,
		projectEnd - currentTime
	);
	const elementId = timeline.addElementToTrack(trackId, {
		type: "adjustment",
		name,
		startTime: currentTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		opacity: 1,
		effects: [],
		effectChains: [],
	});
	return { trackId, elementId };
}
