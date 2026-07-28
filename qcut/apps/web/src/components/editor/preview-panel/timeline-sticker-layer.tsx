import { useMemo, useRef, type RefObject } from "react";
import { StickerElement as InteractiveStickerElement } from "@/components/editor/stickers-overlay/StickerElement";
import { resolveTimelineStickerVisualAtTime } from "@/lib/stickers/timeline-sticker-visual";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import type { StickerElement, TimelineTrack } from "@/types/timeline";
import type { ActiveElement } from "./types";

export function TimelineStickerLayer({
	element,
	elementOrder,
	mediaItems,
	currentTime = 0,
	tracks = [],
	canvasSize = { width: 1920, height: 1080 },
}: {
	element: StickerElement;
	elementOrder: number;
	mediaItems: MediaItem[];
	currentTime?: number;
	tracks?: TimelineTrack[];
	canvasSize?: { width: number; height: number };
}) {
	const canvasRef = useRef<HTMLDivElement>(null);
	const fallback = useStickersOverlayStore((state) =>
		state.overlayStickers.get(element.stickerId)
	);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const sticker = useMemo(
		() =>
			resolveTimelineStickerVisualAtTime({
				element,
				currentTime,
				fps,
				fallback,
				elementOrder,
				tracks,
				canvasWidth: canvasSize.width,
				canvasHeight: canvasSize.height,
			}),
		[
			canvasSize.height,
			canvasSize.width,
			currentTime,
			element,
			elementOrder,
			fallback,
			fps,
			tracks,
		]
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
				animationElement={element}
				currentTime={currentTime}
			/>
		</div>
	);
}

function TimelineStickerInteractionItem({
	canvasRef,
	element,
	elementOrder,
	mediaItems,
	currentTime,
	tracks,
	canvasSize,
}: {
	canvasRef: RefObject<HTMLDivElement | null>;
	element: StickerElement;
	elementOrder: number;
	mediaItems: MediaItem[];
	currentTime: number;
	tracks: TimelineTrack[];
	canvasSize: { width: number; height: number };
}) {
	const fallback = useStickersOverlayStore((state) =>
		state.overlayStickers.get(element.stickerId)
	);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const sticker = useMemo(
		() =>
			resolveTimelineStickerVisualAtTime({
				element,
				currentTime,
				fps,
				fallback,
				elementOrder,
				tracks,
				canvasWidth: canvasSize.width,
				canvasHeight: canvasSize.height,
			}),
		[
			canvasSize.height,
			canvasSize.width,
			currentTime,
			element,
			elementOrder,
			fallback,
			fps,
			tracks,
		]
	);
	const mediaItem = mediaItems.find((item) => item.id === element.mediaId);
	if (!mediaItem) return null;

	return (
		<InteractiveStickerElement
			sticker={sticker}
			mediaItem={mediaItem}
			canvasRef={canvasRef}
			renderMode="interaction"
			animationElement={element}
			currentTime={currentTime}
		/>
	);
}

export function TimelineStickerInteractionLayer({
	activeElements,
	mediaItems,
	tracks = [],
	canvasSize = { width: 1920, height: 1080 },
}: {
	activeElements: ActiveElement[];
	mediaItems: MediaItem[];
	tracks?: TimelineTrack[];
	canvasSize?: { width: number; height: number };
}) {
	const currentTime = usePlaybackStore((state) => state.currentTime);
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
					currentTime={currentTime}
					tracks={tracks}
					canvasSize={canvasSize}
				/>
			))}
		</div>
	);
}
