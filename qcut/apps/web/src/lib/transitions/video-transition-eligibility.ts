import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";

export function getVideoMediaIds({
	mediaItems,
}: {
	mediaItems: readonly Pick<MediaItem, "id" | "type">[];
}): ReadonlySet<string> {
	return new Set(
		mediaItems
			.filter((mediaItem) => mediaItem.type === "video")
			.map((mediaItem) => mediaItem.id)
	);
}

export function isVideoTransitionPair({
	fromElement,
	toElement,
	videoMediaIds,
}: {
	fromElement: MediaElement;
	toElement: MediaElement;
	videoMediaIds: ReadonlySet<string>;
}): boolean {
	return (
		videoMediaIds.has(fromElement.mediaId) &&
		videoMediaIds.has(toElement.mediaId)
	);
}

export function resolveVideoTransitionPair({
	track,
	fromElementId,
	toElementId,
	videoMediaIds,
}: {
	track: TimelineTrack;
	fromElementId: string;
	toElementId: string;
	videoMediaIds: ReadonlySet<string>;
}): { fromElement: MediaElement; toElement: MediaElement } | null {
	const fromElement = track.elements.find(
		(element): element is MediaElement =>
			element.type === "media" && element.id === fromElementId
	);
	const toElement = track.elements.find(
		(element): element is MediaElement =>
			element.type === "media" && element.id === toElementId
	);
	if (!fromElement || !toElement) return null;
	return isVideoTransitionPair({ fromElement, toElement, videoMediaIds })
		? { fromElement, toElement }
		: null;
}
