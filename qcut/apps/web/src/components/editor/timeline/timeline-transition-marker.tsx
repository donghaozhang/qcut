import { ArrowLeftRightIcon } from "lucide-react";
import { TIMELINE_CONSTANTS } from "@/constants/timeline-constants";
import { getTimelineElementDuration } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import {
	resolveClipTransition,
	type ClipTransition,
	type TimelineTrack,
} from "@/types/timeline";

export function TimelineTransitionMarker({
	track,
	transition,
	zoomLevel,
}: {
	track: TimelineTrack;
	transition: ClipTransition;
	zoomLevel: number;
}) {
	const selectedTransition = useTimelineStore(
		(state) => state.selectedTransition
	);
	const selectTransition = useTimelineStore((state) => state.selectTransition);
	const resolved = resolveClipTransition({
		track,
		transition,
		getElementDuration: ({ element }) =>
			getTimelineElementDuration({ element }),
	});
	if (!resolved) return null;

	const pixelsPerSecond = TIMELINE_CONSTANTS.PIXELS_PER_SECOND * zoomLevel;
	const width = Math.max(20, transition.duration * pixelsPerSecond);
	const left = resolved.cutTime * pixelsPerSecond - width / 2;
	const selected =
		selectedTransition?.trackId === track.id &&
		selectedTransition.transitionId === transition.id;
	const handleSelect = () =>
		selectTransition({ trackId: track.id, transitionId: transition.id });

	return (
		<button
			type="button"
			className={cn(
				"absolute top-1/2 z-30 flex h-6 -translate-y-1/2 items-center justify-center rounded border bg-cyan-950/90 text-cyan-100 shadow-sm transition-colors hover:border-cyan-300",
				selected
					? "border-cyan-200 ring-2 ring-cyan-300/40"
					: "border-cyan-500/70"
			)}
			style={{ left, width }}
			onClick={(event) => {
				event.stopPropagation();
				handleSelect();
			}}
			onKeyDown={(event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.stopPropagation();
				handleSelect();
			}}
			data-transition-marker
			data-testid={`timeline-transition-${transition.id}`}
			title={`${transition.presetId} transition, ${transition.duration.toFixed(2)} seconds`}
			aria-label={`Select ${transition.presetId} transition`}
		>
			<ArrowLeftRightIcon className="h-3.5 w-3.5" />
		</button>
	);
}
