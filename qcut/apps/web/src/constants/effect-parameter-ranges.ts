// Centralized effect parameter ranges configuration
// Ensures consistency across keyboard shortcuts, keyframe timeline, and other components

import type { EffectParameters } from "@/types/effects";

export type ParamRange = Readonly<{
	min: number;
	max: number;
	step: number;
}>;

// Type for numeric parameter keys (excluding string enums like blurType, wipeDirection, blendMode)
export type NumericParameterKey =
	| "opacity"
	| "scale"
	| "rotate"
	| "skewX"
	| "skewY"
	| "brightness"
	| "contrast"
	| "saturation"
	| "hue"
	| "gamma"
	| "blur"
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
	| "chromatic"
	| "radiance"
	| "wave"
	| "waveFrequency"
	| "waveAmplitude"
	| "twist"
	| "twistAngle"
	| "bulge"
	| "bulgeRadius"
	| "fisheye"
	| "fisheyeStrength"
	| "ripple"
	| "swirl"
	| "oilPainting"
	| "brushSize"
	| "watercolor"
	| "wetness"
	| "pencilSketch"
	| "strokeWidth"
	| "halftone"
	| "dotSize"
	| "fadeIn"
	| "fadeOut"
	| "dissolve"
	| "dissolveProgress"
	| "wipe"
	| "wipeProgress"
	| "overlay"
	| "overlayOpacity"
	| "multiply"
	| "screen"
	| "colorDodge";

// Note: Enum parameters (blurType, wipeDirection, blendMode) are handled separately
// as they don't have meaningful numeric ranges for keyboard shortcuts
export const PARAMETER_RANGES = {
	// Transform parameters
	opacity: { min: 0, max: 100, step: 1 },
	scale: { min: 0, max: 500, step: 10 },
	rotate: { min: -360, max: 360, step: 15 },
	skewX: { min: -45, max: 45, step: 5 },
	skewY: { min: -45, max: 45, step: 5 },

	// Basic parameters
	brightness: { min: -100, max: 100, step: 10 },
	contrast: { min: -100, max: 100, step: 10 },
	saturation: { min: -100, max: 200, step: 10 },
	hue: { min: -180, max: 180, step: 1 },
	gamma: { min: 0.1, max: 3, step: 0.1 },

	// Blur parameters
	blur: { min: 0, max: 20, step: 1 },

	// Color effects
	sepia: { min: 0, max: 100, step: 10 },
	grayscale: { min: 0, max: 100, step: 10 },
	invert: { min: 0, max: 100, step: 10 },

	// Style effects
	vintage: { min: 0, max: 100, step: 10 },
	dramatic: { min: 0, max: 100, step: 10 },
	warm: { min: 0, max: 100, step: 10 },
	cool: { min: 0, max: 100, step: 10 },
	cinematic: { min: 0, max: 100, step: 10 },

	// Enhancement effects
	vignette: { min: 0, max: 100, step: 10 },
	grain: { min: 0, max: 100, step: 10 },
	sharpen: { min: 0, max: 100, step: 10 },
	emboss: { min: 0, max: 100, step: 10 },
	edge: { min: 0, max: 100, step: 10 },
	pixelate: { min: 1, max: 50, step: 5 },
	chromatic: { min: 0, max: 100, step: 5 },
	radiance: { min: 0, max: 100, step: 5 },

	// Distortion effects
	wave: { min: 0, max: 100, step: 10 },
	waveFrequency: { min: 1, max: 20, step: 1 },
	waveAmplitude: { min: 0, max: 50, step: 5 },
	twist: { min: 0, max: 360, step: 15 },
	twistAngle: { min: -180, max: 180, step: 15 },
	bulge: { min: -100, max: 100, step: 10 },
	bulgeRadius: { min: 10, max: 500, step: 25 },
	fisheye: { min: 0, max: 100, step: 10 },
	fisheyeStrength: { min: 0.1, max: 3, step: 0.1 },
	ripple: { min: 0, max: 100, step: 10 },
	swirl: { min: 0, max: 360, step: 15 },

	// Artistic effects
	oilPainting: { min: 0, max: 100, step: 10 },
	brushSize: { min: 1, max: 50, step: 2 },
	watercolor: { min: 0, max: 100, step: 10 },
	wetness: { min: 0, max: 100, step: 10 },
	pencilSketch: { min: 0, max: 100, step: 10 },
	strokeWidth: { min: 1, max: 20, step: 1 },
	halftone: { min: 0, max: 100, step: 10 },
	dotSize: { min: 1, max: 20, step: 1 },

	// Transition effects
	fadeIn: { min: 0, max: 100, step: 10 },
	fadeOut: { min: 0, max: 100, step: 10 },
	dissolve: { min: 0, max: 100, step: 10 },
	dissolveProgress: { min: 0, max: 100, step: 10 },
	wipe: { min: 0, max: 100, step: 10 },
	wipeProgress: { min: 0, max: 100, step: 10 },

	// Composite effects
	overlay: { min: 0, max: 100, step: 10 },
	overlayOpacity: { min: 0, max: 100, step: 10 },
	multiply: { min: 0, max: 100, step: 10 },
	screen: { min: 0, max: 100, step: 10 },
	colorDodge: { min: 0, max: 100, step: 10 },
} as const;

// Helper function to get parameter range with fallback
export function getParameterRange(param: string): ParamRange {
	const range = PARAMETER_RANGES[param as keyof typeof PARAMETER_RANGES];
	return range || { min: -100, max: 100, step: 10 };
}
