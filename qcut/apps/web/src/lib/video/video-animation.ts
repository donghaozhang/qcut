import type {
	MediaAdjustments,
	MediaChromaKey,
	MediaElement,
	MediaEnhancements,
	MediaMask,
} from "@/types/timeline";
import {
	DEFAULT_MEDIA_ADJUSTMENTS,
	DEFAULT_MEDIA_CHROMA_KEY,
	DEFAULT_MEDIA_ENHANCEMENTS,
	DEFAULT_MEDIA_MASK,
	resolveMediaVisualProperties,
} from "./video-properties";
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

function svgDataUrl(svg: string): string {
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function buildMediaMaskStyle(mask?: Partial<MediaMask>): {
	maskImage?: string;
	WebkitMaskImage?: string;
	maskSize?: string;
	WebkitMaskSize?: string;
} {
	const values = { ...DEFAULT_MEDIA_MASK, ...mask };
	if (values.type === "none") return {};
	const visible = values.invert ? "black" : "white";
	const hidden = values.invert ? "white" : "black";
	const blur = Math.max(0, values.feather) * 50;
	const filter = blur > 0 ? ' filter="url(%23blur)"' : "";
	let shape: string;
	if (values.type === "rectangle") {
		shape = `<rect x="${(values.centerX - values.width / 2) * 100}" y="${(values.centerY - values.height / 2) * 100}" width="${values.width * 100}" height="${values.height * 100}" fill="${visible}" transform="rotate(${values.rotation} ${values.centerX * 100} ${values.centerY * 100})"${filter}/>`;
	} else if (values.type === "ellipse") {
		shape = `<ellipse cx="${values.centerX * 100}" cy="${values.centerY * 100}" rx="${values.width * 50}" ry="${values.height * 50}" fill="${visible}" transform="rotate(${values.rotation} ${values.centerX * 100} ${values.centerY * 100})"${filter}/>`;
	} else {
		const spread = Math.min(49, Math.max(0.1, values.feather * 100));
		const first = values.invert ? "white" : "black";
		const second = values.invert ? "black" : "white";
		shape = `<rect width="100" height="100" transform="rotate(${values.rotation} 50 50)" fill="url(%23gradient)"/><defs><linearGradient id="gradient"><stop offset="${50 - spread}%" stop-color="${first}"/><stop offset="${50 + spread}%" stop-color="${second}"/></linearGradient></defs>`;
	}
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><filter id="blur"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><rect width="100" height="100" fill="${hidden}"/>${shape}</svg>`;
	const image = svgDataUrl(svg);
	return {
		maskImage: image,
		WebkitMaskImage: image,
		maskSize: "100% 100%",
		WebkitMaskSize: "100% 100%",
	};
}

export function buildMediaChromaKeyCssFilter(
	chromaKey?: Partial<MediaChromaKey>
): string {
	const values = { ...DEFAULT_MEDIA_CHROMA_KEY, ...chromaKey };
	if (!values.enabled) return "";
	const threshold = Math.min(1, Math.max(0.01, values.similarity)) * 2.2;
	const slope = 1 / Math.max(0.02, values.blend + 0.02);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="key" color-interpolation-filters="sRGB"><feFlood flood-color="${values.color}" result="keyColor"/><feBlend in="SourceGraphic" in2="keyColor" mode="difference" result="difference"/><feColorMatrix in="difference" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 1 1 1 0 -${threshold}" result="mask"/><feComponentTransfer in="mask" result="softMask"><feFuncA type="linear" slope="${slope}" intercept="0"/></feComponentTransfer><feComposite in="SourceGraphic" in2="softMask" operator="in"/></filter></svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}#key")`;
}
