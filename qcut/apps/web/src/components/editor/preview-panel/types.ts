import type { MediaItem } from "@/stores/media/media-store-types";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";

export interface ActiveElement {
	element: TimelineElement;
	track: TimelineTrack;
	mediaItem: MediaItem | null;
	/**
	 * Mounted ahead of the playhead (hidden) so its media is buffered and
	 * seeked before the cut — the boundary flip then shows a ready frame
	 * instead of a black loading gap. Excluded from "current element" logic.
	 */
	preload?: boolean;
}

export interface PreviewDimensions {
	width: number;
	height: number;
}
