import type {
	OverlaySticker,
	ValidatedStickerUpdate,
} from "@/types/sticker-overlay";
import type { StickerElement } from "@/types/timeline";
import { clampMediaPerspective } from "@/lib/video/video-properties";
import { resolveStickerKeyframes } from "./sticker-keyframes";
import { resolveStickerMotionTracking } from "./sticker-tracking";
import type { TimelineTrack } from "@/types/timeline";

type StickerVisualFallback = Pick<
	OverlaySticker,
	"id" | "mediaItemId" | "position" | "size" | "zIndex"
> &
	Partial<
		Pick<
			OverlaySticker,
			| "rotation"
			| "opacity"
			| "maintainAspectRatio"
			| "perspective"
			| "animationInType"
			| "animationInDuration"
			| "animationOutType"
			| "animationOutDuration"
			| "animationLoopType"
			| "animationLoopIntensity"
			| "metadata"
		>
	>;

export const DEFAULT_TIMELINE_STICKER_VISUAL = {
	position: { x: 50, y: 50 },
	size: { width: 15, height: 15 },
	rotation: 0,
	opacity: 1,
	maintainAspectRatio: true,
	perspective: {
		topLeftX: 0,
		topLeftY: 0,
		topRightX: 1,
		topRightY: 0,
		bottomRightX: 1,
		bottomRightY: 1,
		bottomLeftX: 0,
		bottomLeftY: 1,
	},
	animationInType: "none",
	animationInDuration: 0.5,
	animationOutType: "none",
	animationOutDuration: 0.5,
	animationLoopType: "none",
	animationLoopIntensity: 0.5,
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
		perspective: clampMediaPerspective(
			element.perspective ??
				fallback?.perspective ??
				DEFAULT_TIMELINE_STICKER_VISUAL.perspective
		),
		animationInType:
			element.animationInType ??
			fallback?.animationInType ??
			DEFAULT_TIMELINE_STICKER_VISUAL.animationInType,
		animationInDuration: Math.max(
			0.05,
			finiteOr({
				value: element.animationInDuration,
				fallback:
					fallback?.animationInDuration ??
					DEFAULT_TIMELINE_STICKER_VISUAL.animationInDuration,
			})
		),
		animationOutType:
			element.animationOutType ??
			fallback?.animationOutType ??
			DEFAULT_TIMELINE_STICKER_VISUAL.animationOutType,
		animationOutDuration: Math.max(
			0.05,
			finiteOr({
				value: element.animationOutDuration,
				fallback:
					fallback?.animationOutDuration ??
					DEFAULT_TIMELINE_STICKER_VISUAL.animationOutDuration,
			})
		),
		animationLoopType:
			element.animationLoopType ??
			fallback?.animationLoopType ??
			DEFAULT_TIMELINE_STICKER_VISUAL.animationLoopType,
		animationLoopIntensity: Math.min(
			1,
			Math.max(
				0,
				finiteOr({
					value: element.animationLoopIntensity,
					fallback:
						fallback?.animationLoopIntensity ??
						DEFAULT_TIMELINE_STICKER_VISUAL.animationLoopIntensity,
				})
			)
		),
		zIndex: finiteOr({
			value: element.zIndex,
			fallback:
				fallback?.zIndex ??
				DEFAULT_TIMELINE_STICKER_VISUAL.zIndex + elementOrder,
		}),
		metadata: fallback?.metadata,
	};
}

export function resolveTimelineStickerVisualAtTime({
	element,
	currentTime,
	fps,
	fallback,
	elementOrder = 0,
	tracks,
	canvasWidth,
	canvasHeight,
}: {
	element: StickerElement;
	currentTime: number;
	fps: number;
	fallback?: StickerVisualFallback;
	elementOrder?: number;
	tracks?: TimelineTrack[];
	canvasWidth?: number;
	canvasHeight?: number;
}): OverlaySticker {
	const keyframedElement = resolveStickerKeyframes({
		element,
		currentTime,
		fps,
	});
	const resolvedElement =
		tracks && canvasWidth && canvasHeight
			? resolveStickerMotionTracking({
					element: keyframedElement,
					tracks,
					currentTime,
					fps,
					canvasWidth,
					canvasHeight,
				})
			: keyframedElement;
	return resolveTimelineStickerVisual({
		element: resolvedElement,
		fallback,
		elementOrder,
	});
}

export type StickerVisualUpdates = Pick<
	StickerElement,
	| "x"
	| "y"
	| "width"
	| "height"
	| "rotation"
	| "opacity"
	| "maintainAspectRatio"
	| "perspective"
	| "animationInType"
	| "animationInDuration"
	| "animationOutType"
	| "animationOutDuration"
	| "animationLoopType"
	| "animationLoopIntensity"
	| "zIndex"
>;

export function stickerVisualUpdatesFromOverlay({
	sticker,
}: {
	sticker: OverlaySticker;
}): StickerVisualUpdates {
	return {
		x: sticker.position.x,
		y: sticker.position.y,
		width: sticker.size.width,
		height: sticker.size.height,
		rotation: sticker.rotation,
		opacity: sticker.opacity,
		maintainAspectRatio: sticker.maintainAspectRatio,
		perspective: sticker.perspective,
		animationInType: sticker.animationInType,
		animationInDuration: sticker.animationInDuration,
		animationOutType: sticker.animationOutType,
		animationOutDuration: sticker.animationOutDuration,
		animationLoopType: sticker.animationLoopType,
		animationLoopIntensity: sticker.animationLoopIntensity,
		zIndex: sticker.zIndex,
	};
}

export function stickerVisualUpdatesFromOverlayPatch({
	sticker,
	updates,
}: {
	sticker: OverlaySticker;
	updates: ValidatedStickerUpdate;
}): Partial<StickerVisualUpdates> {
	const visualUpdates: Partial<StickerVisualUpdates> = {};

	if (Object.hasOwn(updates, "position")) {
		visualUpdates.x = sticker.position.x;
		visualUpdates.y = sticker.position.y;
	}
	if (Object.hasOwn(updates, "size")) {
		visualUpdates.width = sticker.size.width;
		visualUpdates.height = sticker.size.height;
	}
	if (Object.hasOwn(updates, "rotation")) {
		visualUpdates.rotation = sticker.rotation;
	}
	if (Object.hasOwn(updates, "opacity")) {
		visualUpdates.opacity = sticker.opacity;
	}
	if (Object.hasOwn(updates, "maintainAspectRatio")) {
		visualUpdates.maintainAspectRatio = sticker.maintainAspectRatio;
	}
	if (Object.hasOwn(updates, "perspective")) {
		visualUpdates.perspective = sticker.perspective;
	}
	if (Object.hasOwn(updates, "animationInType")) {
		visualUpdates.animationInType = sticker.animationInType;
	}
	if (Object.hasOwn(updates, "animationInDuration")) {
		visualUpdates.animationInDuration = sticker.animationInDuration;
	}
	if (Object.hasOwn(updates, "animationOutType")) {
		visualUpdates.animationOutType = sticker.animationOutType;
	}
	if (Object.hasOwn(updates, "animationOutDuration")) {
		visualUpdates.animationOutDuration = sticker.animationOutDuration;
	}
	if (Object.hasOwn(updates, "animationLoopType")) {
		visualUpdates.animationLoopType = sticker.animationLoopType;
	}
	if (Object.hasOwn(updates, "animationLoopIntensity")) {
		visualUpdates.animationLoopIntensity = sticker.animationLoopIntensity;
	}
	if (Object.hasOwn(updates, "zIndex")) {
		visualUpdates.zIndex = sticker.zIndex;
	}

	return visualUpdates;
}
