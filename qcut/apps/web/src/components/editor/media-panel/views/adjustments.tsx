import { useMemo } from "react";
import { SlidersHorizontalIcon } from "lucide-react";
import { ColorPropertiesPanel } from "@/components/editor/properties-panel/color-properties-panel";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement } from "@/types/timeline";

export function AdjustmentsView() {
	const selectedElements = useTimelineStore((state) => state.selectedElements);
	const tracks = useTimelineStore((state) => state.tracks);
	const target = useMemo(() => {
		for (const selection of selectedElements) {
			const track = tracks.find(
				(candidate) => candidate.id === selection.trackId
			);
			const element = track?.elements.find(
				(candidate) => candidate.id === selection.elementId
			);
			if (element?.type === "media") {
				return { element: element as MediaElement, trackId: selection.trackId };
			}
		}
		return null;
	}, [selectedElements, tracks]);

	if (!target) {
		return (
			<div
				className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground"
				data-testid="adjustments-view"
			>
				<SlidersHorizontalIcon className="size-6" />
				<p>Select an image or video clip to adjust its color.</p>
			</div>
		);
	}

	return (
		<div className="h-full overflow-y-auto" data-testid="adjustments-view">
			<ColorPropertiesPanel element={target.element} trackId={target.trackId} />
		</div>
	);
}
