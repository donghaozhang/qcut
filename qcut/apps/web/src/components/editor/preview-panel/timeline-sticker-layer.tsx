import { useMemo, useRef } from "react";
import { StickerElement as InteractiveStickerElement } from "@/components/editor/stickers-overlay/StickerElement";
import { resolveTimelineStickerVisual } from "@/lib/stickers/timeline-sticker-visual";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import type { StickerElement } from "@/types/timeline";

export function TimelineStickerLayer({
	element,
	elementOrder,
	mediaItems,
}: {
	element: StickerElement;
	elementOrder: number;
	mediaItems: MediaItem[];
}) {
	const canvasRef = useRef<HTMLDivElement>(null);
	const fallback = useStickersOverlayStore((state) =>
		state.overlayStickers.get(element.stickerId)
	);
	const sticker = useMemo(
		() =>
			resolveTimelineStickerVisual({
				element,
				fallback,
				elementOrder,
			}),
		[element, elementOrder, fallback]
	);
	const mediaItem = mediaItems.find((item) => item.id === element.mediaId);
	if (!mediaItem) return null;

	return (
		<div
			ref={canvasRef}
			className="absolute inset-0 pointer-events-none"
			style={{ zIndex: elementOrder + 1 }}
			data-testid={`timeline-sticker-layer-${element.id}`}
		>
			<InteractiveStickerElement
				sticker={sticker}
				mediaItem={mediaItem}
				canvasRef={canvasRef}
			/>
		</div>
	);
}
