import type { SubtitleStyle } from "../types/timeline.js";

export const CAPTION_ANIMATION_TYPES = [
	"none",
	"fade",
	"slide-up",
	"slide-left",
] as const;

export interface CaptionAnimationState {
	opacity: number;
	offsetX: number;
	offsetY: number;
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function resolveCaptionAnimation({ style }: { style: SubtitleStyle }) {
	return {
		type: style.animationType,
		duration: clamp({ value: style.animationDuration, min: 0.1, max: 10 }),
		delay: clamp({ value: style.animationDelay, min: 0, max: 60 }),
	};
}

export function getCaptionAnimationState({
	style,
	startTime,
	currentTime,
}: {
	style: SubtitleStyle;
	startTime: number;
	currentTime: number;
}): CaptionAnimationState {
	const animation = resolveCaptionAnimation({ style });
	if (animation.type === "none") {
		return { opacity: 1, offsetX: 0, offsetY: 0 };
	}

	const elapsed = currentTime - startTime - animation.delay;
	const progress = clamp({
		value: elapsed / animation.duration,
		min: 0,
		max: 1,
	});
	const remaining = 1 - progress;

	if (animation.type === "slide-up") {
		return { opacity: progress, offsetX: 0, offsetY: 80 * remaining };
	}
	if (animation.type === "slide-left") {
		return { opacity: progress, offsetX: 120 * remaining, offsetY: 0 };
	}
	return { opacity: progress, offsetX: 0, offsetY: 0 };
}
