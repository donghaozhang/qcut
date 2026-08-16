import type { EffectRenderProgram } from "./effect-render.js";

export type EffectType =
	| "blur"
	| "brightness"
	| "contrast"
	| "saturation"
	| "hue"
	| "gamma"
	| "sepia"
	| "grayscale"
	| "invert"
	| "vintage"
	| "dramatic"
	| "warm"
	| "cool"
	| "cinematic"
	| "vignette"
	| "grain"
	| "sharpen"
	| "emboss"
	| "edge"
	| "pixelate"
	| "wave"
	| "twist"
	| "bulge"
	| "fisheye"
	| "oil-painting"
	| "watercolor"
	| "pencil-sketch"
	| "halftone"
	| "fade-in"
	| "fade-out"
	| "dissolve"
	| "wipe"
	| "overlay"
	| "multiply"
	| "screen"
	| "color-dodge"
	| "motion"
	| "resource-overlay"
	| "composite-layout"
	| "audio-reactive"
	| "person-tracking";

export interface EffectParameters {
	opacity?: number;
	scale?: number;
	rotate?: number;
	skewX?: number;
	skewY?: number;
	brightness?: number;
	contrast?: number;
	saturation?: number;
	hue?: number;
	gamma?: number;
	blur?: number;
	blurType?: "gaussian" | "box" | "motion";
	sepia?: number;
	grayscale?: number;
	invert?: number;
	vintage?: number;
	dramatic?: number;
	warm?: number;
	cool?: number;
	cinematic?: number;
	vignette?: number;
	grain?: number;
	sharpen?: number;
	emboss?: number;
	edge?: number;
	pixelate?: number;
	chromatic?: number;
	radiance?: number;
	wave?: number;
	waveFrequency?: number;
	waveAmplitude?: number;
	twist?: number;
	twistAngle?: number;
	bulge?: number;
	bulgeRadius?: number;
	fisheye?: number;
	fisheyeStrength?: number;
	ripple?: number;
	swirl?: number;
	oilPainting?: number;
	brushSize?: number;
	watercolor?: number;
	wetness?: number;
	pencilSketch?: number;
	strokeWidth?: number;
	halftone?: number;
	dotSize?: number;
	fadeIn?: number;
	fadeOut?: number;
	dissolve?: number;
	dissolveProgress?: number;
	wipe?: number;
	wipeDirection?: "left" | "right" | "up" | "down";
	wipeProgress?: number;
	overlay?: number;
	overlayOpacity?: number;
	multiply?: number;
	screen?: number;
	colorDodge?: number;
	blendMode?:
		| "normal"
		| "multiply"
		| "screen"
		| "overlay"
		| "darken"
		| "lighten"
		| "color-dodge"
		| "color-burn";
}

export interface EffectKeyframe {
	time: number;
	value: number;
	easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out" | "cubic-bezier";
	controlPoints?: [number, number, number, number];
}

export interface AnimatedParameter {
	parameter: keyof EffectParameters;
	keyframes: EffectKeyframe[];
	interpolation?: "linear" | "step" | "smooth";
}

export interface EffectAudioCompanion {
	resourceId: string;
	offsetSeconds: number;
	durationSeconds: number;
	gain: number;
}

/** Global timeline range assigned when an effect comes from an effect element. */
export interface EffectTimelineRange {
	startTime: number;
	duration: number;
}

/**
 * Slider schema a Jianying package declares. Values are normalized exactly as
 * a Jianying draft stores them (almost always 0..1).
 */
export interface JianyingAdjustParameter {
	key: string;
	defaultValue: number;
	minimum: number;
	maximum: number;
}

export interface JianyingAdjustValue {
	key: string;
	value: number;
}

export interface EffectInstance {
	id: string;
	presetId?: string;
	name: string;
	effectType: EffectType;
	parameters: EffectParameters;
	renderProgram?: EffectRenderProgram;
	audioCompanion?: EffectAudioCompanion;
	duration: number;
	enabled: boolean;
	animations?: AnimatedParameter[];
	/** Runtime range; omitted for legacy effects that cover their entire target clip. */
	timelineRange?: EffectTimelineRange;
	/**
	 * Which renderer owns this effect. "qcut" (the default) uses QCut's own
	 * stages; "jianying-local" defers to the Jianying runtime installed on this
	 * machine, which renders the package identified by packageHash.
	 */
	engine?: EffectEngine;
	/** Package md5, required when engine is "jianying-local". */
	packageHash?: string;
	/** Slider schema for jianying-local effects, copied from the package. */
	adjustParameters?: JianyingAdjustParameter[];
	/** Current slider values, in the package's normalized units. */
	adjustValues?: JianyingAdjustValue[];
}

export type EffectEngine = "qcut" | "jianying-local";

export interface EffectChain {
	id: string;
	name: string;
	effects: EffectInstance[];
	blendMode?: "normal" | "overlay" | "multiply" | "screen";
}
