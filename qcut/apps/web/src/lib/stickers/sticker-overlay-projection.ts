import type { OverlaySticker } from "@/types/sticker-overlay";
import type { StickerElement, TimelineTrack } from "@/types/timeline";
import { resolveTimelineStickerVisual } from "./timeline-sticker-visual";

function timelineStickerElements({
	tracks,
}: {
	tracks: TimelineTrack[];
}): StickerElement[] {
	return tracks.flatMap((track) =>
		track.elements.filter(
			(element): element is StickerElement => element.type === "sticker"
		)
	);
}

export function projectStickerOverlaysFromTimelineChange({
	overlays,
	tracks,
	previousTracks,
}: {
	overlays: Map<string, OverlaySticker>;
	tracks: TimelineTrack[];
	previousTracks: TimelineTrack[];
}): Map<string, OverlaySticker> {
	const projected = new Map(overlays);
	const currentElements = timelineStickerElements({ tracks });
	const currentIds = new Set(
		currentElements.map((element) => element.stickerId)
	);
	const previousIds = new Set(
		timelineStickerElements({ tracks: previousTracks }).map(
			(element) => element.stickerId
		)
	);

	for (const previousId of previousIds) {
		if (!currentIds.has(previousId)) projected.delete(previousId);
	}

	for (
		let elementOrder = 0;
		elementOrder < currentElements.length;
		elementOrder++
	) {
		const element = currentElements[elementOrder];
		projected.set(
			element.stickerId,
			resolveTimelineStickerVisual({
				element,
				fallback: projected.get(element.stickerId),
				elementOrder,
			})
		);
	}

	return projected;
}
