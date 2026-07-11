import type { OverlaySticker } from "@/types/sticker-overlay";
import type { StickerElement } from "@/types/timeline";

type StickerVisualFallback = Pick<
	OverlaySticker,
	"id" | "mediaItemId" | "position" | "size" | "zIndex"
> &
	Partial<
		Pick<
			OverlaySticker,
			"rotation" | "opacity" | "maintainAspectRatio" | "metadata"
		>
	>;

export const DEFAULT_TIMELINE_STICKER_VISUAL = {
	position: { x: 50, y: 50 },
	size: { width: 15, height: 15 },
	rotation: 0,
	opacity: 1,
	maintainAspectRatio: true,
	zIndex: 1,
} as const;

function finiteOr({
	value,
	fallback,
}: {
	value: number | undefined;
	fallback: number;
}) {
	return Number.isFinite(value) ? (value as number) : fallback;
}

export function resolveTimelineStickerVisual({
	element,
	fallback,
	elementOrder = 0,
}: {
	element: StickerElement;
	fallback?: StickerVisualFallback;
	elementOrder?: number;
}): OverlaySticker {
	return {
		id: element.stickerId,
		mediaItemId: element.mediaId,
		position: {
			x: finiteOr({
				value: element.x,
				fallback:
					fallback?.position.x ?? DEFAULT_TIMELINE_STICKER_VISUAL.position.x,
			}),
			y: finiteOr({
				value: element.y,
				fallback:
					fallback?.position.y ?? DEFAULT_TIMELINE_STICKER_VISUAL.position.y,
			}),
		},
		size: {
			width: finiteOr({
				value: element.width,
				fallback:
					fallback?.size.width ?? DEFAULT_TIMELINE_STICKER_VISUAL.size.width,
			}),
			height: finiteOr({
				value: element.height,
				fallback:
					fallback?.size.height ?? DEFAULT_TIMELINE_STICKER_VISUAL.size.height,
			}),
		},
		rotation: finiteOr({
			value: element.rotation,
			fallback: fallback?.rotation ?? DEFAULT_TIMELINE_STICKER_VISUAL.rotation,
		}),
		opacity: finiteOr({
			value: element.opacity,
			fallback: fallback?.opacity ?? DEFAULT_TIMELINE_STICKER_VISUAL.opacity,
		}),
		maintainAspectRatio:
			element.maintainAspectRatio ??
			fallback?.maintainAspectRatio ??
			DEFAULT_TIMELINE_STICKER_VISUAL.maintainAspectRatio,
		zIndex: finiteOr({
			value: element.zIndex,
			fallback:
				fallback?.zIndex ??
				DEFAULT_TIMELINE_STICKER_VISUAL.zIndex + elementOrder,
		}),
		metadata: fallback?.metadata,
	};
}

export function stickerVisualUpdatesFromOverlay({
	sticker,
}: {
	sticker: OverlaySticker;
}): Pick<
	StickerElement,
	| "x"
	| "y"
	| "width"
	| "height"
	| "rotation"
	| "opacity"
	| "maintainAspectRatio"
	| "zIndex"
> {
	return {
		x: sticker.position.x,
		y: sticker.position.y,
		width: sticker.size.width,
		height: sticker.size.height,
		rotation: sticker.rotation,
		opacity: sticker.opacity,
		maintainAspectRatio: sticker.maintainAspectRatio,
		zIndex: sticker.zIndex,
	};
}
