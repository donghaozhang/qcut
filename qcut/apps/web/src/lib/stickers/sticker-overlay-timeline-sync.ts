import type {
	OverlaySticker,
	ValidatedStickerUpdate,
} from "@/types/sticker-overlay";
import type {
	StickerElement,
	StickerKeyframeProperty,
	TimelineTrack,
} from "@/types/timeline";
import {
	getStickerFrameContext,
	getStickerPropertyKeyframes,
	resolveStickerKeyframes,
	upsertStickerKeyframe,
} from "./sticker-keyframes";
import { resolveStickerMotionTrackingTransform } from "./sticker-tracking";
import {
	stickerVisualUpdatesFromOverlayPatch,
	type StickerVisualUpdates,
} from "./timeline-sticker-visual";

const DIRECT_KEYFRAME_PROPERTIES = [
	"x",
	"y",
	"width",
	"height",
	"rotation",
	"opacity",
] as const satisfies readonly StickerKeyframeProperty[];

export type StickerOverlayTimelineUpdates = Partial<StickerVisualUpdates> &
	Pick<Partial<StickerElement>, "keyframes">;

function trackingAdjustedVisualUpdates({
	element,
	visualUpdates,
	tracks,
	currentTime,
	fps,
	canvasWidth,
	canvasHeight,
}: {
	element: StickerElement;
	visualUpdates: Partial<StickerVisualUpdates>;
	tracks: TimelineTrack[];
	currentTime: number;
	fps: number;
	canvasWidth: number;
	canvasHeight: number;
}): Partial<StickerVisualUpdates> {
	const keyframedElement = resolveStickerKeyframes({
		element,
		currentTime,
		fps,
	});
	const transform = resolveStickerMotionTrackingTransform({
		element: keyframedElement,
		tracks,
		currentTime,
		fps,
		canvasWidth,
		canvasHeight,
	});
	if (!transform) return visualUpdates;
	return {
		...visualUpdates,
		x:
			visualUpdates.x === undefined
				? undefined
				: visualUpdates.x - transform.offsetX,
		y:
			visualUpdates.y === undefined
				? undefined
				: visualUpdates.y - transform.offsetY,
		width:
			visualUpdates.width === undefined
				? undefined
				: visualUpdates.width / transform.scale,
		height:
			visualUpdates.height === undefined
				? undefined
				: visualUpdates.height / transform.scale,
	};
}

export function stickerTimelineUpdatesFromOverlayPatch({
	element,
	sticker,
	updates,
	tracks,
	currentTime,
	fps,
	canvasWidth,
	canvasHeight,
}: {
	element: StickerElement;
	sticker: OverlaySticker;
	updates: ValidatedStickerUpdate;
	tracks: TimelineTrack[];
	currentTime: number;
	fps: number;
	canvasWidth: number;
	canvasHeight: number;
}): StickerOverlayTimelineUpdates {
	const adjusted = trackingAdjustedVisualUpdates({
		element,
		visualUpdates: stickerVisualUpdatesFromOverlayPatch({ sticker, updates }),
		tracks,
		currentTime,
		fps,
		canvasWidth,
		canvasHeight,
	});
	const { x, y, width, height, rotation, opacity, ...nonKeyframedUpdates } =
		adjusted;
	const values = { x, y, width, height, rotation, opacity };
	const timelineUpdates: StickerOverlayTimelineUpdates = {
		...nonKeyframedUpdates,
	};
	let nextKeyframes = element.keyframes;
	let keyframesChanged = false;
	const { clipLocalFrame } = getStickerFrameContext({
		element,
		currentTime,
		fps,
	});

	for (const property of DIRECT_KEYFRAME_PROPERTIES) {
		const value = values[property];
		if (value === undefined) continue;
		const keyframes = getStickerPropertyKeyframes({ element, property });
		if (keyframes.length === 0) {
			timelineUpdates[property] = value;
			continue;
		}
		const existing = keyframes.find(
			(keyframe) => keyframe.frame === clipLocalFrame
		);
		nextKeyframes = {
			...nextKeyframes,
			[property]: upsertStickerKeyframe({
				keyframes,
				keyframe: {
					id:
						existing?.id ??
						`${element.id}-${property}-${clipLocalFrame.toString()}`,
					frame: clipLocalFrame,
					value,
					easing: existing?.easing ?? "linear",
				},
			}),
		};
		keyframesChanged = true;
	}
	if (keyframesChanged) timelineUpdates.keyframes = nextKeyframes;
	return timelineUpdates;
}
