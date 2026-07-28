import {
	interpolateNumber,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";
import type {
	MediaPerspective,
	StickerElement,
	StickerKeyframeProperty,
	StickerPropertyKeyframe,
} from "@/types/timeline";

export const STICKER_KEYFRAME_PROPERTIES = [
	"x",
	"y",
	"width",
	"height",
	"rotation",
	"opacity",
	"topLeftX",
	"topLeftY",
	"topRightX",
	"topRightY",
	"bottomRightX",
	"bottomRightY",
	"bottomLeftX",
	"bottomLeftY",
] as const satisfies readonly StickerKeyframeProperty[];

export const STICKER_BASIC_KEYFRAME_PROPERTIES = [
	"x",
	"y",
	"width",
	"height",
	"rotation",
	"opacity",
] as const satisfies readonly StickerKeyframeProperty[];

type StickerBasicKeyframeProperty =
	(typeof STICKER_BASIC_KEYFRAME_PROPERTIES)[number];

export const STICKER_PERSPECTIVE_KEYFRAME_PROPERTIES = [
	"topLeftX",
	"topLeftY",
	"topRightX",
	"topRightY",
	"bottomRightX",
	"bottomRightY",
	"bottomLeftX",
	"bottomLeftY",
] as const satisfies readonly (keyof MediaPerspective)[];

export interface StickerFrameContext {
	clipLocalFrame: number;
	clipDurationFrames: number;
	trimStartFrame: number;
	trimEndFrame: number;
}

function finiteOrZero({ value }: { value: number }): number {
	return Number.isFinite(value) ? value : 0;
}

function normalizedFps({ fps }: { fps: number }): number {
	return Number.isFinite(fps) && fps > 0 ? fps : 30;
}

export function getStickerFrameContext({
	element,
	currentTime,
	fps,
}: {
	element: StickerElement;
	currentTime: number;
	fps: number;
}): StickerFrameContext {
	const frameRate = normalizedFps({ fps });
	const duration = Math.max(0, finiteOrZero({ value: element.duration }));
	const trimStart = Math.max(0, finiteOrZero({ value: element.trimStart }));
	const trimEnd = Math.max(0, finiteOrZero({ value: element.trimEnd }));
	const clipDuration = Math.max(0, duration - trimStart - trimEnd);
	const clipDurationFrames = Math.max(0, Math.round(clipDuration * frameRate));
	const localTime =
		finiteOrZero({ value: currentTime }) -
		finiteOrZero({ value: element.startTime });

	return {
		clipLocalFrame: Math.min(
			clipDurationFrames,
			Math.max(0, Math.round(localTime * frameRate))
		),
		clipDurationFrames,
		trimStartFrame: Math.max(0, Math.round(trimStart * frameRate)),
		trimEndFrame: Math.max(0, Math.round(trimEnd * frameRate)),
	};
}

export function upsertStickerKeyframe({
	keyframes,
	keyframe,
}: {
	keyframes: StickerPropertyKeyframe[];
	keyframe: StickerPropertyKeyframe;
}): StickerPropertyKeyframe[] {
	const normalizedKeyframe = {
		...keyframe,
		frame: Math.max(0, Math.round(finiteOrZero({ value: keyframe.frame }))),
	};
	const next = keyframes.filter(
		(item) =>
			item.id !== normalizedKeyframe.id &&
			Math.round(item.frame) !== normalizedKeyframe.frame
	);
	next.push(normalizedKeyframe);
	return next.sort((left, right) => left.frame - right.frame);
}

export function removeStickerKeyframe({
	keyframes,
	id,
	frame,
}: {
	keyframes: StickerPropertyKeyframe[];
	id?: string;
	frame?: number;
}): StickerPropertyKeyframe[] {
	const normalizedFrame =
		frame === undefined
			? undefined
			: Math.max(0, Math.round(finiteOrZero({ value: frame })));
	return keyframes.filter((item) => {
		if (id !== undefined && item.id === id) return false;
		if (
			normalizedFrame !== undefined &&
			Math.round(item.frame) === normalizedFrame
		) {
			return false;
		}
		return true;
	});
}

export function interpolateStickerKeyframes({
	keyframes,
	frame,
}: {
	keyframes: StickerPropertyKeyframe[];
	frame: number;
}): number | undefined {
	if (keyframes.length === 0) return;
	return interpolateNumber(
		keyframes as Keyframe[],
		Math.max(0, finiteOrZero({ value: frame }))
	);
}

export function getStickerPropertyKeyframes({
	element,
	property,
}: {
	element: StickerElement;
	property: StickerKeyframeProperty;
}): StickerPropertyKeyframe[] {
	return element.keyframes?.[property] ?? [];
}

export function getStickerKeyframeValue({
	element,
	property,
	currentTime,
	fps,
}: {
	element: StickerElement;
	property: StickerKeyframeProperty;
	currentTime: number;
	fps: number;
}): number | undefined {
	const { clipLocalFrame } = getStickerFrameContext({
		element,
		currentTime,
		fps,
	});
	return interpolateStickerKeyframes({
		keyframes: getStickerPropertyKeyframes({ element, property }),
		frame: clipLocalFrame,
	});
}

export function resolveStickerKeyframes({
	element,
	currentTime,
	fps,
}: {
	element: StickerElement;
	currentTime: number;
	fps: number;
}): StickerElement {
	if (!element.keyframes) return element;

	const resolved: StickerElement = {
		...element,
		perspective: element.perspective ? { ...element.perspective } : undefined,
	};
	for (const property of STICKER_KEYFRAME_PROPERTIES) {
		const value = getStickerKeyframeValue({
			element,
			property,
			currentTime,
			fps,
		});
		if (value === undefined) continue;
		if (
			STICKER_PERSPECTIVE_KEYFRAME_PROPERTIES.some(
				(perspectiveProperty) => perspectiveProperty === property
			)
		) {
			resolved.perspective = {
				topLeftX: 0,
				topLeftY: 0,
				topRightX: 1,
				topRightY: 0,
				bottomRightX: 1,
				bottomRightY: 1,
				bottomLeftX: 0,
				bottomLeftY: 1,
				...resolved.perspective,
				[property]: value,
			};
			continue;
		}
		resolved[property as StickerBasicKeyframeProperty] = value;
	}
	return resolved;
}
