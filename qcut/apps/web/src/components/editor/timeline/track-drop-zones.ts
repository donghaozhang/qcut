import type { TimelineTrack, TrackType } from "@/types/timeline";

/**
 * Zone math for drops that leave the lane stack vertically.
 *
 * Dragging a clip above the top lane or below the bottom one grows the
 * timeline with a new lane (the gesture Jianying users reach for to make a
 * picture-in-picture track — docs/task/timeline-rules-vs-jianying,
 * experiment E3). Anywhere inside the stack stays the per-lane handlers'
 * business: those already own on-lane moves, and the 4px inter-lane gaps are
 * deliberately treated as "inside" so a slightly missed drop never spawns a
 * surprise track.
 */

export type DragOutZone = "above" | "below";

export function resolveDragOutZone({
	clientX,
	clientY,
	lanesRect,
	lanesContentHeight,
}: {
	clientX: number;
	clientY: number;
	/** Bounding rect of the lanes container (starts right of the labels). */
	lanesRect: { top: number; left: number; right: number };
	/** Height of the actual lane stack — the container may extend past it. */
	lanesContentHeight: number;
}): DragOutZone | null {
	// Left of the lanes sit the track labels; right overshoot keeps the drop.
	if (clientX < lanesRect.left || clientX > lanesRect.right) return null;
	if (clientY < lanesRect.top) return "above";
	if (clientY > lanesRect.top + lanesContentHeight) return "below";
	return null;
}

/**
 * Where a lane born from a vertical drag-out slots in: at the edge of its own
 * type group, so the type-layering worldview (TRACK_PRIORITY) is preserved —
 * a media clip dragged up gets a lane above the existing media lanes but
 * still under the text/sticker overlays.
 */
export function resolveTypeGroupEdgeIndex({
	tracks,
	trackType,
	edge,
}: {
	tracks: readonly TimelineTrack[];
	trackType: TrackType;
	edge: DragOutZone;
}): number {
	let first = -1;
	let last = -1;
	for (const [index, track] of tracks.entries()) {
		if (track.type !== trackType) continue;
		if (first === -1) first = index;
		last = index;
	}
	if (first === -1) {
		// No same-type lane exists (unreachable mid-drag, since the dragged
		// element came from one): top for overlays, bottom for audio.
		return trackType === "audio" ? tracks.length : 0;
	}
	return edge === "above" ? first : last + 1;
}
