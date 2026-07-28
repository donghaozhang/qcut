import type {
	MediaAnimationType,
	MediaPerspective,
	StickerAnimationLoopType,
	StickerElement,
} from "@/types/timeline";

const DEFAULT_ANIMATION_DURATION = 0.5;
const MIN_ANIMATION_DURATION = 0.05;
const SLIDE_DISTANCE_FACTOR = 0.25;

const MEDIA_ANIMATION_TYPES: readonly MediaAnimationType[] = [
	"none",
	"fade",
	"slide-left",
	"slide-right",
	"slide-up",
	"slide-down",
	"zoom-in",
	"zoom-out",
];

const STICKER_ANIMATION_LOOP_TYPES: readonly StickerAnimationLoopType[] = [
	"none",
	"pulse",
	"drift",
	"spin",
	"wobble",
	"bounce",
	"blink",
];

export const DEFAULT_STICKER_PERSPECTIVE: MediaPerspective = {
	topLeftX: 0,
	topLeftY: 0,
	topRightX: 1,
	topRightY: 0,
	bottomRightX: 1,
	bottomRightY: 1,
	bottomLeftX: 0,
	bottomLeftY: 1,
};

export interface ResolvedStickerClipAnimation {
	perspective: MediaPerspective;
	animationInType: MediaAnimationType;
	animationInDuration: number;
	animationOutType: MediaAnimationType;
	animationOutDuration: number;
	animationLoopType: StickerAnimationLoopType;
	animationLoopIntensity: number;
}

export interface StickerClipAnimationState {
	opacity: number;
	scale: number;
	offsetX: number;
	offsetY: number;
	rotation: number;
}

interface EffectiveAnimationDurations {
	animationInDuration: number;
	animationOutDuration: number;
}

function finiteOr({
	value,
	fallback,
}: {
	value: number | undefined;
	fallback: number;
}): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp({
	value,
	minimum,
	maximum,
}: {
	value: number;
	minimum: number;
	maximum: number;
}): number {
	return Math.min(maximum, Math.max(minimum, value));
}

function resolveMediaAnimationType({
	value,
}: {
	value: unknown;
}): MediaAnimationType {
	return MEDIA_ANIMATION_TYPES.find((type) => type === value) ?? "none";
}

function resolveStickerAnimationLoopType({
	value,
}: {
	value: unknown;
}): StickerAnimationLoopType {
	return STICKER_ANIMATION_LOOP_TYPES.find((type) => type === value) ?? "none";
}

function resolveAnimationDuration({
	value,
}: {
	value: number | undefined;
}): number {
	return Math.max(
		MIN_ANIMATION_DURATION,
		finiteOr({ value, fallback: DEFAULT_ANIMATION_DURATION })
	);
}

function resolvePerspectiveValue({
	value,
	fallback,
}: {
	value: number | undefined;
	fallback: number;
}): number {
	return clamp({
		value: finiteOr({ value, fallback }),
		minimum: 0,
		maximum: 1,
	});
}

function resolvePerspective({
	perspective,
}: {
	perspective: MediaPerspective | undefined;
}): MediaPerspective {
	return {
		topLeftX: resolvePerspectiveValue({
			value: perspective?.topLeftX,
			fallback: DEFAULT_STICKER_PERSPECTIVE.topLeftX,
		}),
		topLeftY: resolvePerspectiveValue({
			value: perspective?.topLeftY,
			fallback: DEFAULT_STICKER_PERSPECTIVE.topLeftY,
		}),
		topRightX: resolvePerspectiveValue({
			value: perspective?.topRightX,
			fallback: DEFAULT_STICKER_PERSPECTIVE.topRightX,
		}),
		topRightY: resolvePerspectiveValue({
			value: perspective?.topRightY,
			fallback: DEFAULT_STICKER_PERSPECTIVE.topRightY,
		}),
		bottomRightX: resolvePerspectiveValue({
			value: perspective?.bottomRightX,
			fallback: DEFAULT_STICKER_PERSPECTIVE.bottomRightX,
		}),
		bottomRightY: resolvePerspectiveValue({
			value: perspective?.bottomRightY,
			fallback: DEFAULT_STICKER_PERSPECTIVE.bottomRightY,
		}),
		bottomLeftX: resolvePerspectiveValue({
			value: perspective?.bottomLeftX,
			fallback: DEFAULT_STICKER_PERSPECTIVE.bottomLeftX,
		}),
		bottomLeftY: resolvePerspectiveValue({
			value: perspective?.bottomLeftY,
			fallback: DEFAULT_STICKER_PERSPECTIVE.bottomLeftY,
		}),
	};
}

export function resolveStickerClipAnimation({
	element,
}: {
	element: StickerElement;
}): ResolvedStickerClipAnimation {
	return {
		perspective: resolvePerspective({ perspective: element.perspective }),
		animationInType: resolveMediaAnimationType({
			value: element.animationInType,
		}),
		animationInDuration: resolveAnimationDuration({
			value: element.animationInDuration,
		}),
		animationOutType: resolveMediaAnimationType({
			value: element.animationOutType,
		}),
		animationOutDuration: resolveAnimationDuration({
			value: element.animationOutDuration,
		}),
		animationLoopType: resolveStickerAnimationLoopType({
			value: element.animationLoopType,
		}),
		animationLoopIntensity: clamp({
			value: finiteOr({
				value: element.animationLoopIntensity,
				fallback: 0.5,
			}),
			minimum: 0,
			maximum: 1,
		}),
	};
}

function getEffectiveStickerDuration({
	element,
}: {
	element: StickerElement;
}): number {
	const duration = Math.max(
		0,
		finiteOr({ value: element.duration, fallback: 0 })
	);
	const trimStart = Math.max(
		0,
		finiteOr({ value: element.trimStart, fallback: 0 })
	);
	const trimEnd = Math.max(
		0,
		finiteOr({ value: element.trimEnd, fallback: 0 })
	);
	return Math.max(0, duration - trimStart - trimEnd);
}

function fitAnimationDurations({
	animation,
	clipDuration,
}: {
	animation: ResolvedStickerClipAnimation;
	clipDuration: number;
}): EffectiveAnimationDurations {
	const animationInDuration =
		animation.animationInType === "none" ? 0 : animation.animationInDuration;
	const animationOutDuration =
		animation.animationOutType === "none" ? 0 : animation.animationOutDuration;
	const combinedDuration = animationInDuration + animationOutDuration;
	if (combinedDuration <= clipDuration || combinedDuration === 0) {
		return { animationInDuration, animationOutDuration };
	}

	const durationScale = clipDuration / combinedDuration;
	return {
		animationInDuration: animationInDuration * durationScale,
		animationOutDuration: animationOutDuration * durationScale,
	};
}

function easeOut({ progress }: { progress: number }): number {
	const clampedProgress = clamp({ value: progress, minimum: 0, maximum: 1 });
	return 1 - (1 - clampedProgress) ** 3;
}

function applyClipAnimation({
	state,
	type,
	progress,
	canvasWidth,
	canvasHeight,
}: {
	state: StickerClipAnimationState;
	type: MediaAnimationType;
	progress: number;
	canvasWidth: number;
	canvasHeight: number;
}): StickerClipAnimationState {
	if (type === "none") return state;

	const next = { ...state };
	if (type === "fade") next.opacity *= progress;
	if (type === "slide-left") {
		next.offsetX -= (1 - progress) * canvasWidth * SLIDE_DISTANCE_FACTOR;
	}
	if (type === "slide-right") {
		next.offsetX += (1 - progress) * canvasWidth * SLIDE_DISTANCE_FACTOR;
	}
	if (type === "slide-up") {
		next.offsetY -= (1 - progress) * canvasHeight * SLIDE_DISTANCE_FACTOR;
	}
	if (type === "slide-down") {
		next.offsetY += (1 - progress) * canvasHeight * SLIDE_DISTANCE_FACTOR;
	}
	if (type === "zoom-in") next.scale *= 0.7 + progress * 0.3;
	if (type === "zoom-out") next.scale *= 1.3 - progress * 0.3;
	return next;
}

function applyLoopAnimation({
	state,
	type,
	intensity,
	localTime,
	canvasWidth,
	canvasHeight,
}: {
	state: StickerClipAnimationState;
	type: StickerAnimationLoopType;
	intensity: number;
	localTime: number;
	canvasWidth: number;
	canvasHeight: number;
}): StickerClipAnimationState {
	if (type === "none" || intensity === 0) return state;

	const next = { ...state };
	const oneSecondPhase = localTime * Math.PI * 2;
	if (type === "pulse") {
		next.scale *= 1 + Math.sin(oneSecondPhase) * 0.06 * intensity;
	}
	if (type === "drift") {
		const driftPhase = oneSecondPhase / 3;
		next.offsetX += Math.sin(driftPhase) * canvasWidth * 0.03 * intensity;
		next.offsetY += Math.sin(driftPhase * 2) * canvasHeight * 0.02 * intensity;
	}
	if (type === "spin") {
		next.rotation += localTime * 90 * intensity;
	}
	if (type === "wobble") {
		next.rotation += Math.sin(oneSecondPhase * 1.5) * 8 * intensity;
	}
	if (type === "bounce") {
		next.offsetY -=
			Math.abs(Math.sin(oneSecondPhase)) * canvasHeight * 0.04 * intensity;
	}
	if (type === "blink") {
		const blinkProgress = (1 - Math.cos(oneSecondPhase * 2)) / 2;
		next.opacity *= 1 - blinkProgress * 0.85 * intensity;
	}
	return next;
}

export function getStickerClipAnimationState({
	element,
	currentTime,
	canvasWidth,
	canvasHeight,
}: {
	element: StickerElement;
	currentTime: number;
	canvasWidth: number;
	canvasHeight: number;
}): StickerClipAnimationState {
	const animation = resolveStickerClipAnimation({ element });
	const clipDuration = getEffectiveStickerDuration({ element });
	const state: StickerClipAnimationState = {
		opacity: 1,
		scale: 1,
		offsetX: 0,
		offsetY: 0,
		rotation: 0,
	};
	if (clipDuration === 0) return state;

	const startTime = finiteOr({ value: element.startTime, fallback: 0 });
	const safeCurrentTime = finiteOr({ value: currentTime, fallback: startTime });
	const localTime = clamp({
		value: safeCurrentTime - startTime,
		minimum: 0,
		maximum: clipDuration,
	});
	const safeCanvasWidth = Math.max(
		0,
		finiteOr({ value: canvasWidth, fallback: 0 })
	);
	const safeCanvasHeight = Math.max(
		0,
		finiteOr({ value: canvasHeight, fallback: 0 })
	);
	const durations = fitAnimationDurations({ animation, clipDuration });
	const inProgress =
		durations.animationInDuration === 0
			? 1
			: easeOut({
					progress: localTime / durations.animationInDuration,
				});
	const outProgress =
		durations.animationOutDuration === 0
			? 1
			: easeOut({
					progress: (clipDuration - localTime) / durations.animationOutDuration,
				});
	const withEntrance = applyClipAnimation({
		state,
		type: animation.animationInType,
		progress: inProgress,
		canvasWidth: safeCanvasWidth,
		canvasHeight: safeCanvasHeight,
	});
	const withExit = applyClipAnimation({
		state: withEntrance,
		type: animation.animationOutType,
		progress: outProgress,
		canvasWidth: safeCanvasWidth,
		canvasHeight: safeCanvasHeight,
	});
	return applyLoopAnimation({
		state: withExit,
		type: animation.animationLoopType,
		intensity: animation.animationLoopIntensity,
		localTime,
		canvasWidth: safeCanvasWidth,
		canvasHeight: safeCanvasHeight,
	});
}
