import { useMemo, useRef, type RefObject } from "react";
import { StickerElement as InteractiveStickerElement } from "@/components/editor/stickers-overlay/StickerElement";
import { resolveTimelineStickerVisual } from "@/lib/stickers/timeline-sticker-visual";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import type { StickerElement } from "@/types/timeline";
import type { ActiveElement } from "./types";

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
			className="pointer-events-none absolute inset-0 z-[35]"
			data-testid={`timeline-sticker-layer-${element.id}`}
		>
			<InteractiveStickerElement
				sticker={sticker}
				mediaItem={mediaItem}
				canvasRef={canvasRef}
				renderMode="visual"
			/>
		</div>
	);
}

function TimelineStickerInteractionItem({
	canvasRef,
	element,
	elementOrder,
	mediaItems,
}: {
	canvasRef: RefObject<HTMLDivElement | null>;
	element: StickerElement;
	elementOrder: number;
	mediaItems: MediaItem[];
}) {
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
		<InteractiveStickerElement
			sticker={sticker}
			mediaItem={mediaItem}
			canvasRef={canvasRef}
			renderMode="interaction"
		/>
	);
}

export function TimelineStickerInteractionLayer({
	activeElements,
	mediaItems,
}: {
	activeElements: ActiveElement[];
	mediaItems: MediaItem[];
}) {
	const canvasRef = useRef<HTMLDivElement>(null);
	const activeStickers = activeElements.flatMap((elementData, elementOrder) =>
		elementData.element.type === "sticker"
			? [{ element: elementData.element, elementOrder }]
			: []
	);
	if (activeStickers.length === 0) return null;

	return (
		<div
			ref={canvasRef}
			className="pointer-events-none absolute inset-0 z-[90]"
			data-testid="timeline-sticker-interaction-layer"
		>
			{activeStickers.map(({ element, elementOrder }) => (
				<TimelineStickerInteractionItem
					key={`${element.id}-${elementOrder}`}
					canvasRef={canvasRef}
					element={element}
					elementOrder={elementOrder}
					mediaItems={mediaItems}
				/>
			))}
		</div>
	);
}
