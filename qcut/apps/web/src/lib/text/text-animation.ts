import type { TextElement } from "@/types/timeline";

export const TEXT_ANIMATION_TYPES = [
	"none",
	"fade",
	"slide-up",
	"slide-left",
] as const;

export interface ResolvedTextAnimation {
	type: NonNullable<TextElement["animationType"]>;
	duration: number;
	delay: number;
}

export interface TextAnimationState {
	opacity: number;
	offsetX: number;
	offsetY: number;
}

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function resolveTextAnimation(
	element: TextElement
): ResolvedTextAnimation {
	return {
		type: element.animationType ?? "none",
		duration: clamp(element.animationDuration ?? 0.6, 0.1, 10),
		delay: clamp(element.animationDelay ?? 0, 0, 60),
	};
}

export function getTextAnimationState(
	element: TextElement,
	currentTime: number
): TextAnimationState {
	const animation = resolveTextAnimation(element);
	if (animation.type === "none") {
		return { opacity: 1, offsetX: 0, offsetY: 0 };
	}

	const visibleStart = element.startTime + (element.trimStart ?? 0);
	const elapsed = currentTime - visibleStart - animation.delay;
	const progress = clamp(elapsed / animation.duration, 0, 1);
	const remaining = 1 - progress;

	if (animation.type === "slide-up") {
		return { opacity: progress, offsetX: 0, offsetY: 80 * remaining };
	}
	if (animation.type === "slide-left") {
		return { opacity: progress, offsetX: 120 * remaining, offsetY: 0 };
	}
	return { opacity: progress, offsetX: 0, offsetY: 0 };
}

function formatSeconds(value: number): string {
	return Number(value.toFixed(3)).toString();
}

export interface FFmpegTextAnimationExpressions {
	alpha?: string;
	xOffset?: string;
	yOffset?: string;
}

export function buildFFmpegTextAnimationExpressions(
	element: TextElement
): FFmpegTextAnimationExpressions {
	const animation = resolveTextAnimation(element);
	if (animation.type === "none") return {};

	const start = element.startTime + (element.trimStart ?? 0) + animation.delay;
	const end = start + animation.duration;
	const progress = `max(0,min(1,(t-${formatSeconds(start)})/${formatSeconds(animation.duration)}))`;
	const alpha = `if(lt(t,${formatSeconds(start)}),0,if(lt(t,${formatSeconds(end)}),${progress},1))`;

	if (animation.type === "slide-up") {
		return { alpha, yOffset: `80*(1-${progress})` };
	}
	if (animation.type === "slide-left") {
		return { alpha, xOffset: `120*(1-${progress})` };
	}
	return { alpha };
}
