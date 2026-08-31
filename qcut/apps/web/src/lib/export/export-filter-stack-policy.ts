/**
 * Engine policy for per-clip Filter Lab stacks.
 *
 * The CLI FFmpeg export path does not render `MediaElement.filterStack`
 * yet, so any timeline with an enabled stack must use the canvas muxer
 * engine (which shares the preview's layer chain). Silent filter loss is
 * never acceptable, so this check routes engine selection, mirroring the
 * local-Jianying color policy.
 */

import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { hasEnabledFilterStack } from "@/lib/color/color-filter-stack";

function mediaHasEnabledFilterStack({
	element,
}: {
	element: MediaElement;
}): boolean {
	if (hasEnabledFilterStack({ filterStack: element.filterStack })) return true;
	return Boolean(
		element.compound?.clips.some((clip) =>
			mediaHasEnabledFilterStack({ element: clip.element })
		)
	);
}

export function timelineHasEnabledFilterStack({
	tracks,
}: {
	tracks: readonly TimelineTrack[];
}): boolean {
	for (const track of tracks) {
		for (const element of track.elements) {
			if (element.type === "media" && mediaHasEnabledFilterStack({ element })) {
				return true;
			}
		}
	}
	return false;
}
