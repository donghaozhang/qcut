import type {
	MediaAdjustments,
	MediaChromaKey,
	MediaCustomCutout,
	MediaElement,
	MediaEnhancements,
	MediaMask,
} from "@/types/timeline";
import {
	DEFAULT_MEDIA_ADJUSTMENTS,
	DEFAULT_MEDIA_ENHANCEMENTS,
	DEFAULT_MEDIA_MASK,
	resolveMediaVisualProperties,
} from "./video-properties";
import { mediaMaskSvgDataUrl } from "./media-mask-svg";
import {
	chromaCleanupPasses,
	chromaScreenType,
	effectiveChromaSimilarity,
	normalizeMediaChromaKey,
} from "./media-chroma-key";
import { getMediaTimelineDuration } from "./video-timing";

export interface MediaAnimationState {
	opacity: number;
	scale: number;
	offsetX: number;
	offsetY: number;
}

function easeOut(progress: number): number {
	const clamped = Math.min(1, Math.max(0, progress));
	return 1 - (1 - clamped) ** 3;
}

function applyAnimation(
	state: MediaAnimationState,
	type: NonNullable<MediaElement["animationInType"]>,
	progress: number,
	width: number,
	height: number
) {
	if (type === "none") return;
	if (type === "fade") state.opacity *= progress;
	if (type === "slide-left") state.offsetX -= (1 - progress) * width * 0.25;
	if (type === "slide-right") state.offsetX += (1 - progress) * width * 0.25;
	if (type === "slide-up") state.offsetY -= (1 - progress) * height * 0.25;
	if (type === "slide-down") state.offsetY += (1 - progress) * height * 0.25;
	if (type === "zoom-in") state.scale *= 0.7 + progress * 0.3;
	if (type === "zoom-out") state.scale *= 1.3 - progress * 0.3;
}

export function getMediaAnimationState({
	element,
	currentTime,
	canvasWidth,
	canvasHeight,
}: {
	element: MediaElement;
	currentTime: number;
	canvasWidth: number;
	canvasHeight: number;
}): MediaAnimationState {
	const visual = resolveMediaVisualProperties(element);
	const localTime = Math.max(0, currentTime - element.startTime);
	const effectiveDuration = Math.max(0.001, getMediaTimelineDuration(element));
	const state: MediaAnimationState = {
		opacity: 1,
		scale: 1,
		offsetX: 0,
		offsetY: 0,
	};
	const inProgress = easeOut(localTime / visual.animationInDuration);
	applyAnimation(
		state,
		visual.animationInType,
		inProgress,
		canvasWidth,
		canvasHeight
	);
	const outProgress = easeOut(
		(effectiveDuration - localTime) / visual.animationOutDuration
	);
	applyAnimation(
		state,
		visual.animationOutType,
		outProgress,
		canvasWidth,
		canvasHeight
	);

	const intensity = visual.comboAnimationIntensity;
	if (visual.comboAnimationType === "pulse") {
		state.scale *= 1 + Math.sin(localTime * Math.PI * 2) * 0.04 * intensity;
	}
	if (visual.comboAnimationType === "drift") {
		state.offsetX +=
			Math.sin(localTime * Math.PI) * canvasWidth * 0.03 * intensity;
		state.offsetY +=
			Math.cos(localTime * Math.PI * 0.75) * canvasHeight * 0.02 * intensity;
	}
	return state;
}

export function resolveMediaAdjustments(
	adjustments?: Partial<MediaAdjustments>
): MediaAdjustments {
	return { ...DEFAULT_MEDIA_ADJUSTMENTS, ...adjustments };
}

export function buildMediaCssFilter(
	adjustments?: Partial<MediaAdjustments>
): string {
	const values = resolveMediaAdjustments(adjustments);
	const fade = Math.max(0, Math.min(100, values.fade)) / 100;
	const filters = [
		`brightness(${Math.max(0, 1 + values.brightness / 100 + fade * 0.06)})`,
		`contrast(${Math.max(0, 1 + values.contrast / 100 - fade * 0.25)})`,
		`saturate(${Math.max(0, 1 + values.saturation / 100 - fade * 0.15)})`,
	];
	if (values.temperature !== 0 || values.tint !== 0) {
		filters.push(
			`sepia(${Math.min(0.35, Math.abs(values.temperature) / 300)})`
		);
		filters.push(
			`hue-rotate(${values.temperature * -0.08 + values.tint * 0.12}deg)`
		);
	}
	if (values.sharpness > 0) {
		filters.push(`contrast(${1 + values.sharpness / 500})`);
	}
	return filters.join(" ");
}

export function buildMediaVignetteBackground(
	adjustments?: Partial<MediaAdjustments>
): string | undefined {
	const vignette = resolveMediaAdjustments(adjustments).vignette;
	if (vignette <= 0) return undefined;
	const alpha = Math.min(0.8, vignette / 125);
	return `radial-gradient(circle, transparent 45%, rgba(0, 0, 0, ${alpha}) 100%)`;
}

export function buildMediaEnhancementCssFilter(
	enhancements?: Partial<MediaEnhancements>
): string {
	const values = { ...DEFAULT_MEDIA_ENHANCEMENTS, ...enhancements };
	const filters: string[] = [];
	if (values.relight !== 0 || values.beauty > 0) {
		filters.push(
			`brightness(${Math.max(0.2, 1 + values.relight / 250 + values.beauty / 1000)})`
		);
	}
	if (values.clarity > 0) {
		filters.push(`contrast(${1 + values.clarity / 500})`);
	}
	if (values.denoise > 0 || values.beauty > 0) {
		filters.push(`blur(${(values.denoise + values.beauty * 0.5) / 500}px)`);
	}
	return filters.join(" ");
}

export function buildMediaMaskStyle(
	maskOrMasks?: Partial<MediaMask> | MediaMask[],
	customCutout?: Partial<MediaCustomCutout>,
	currentFrame = 0
): {
	maskImage?: string;
	WebkitMaskImage?: string;
	maskSize?: string;
	WebkitMaskSize?: string;
	maskRepeat?: string;
	WebkitMaskRepeat?: string;
} {
	const masks = Array.isArray(maskOrMasks)
		? maskOrMasks
		: maskOrMasks?.type && maskOrMasks.type !== "none"
			? [{ ...DEFAULT_MEDIA_MASK, ...maskOrMasks }]
			: [];
	const image = mediaMaskSvgDataUrl(
		masks as MediaMask[],
		customCutout,
		currentFrame
	);
	if (!image) return {};
	return {
		maskImage: image,
		WebkitMaskImage: image,
		maskSize: "100% 100%",
		WebkitMaskSize: "100% 100%",
		maskRepeat: "no-repeat",
		WebkitMaskRepeat: "no-repeat",
	};
}

export function buildMediaChromaKeyCssFilter(
	chromaKey?: Partial<MediaChromaKey>
): string {
	const values = normalizeMediaChromaKey(chromaKey);
	if (!values.enabled) return "";
	const threshold =
		effectiveChromaSimilarity({
			similarity: values.similarity,
			shadow: values.shadow,
		}) * 2.2;
	const slope = 1 / Math.max(0.02, values.blend + 0.02);
	const cleanupPasses = chromaCleanupPasses({ cleanup: values.cleanup });
	const cleanup = cleanupPasses
		? `<feMorphology in="softMask" operator="erode" radius="${cleanupPasses}" result="cleanMask"/>`
		: "";
	const cleanedMask = cleanupPasses ? "cleanMask" : "softMask";
	const feather =
		values.blend > 0
			? `<feGaussianBlur in="${cleanedMask}" stdDeviation="${values.blend * 2}" result="featheredMask"/>`
			: "";
	const outputMask = values.blend > 0 ? "featheredMask" : cleanedMask;
	const keep = 1 - values.spill;
	const mix = values.spill / 2;
	const spillMatrix =
		chromaScreenType({ color: values.color }) === "green"
			? `1 0 0 0 0 ${mix} ${keep} ${mix} 0 0 0 0 1 0 0 0 0 0 1 0`
			: `1 0 0 0 0 0 1 0 0 0 ${mix} ${mix} ${keep} 0 0 0 0 0 1 0`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="key" color-interpolation-filters="sRGB"><feFlood flood-color="${values.color}" result="keyColor"/><feBlend in="SourceGraphic" in2="keyColor" mode="difference" result="difference"/><feColorMatrix in="difference" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 1 1 1 0 -${threshold}" result="mask"/><feComponentTransfer in="mask" result="softMask"><feFuncA type="linear" slope="${slope}" intercept="0"/></feComponentTransfer>${cleanup}${feather}<feColorMatrix in="SourceGraphic" type="matrix" values="${spillMatrix}" result="despilled"/><feComposite in="despilled" in2="${outputMask}" operator="in"/></filter></svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}#key")`;
}
