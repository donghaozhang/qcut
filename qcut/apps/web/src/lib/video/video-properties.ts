import type {
	MediaCrop,
	MediaAdjustments,
	MediaColorSettings,
	MediaElement,
	MediaMask,
	MediaMaskKeyframeProperty,
	MediaChromaKey,
	MediaEnhancements,
	MediaKeyframeProperty,
	MediaPerspective,
	MediaPropertyKeyframe,
} from "@/types/timeline";
import {
	hasMediaColorEdits,
	normalizeMediaColorSettings,
	resolveMediaColorAtTime,
} from "@/lib/color/color-properties";
import {
	interpolateNumber,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";

export const DEFAULT_MEDIA_CROP: MediaCrop = {
	top: 0,
	right: 0,
	bottom: 0,
	left: 0,
};

export const DEFAULT_MEDIA_PERSPECTIVE: MediaPerspective = {
	topLeftX: 0,
	topLeftY: 0,
	topRightX: 1,
	topRightY: 0,
	bottomRightX: 1,
	bottomRightY: 1,
	bottomLeftX: 0,
	bottomLeftY: 1,
};

export const DEFAULT_MEDIA_ADJUSTMENTS: MediaAdjustments = {
	brightness: 0,
	contrast: 0,
	saturation: 0,
	temperature: 0,
	tint: 0,
	sharpness: 0,
	fade: 0,
	vignette: 0,
};

export const DEFAULT_MEDIA_MASK: MediaMask = {
	id: "mask-1",
	name: "Mask 1",
	enabled: true,
	type: "none",
	blendMode: "add",
	centerX: 0.5,
	centerY: 0.5,
	width: 0.8,
	height: 0.8,
	rotation: 0,
	feather: 0,
	roundness: 0,
	expansion: 0,
	opacity: 1,
	maintainAspectRatio: false,
	invert: false,
	stroke: {
		style: "none",
		color: "#ffffff",
		width: 0,
		opacity: 1,
		glow: 0,
		offsetX: 0,
		offsetY: 0,
	},
};

export const DEFAULT_MEDIA_CHROMA_KEY: MediaChromaKey = {
	enabled: false,
	color: "#00ff00",
	similarity: 0.2,
	blend: 0.1,
};

export const DEFAULT_MEDIA_ENHANCEMENTS: MediaEnhancements = {
	stabilization: 0,
	denoise: 0,
	clarity: 0,
	upscale: 1,
	relight: 0,
	beauty: 0,
};

export interface ResolvedMediaVisualProperties {
	x: number;
	y: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
	maintainAspectRatio: boolean;
	flipHorizontal: boolean;
	flipVertical: boolean;
	opacity: number;
	blendMode: NonNullable<MediaElement["blendMode"]>;
	fitMode: NonNullable<MediaElement["fitMode"]>;
	crop: MediaCrop;
	perspective: MediaPerspective;
	animationInType: NonNullable<MediaElement["animationInType"]>;
	animationInDuration: number;
	animationOutType: NonNullable<MediaElement["animationOutType"]>;
	animationOutDuration: number;
	comboAnimationType: NonNullable<MediaElement["comboAnimationType"]>;
	comboAnimationIntensity: number;
	adjustments: MediaAdjustments;
	color: MediaColorSettings;
	mask: MediaMask;
	masks: MediaMask[];
	chromaKey: MediaChromaKey;
	enhancements: MediaEnhancements;
}

export const MEDIA_KEYFRAME_PROPERTIES: Array<{
	value: MediaKeyframeProperty;
	label: string;
}> = [
	{ value: "x", label: "X position" },
	{ value: "y", label: "Y position" },
	{ value: "scaleX", label: "Horizontal scale" },
	{ value: "scaleY", label: "Vertical scale" },
	{ value: "rotation", label: "Rotation" },
	{ value: "opacity", label: "Opacity" },
	{ value: "cropTop", label: "Crop top" },
	{ value: "cropRight", label: "Crop right" },
	{ value: "cropBottom", label: "Crop bottom" },
	{ value: "cropLeft", label: "Crop left" },
	{ value: "topLeftX", label: "Top-left X" },
	{ value: "topLeftY", label: "Top-left Y" },
	{ value: "topRightX", label: "Top-right X" },
	{ value: "topRightY", label: "Top-right Y" },
	{ value: "bottomRightX", label: "Bottom-right X" },
	{ value: "bottomRightY", label: "Bottom-right Y" },
	{ value: "bottomLeftX", label: "Bottom-left X" },
	{ value: "bottomLeftY", label: "Bottom-left Y" },
];

export const MEDIA_MASK_KEYFRAME_PROPERTIES: Array<{
	value: MediaMaskKeyframeProperty;
	label: string;
}> = [
	{ value: "centerX", label: "Mask X position" },
	{ value: "centerY", label: "Mask Y position" },
	{ value: "width", label: "Mask width" },
	{ value: "height", label: "Mask height" },
	{ value: "rotation", label: "Mask rotation" },
	{ value: "feather", label: "Mask feather" },
	{ value: "roundness", label: "Mask roundness" },
	{ value: "expansion", label: "Mask expansion" },
	{ value: "opacity", label: "Mask opacity" },
];

const CROP_KEY_MAP = {
	cropTop: "top",
	cropRight: "right",
	cropBottom: "bottom",
	cropLeft: "left",
} as const;

function finiteOr(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeMediaMask(
	mask: Partial<MediaMask>,
	index = 0
): MediaMask {
	const fallbackName = `Mask ${index + 1}`;
	return {
		...DEFAULT_MEDIA_MASK,
		...mask,
		id: mask.id?.trim() || `mask-${index + 1}`,
		name: mask.name?.trim() || fallbackName,
		enabled: mask.enabled ?? true,
		blendMode: mask.blendMode ?? "add",
		centerX: finiteOr(mask.centerX, DEFAULT_MEDIA_MASK.centerX),
		centerY: finiteOr(mask.centerY, DEFAULT_MEDIA_MASK.centerY),
		width: Math.max(0.001, finiteOr(mask.width, DEFAULT_MEDIA_MASK.width)),
		height: Math.max(0.001, finiteOr(mask.height, DEFAULT_MEDIA_MASK.height)),
		rotation: finiteOr(mask.rotation, DEFAULT_MEDIA_MASK.rotation),
		feather: Math.max(0, finiteOr(mask.feather, DEFAULT_MEDIA_MASK.feather)),
		roundness: Math.min(
			1,
			Math.max(0, finiteOr(mask.roundness, DEFAULT_MEDIA_MASK.roundness ?? 0))
		),
		expansion: Math.min(
			1,
			Math.max(-1, finiteOr(mask.expansion, DEFAULT_MEDIA_MASK.expansion ?? 0))
		),
		opacity: Math.min(
			1,
			Math.max(0, finiteOr(mask.opacity, DEFAULT_MEDIA_MASK.opacity ?? 1))
		),
		maintainAspectRatio: mask.maintainAspectRatio ?? false,
		invert: mask.invert ?? false,
		points: mask.points?.map((point) => ({
			...point,
			handleIn: point.handleIn ? { ...point.handleIn } : undefined,
			handleOut: point.handleOut ? { ...point.handleOut } : undefined,
		})),
		keyframes: mask.keyframes
			? Object.fromEntries(
					Object.entries(mask.keyframes).map(([property, keyframes]) => [
						property,
						keyframes?.map((keyframe) => ({ ...keyframe })),
					])
				)
			: undefined,
		tracking: mask.tracking ? { ...mask.tracking } : undefined,
		stroke: {
			...DEFAULT_MEDIA_MASK.stroke!,
			...mask.stroke,
		},
	};
}

export function resolveMediaMasks(element: MediaElement): MediaMask[] {
	const source = element.masks?.length
		? element.masks
		: element.mask && element.mask.type !== "none"
			? [element.mask]
			: [];
	return source
		.filter((mask) => mask.type !== "none")
		.map((mask, index) => normalizeMediaMask(mask, index));
}

export function resolveMediaMaskKeyframes({
	mask,
	currentTime,
	elementStartTime,
	fps,
}: {
	mask: MediaMask;
	currentTime: number;
	elementStartTime: number;
	fps: number;
}): MediaMask {
	const resolved = normalizeMediaMask(mask);
	const localFrame = Math.max(
		0,
		Math.round((currentTime - elementStartTime) * fps)
	);
	for (const { value: property } of MEDIA_MASK_KEYFRAME_PROPERTIES) {
		const keyframes = mask.keyframes?.[property];
		if (!keyframes?.length) continue;
		resolved[property] = interpolateNumber(keyframes as Keyframe[], localFrame);
	}
	return resolved;
}

export function resolveMediaMasksAtTime({
	element,
	currentTime,
	fps,
}: {
	element: MediaElement;
	currentTime: number;
	fps: number;
}): MediaMask[] {
	return resolveMediaMasks(element).map((mask) =>
		resolveMediaMaskKeyframes({
			mask,
			currentTime,
			elementStartTime: element.startTime,
			fps,
		})
	);
}

export function clampMediaCrop(crop?: Partial<MediaCrop>): MediaCrop {
	const next = {
		top: Math.min(0.95, Math.max(0, finiteOr(crop?.top, 0))),
		right: Math.min(0.95, Math.max(0, finiteOr(crop?.right, 0))),
		bottom: Math.min(0.95, Math.max(0, finiteOr(crop?.bottom, 0))),
		left: Math.min(0.95, Math.max(0, finiteOr(crop?.left, 0))),
	};
	if (next.left + next.right >= 0.99) {
		const factor = 0.98 / (next.left + next.right);
		next.left *= factor;
		next.right *= factor;
	}
	if (next.top + next.bottom >= 0.99) {
		const factor = 0.98 / (next.top + next.bottom);
		next.top *= factor;
		next.bottom *= factor;
	}
	return next;
}

export function clampMediaPerspective(
	perspective?: Partial<MediaPerspective>
): MediaPerspective {
	return Object.fromEntries(
		(
			Object.entries(DEFAULT_MEDIA_PERSPECTIVE) as Array<
				[keyof MediaPerspective, number]
			>
		).map(([key, fallback]) => [
			key,
			Math.min(1, Math.max(0, finiteOr(perspective?.[key], fallback))),
		])
	) as unknown as MediaPerspective;
}

export function resolveMediaVisualProperties(
	element: MediaElement
): ResolvedMediaVisualProperties {
	const masks = resolveMediaMasks(element);
	return {
		x: finiteOr(element.x, 0),
		y: finiteOr(element.y, 0),
		rotation: finiteOr(element.rotation, 0),
		scaleX: Math.max(0.01, finiteOr(element.scaleX, 1)),
		scaleY: Math.max(0.01, finiteOr(element.scaleY, 1)),
		maintainAspectRatio: element.maintainAspectRatio ?? true,
		flipHorizontal: element.flipHorizontal ?? false,
		flipVertical: element.flipVertical ?? false,
		opacity: Math.min(1, Math.max(0, finiteOr(element.opacity, 1))),
		blendMode: element.blendMode ?? "normal",
		fitMode: element.fitMode ?? "cover",
		crop: clampMediaCrop(element.crop),
		perspective: clampMediaPerspective(element.perspective),
		animationInType: element.animationInType ?? "none",
		animationInDuration: Math.max(
			0.05,
			finiteOr(element.animationInDuration, 0.5)
		),
		animationOutType: element.animationOutType ?? "none",
		animationOutDuration: Math.max(
			0.05,
			finiteOr(element.animationOutDuration, 0.5)
		),
		comboAnimationType: element.comboAnimationType ?? "none",
		comboAnimationIntensity: Math.min(
			1,
			Math.max(0, finiteOr(element.comboAnimationIntensity, 0.5))
		),
		adjustments: {
			...DEFAULT_MEDIA_ADJUSTMENTS,
			...element.adjustments,
		},
		color: normalizeMediaColorSettings({ element }),
		mask:
			masks[0] ??
			normalizeMediaMask({ ...DEFAULT_MEDIA_MASK, ...element.mask }),
		masks,
		chromaKey: { ...DEFAULT_MEDIA_CHROMA_KEY, ...element.chromaKey },
		enhancements: {
			...DEFAULT_MEDIA_ENHANCEMENTS,
			...element.enhancements,
		},
	};
}

export function getMediaPropertyValue(
	element: MediaElement,
	property: MediaKeyframeProperty
): number {
	const resolved = resolveMediaVisualProperties(element);
	if (property in CROP_KEY_MAP) {
		return resolved.crop[CROP_KEY_MAP[property as keyof typeof CROP_KEY_MAP]];
	}
	if (property in DEFAULT_MEDIA_PERSPECTIVE) {
		return resolved.perspective[property as keyof MediaPerspective];
	}
	return resolved[property as keyof ResolvedMediaVisualProperties] as number;
}

export function getMediaKeyframeValue({
	element,
	property,
	currentTime,
	fps,
}: {
	element: MediaElement;
	property: MediaKeyframeProperty;
	currentTime: number;
	fps: number;
}): number {
	const keyframes = element.keyframes?.[property];
	if (!keyframes || keyframes.length === 0) {
		return getMediaPropertyValue(element, property);
	}
	const localFrame = Math.max(
		0,
		Math.round((currentTime - element.startTime) * fps)
	);
	return interpolateNumber(keyframes as Keyframe[], localFrame);
}

export function resolveMediaKeyframes({
	element,
	currentTime,
	fps,
}: {
	element: MediaElement;
	currentTime: number;
	fps: number;
}): ResolvedMediaVisualProperties {
	const resolved = resolveMediaVisualProperties(element);
	const masks = resolveMediaMasksAtTime({ element, currentTime, fps });
	const color = resolveMediaColorAtTime({ element, currentTime, fps });
	if (!element.keyframes) {
		return { ...resolved, color, masks, mask: masks[0] ?? resolved.mask };
	}

	const crop = { ...resolved.crop };
	const perspective = { ...resolved.perspective };
	const numeric = {
		x: resolved.x,
		y: resolved.y,
		scaleX: resolved.scaleX,
		scaleY: resolved.scaleY,
		rotation: resolved.rotation,
		opacity: resolved.opacity,
	};
	for (const property of MEDIA_KEYFRAME_PROPERTIES.map((item) => item.value)) {
		if (!element.keyframes[property]?.length) continue;
		const value = getMediaKeyframeValue({
			element,
			property,
			currentTime,
			fps,
		});
		if (property in CROP_KEY_MAP) {
			crop[CROP_KEY_MAP[property as keyof typeof CROP_KEY_MAP]] = value;
		} else if (property in DEFAULT_MEDIA_PERSPECTIVE) {
			perspective[property as keyof MediaPerspective] = value;
		} else {
			numeric[property as keyof typeof numeric] = value;
		}
	}

	return {
		...resolved,
		...numeric,
		opacity: Math.min(1, Math.max(0, numeric.opacity)),
		scaleX: Math.max(0.01, numeric.scaleX),
		scaleY: Math.max(0.01, numeric.scaleY),
		crop: clampMediaCrop(crop),
		perspective: clampMediaPerspective(perspective),
		color,
		masks,
		mask: masks[0] ?? resolved.mask,
	};
}

export function upsertMediaKeyframe({
	keyframes,
	keyframe,
}: {
	keyframes: MediaPropertyKeyframe[];
	keyframe: MediaPropertyKeyframe;
}): MediaPropertyKeyframe[] {
	const existingIndex = keyframes.findIndex((item) => item.id === keyframe.id);
	const next = [...keyframes];
	if (existingIndex >= 0) next[existingIndex] = keyframe;
	else next.push(keyframe);
	return next.sort((a, b) => a.frame - b.frame);
}

export function hasMediaVisualEdits(element: MediaElement): boolean {
	const visual = resolveMediaVisualProperties(element);
	return (
		visual.x !== 0 ||
		visual.y !== 0 ||
		visual.rotation !== 0 ||
		visual.scaleX !== 1 ||
		visual.scaleY !== 1 ||
		visual.flipHorizontal ||
		visual.flipVertical ||
		visual.opacity !== 1 ||
		visual.blendMode !== "normal" ||
		visual.fitMode !== "cover" ||
		Object.values(visual.crop).some((value) => value !== 0) ||
		Object.entries(visual.perspective).some(
			([key, value]) =>
				value !== DEFAULT_MEDIA_PERSPECTIVE[key as keyof MediaPerspective]
		) ||
		visual.animationInType !== "none" ||
		visual.animationOutType !== "none" ||
		visual.comboAnimationType !== "none" ||
		hasMediaColorEdits({ settings: visual.color }) ||
		visual.masks.length > 0 ||
		visual.chromaKey.enabled ||
		Object.entries(visual.enhancements).some(([key, value]) =>
			key === "upscale" ? value !== 1 : value !== 0
		) ||
		(element.playbackRate ?? 1) !== 1 ||
		(element.speedKeyframes?.length ?? 0) > 0 ||
		(element.reverse ?? false) ||
		(element.freezeFrameDuration ?? 0) > 0 ||
		(element.volume ?? 1) !== 1 ||
		(element.audioFadeIn ?? 0) > 0 ||
		(element.audioFadeOut ?? 0) > 0 ||
		(element.audioNormalize ?? false) ||
		(element.audioDenoise ?? 0) > 0 ||
		(element.audioPan ?? 0) !== 0 ||
		Object.values(element.keyframes ?? {}).some(
			(keyframes) => (keyframes?.length ?? 0) > 0
		)
	);
}
