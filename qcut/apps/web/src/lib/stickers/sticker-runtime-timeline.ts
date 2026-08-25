import type {
	StickerRuntimeDescriptor,
	StickerRuntimeTimelineWindow,
} from "@qcut/editor-core/sticker-lab";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { StickerElement } from "@/types/timeline";

export function resolveStickerRuntimeDescriptor({
	element,
	mediaItem,
}: {
	element?: StickerElement;
	mediaItem: MediaItem;
}): StickerRuntimeDescriptor | undefined {
	return element?.stickerRuntime ?? mediaItem.metadata?.stickerRuntime;
}

export function getStickerRuntimeTimelineWindow({
	element,
}: {
	element: StickerElement;
}): StickerRuntimeTimelineWindow {
	return {
		timelineStartSeconds: element.startTime,
		timelineDurationSeconds: Math.max(
			0,
			element.duration - element.trimStart - element.trimEnd
		),
		sourceOffsetSeconds: Math.max(0, element.trimStart),
	};
}
