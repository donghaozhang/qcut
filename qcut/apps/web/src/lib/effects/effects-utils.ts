import type { EffectParameters } from "@/types/effects";
import { generateUUID } from "@/lib/utils";

/**
 * Converts effect parameters to CSS filter string
 * This is used for real-time preview of effects in the video editor
 */
export function parametersToCSSFilters(parameters: EffectParameters): string {
	const filters: string[] = [];

	// Brightness
	if (parameters.brightness !== undefined) {
		const brightness = 1 + parameters.brightness / 100;
		filters.push(`brightness(${brightness})`);
	}

	// Contrast
	if (parameters.contrast !== undefined) {
		const contrast = 1 + parameters.contrast / 100;
		filters.push(`contrast(${contrast})`);
	}

	// Saturation
	if (parameters.saturation !== undefined) {
		const saturation = 1 + parameters.saturation / 100;
		filters.push(`saturate(${saturation})`);
	}

	// Hue rotation
	if (parameters.hue !== undefined) {
		filters.push(`hue-rotate(${parameters.hue}deg)`);
	}

	// Blur
	if (parameters.blur !== undefined) {
		filters.push(`blur(${parameters.blur}px)`);
	}

	// Sepia
	if (parameters.sepia !== undefined) {
		const sepia = parameters.sepia / 100;
		filters.push(`sepia(${sepia})`);
	}

	// Grayscale
	if (parameters.grayscale !== undefined) {
		const grayscale = parameters.grayscale / 100;
		filters.push(`grayscale(${grayscale})`);
	}

	// Invert
	if (parameters.invert !== undefined) {
		const invert = parameters.invert / 100;
		filters.push(`invert(${invert})`);
	}

	// Sharpen — CSS has no sharpen filter; approximate perceived crispness with
	// a small contrast lift (real sharpening happens on export via unsharp).
	if (parameters.sharpen !== undefined && parameters.sharpen > 0) {
		const sharpenContrast = 1 + (parameters.sharpen / 100) * 0.35;
		filters.push(`contrast(${sharpenContrast.toFixed(3)})`);
	}

	// Combined effects that need custom implementation
	if (parameters.vintage !== undefined) {
		// Vintage effect combines multiple filters
		const vintageStrength = parameters.vintage / 100;
		filters.push(`sepia(${vintageStrength * 0.5})`);
		filters.push(`contrast(${1.2})`);
		filters.push(`brightness(${0.9})`);
	}

	if (parameters.dramatic !== undefined) {
		// Dramatic effect with high contrast and slight desaturation
		const dramaticStrength = parameters.dramatic / 100;
		filters.push(`contrast(${1 + dramaticStrength * 0.5})`);
		filters.push(`saturate(${1 - dramaticStrength * 0.2})`);
		filters.push(`brightness(${1 - dramaticStrength * 0.1})`);
	}

	if (parameters.warm !== undefined) {
		// Warm filter adjusts hue towards orange/red
		const warmStrength = parameters.warm / 100;
		filters.push(`hue-rotate(${warmStrength * -10}deg)`);
		filters.push(`saturate(${1 + warmStrength * 0.2})`);
	}

	if (parameters.cool !== undefined) {
		// Cool filter adjusts hue towards blue
		const coolStrength = parameters.cool / 100;
		filters.push(`hue-rotate(${coolStrength * 10}deg)`);
		filters.push(`saturate(${1 + coolStrength * 0.1})`);
		filters.push(`brightness(${1 + coolStrength * 0.05})`);
	}

	if (parameters.cinematic !== undefined) {
		// Cinematic look with adjusted contrast and slight teal/orange
		const cinematicStrength = parameters.cinematic / 100;
		filters.push(`contrast(${1 + cinematicStrength * 0.3})`);
		filters.push(`saturate(${1 - cinematicStrength * 0.1})`);
		filters.push(`hue-rotate(${cinematicStrength * 5}deg)`);
	}

	// Advanced distortion effects (using CSS transforms where possible)
	if (parameters.pixelate !== undefined && parameters.pixelate > 0) {
		// Pixelate effect - simulated with blur for CSS
		// Real pixelation would need canvas processing
		filters.push(`blur(${parameters.pixelate / 10}px)`);
	}

	// Artistic effects
	if (parameters.oilPainting !== undefined) {
		// Oil painting effect - approximated with contrast and saturation
		const strength = parameters.oilPainting / 100;
		filters.push(`contrast(${1 + strength * 0.4})`);
		filters.push(`saturate(${1 + strength * 0.3})`);
	}

	if (parameters.watercolor !== undefined) {
		// Watercolor effect - soft and desaturated
		const strength = parameters.watercolor / 100;
		filters.push(`contrast(${1 - strength * 0.2})`);
		filters.push(`saturate(${1 - strength * 0.3})`);
		filters.push(`blur(${strength * 0.5}px)`);
	}

	if (parameters.pencilSketch !== undefined) {
		// Pencil sketch - high contrast grayscale
		const strength = parameters.pencilSketch / 100;
		filters.push("grayscale(1)");
		filters.push(`contrast(${1 + strength * 0.8})`);
		filters.push(`brightness(${1 + strength * 0.1})`);
	}

	// Transition effects (opacity-based)
	if (parameters.fadeIn !== undefined) {
		const opacity = parameters.fadeIn / 100;
		filters.push(`opacity(${opacity})`);
	}

	if (parameters.fadeOut !== undefined) {
		const opacity = 1 - parameters.fadeOut / 100;
		filters.push(`opacity(${opacity})`);
	}

	// Composite effects using blend modes
	if (
		parameters.overlay !== undefined &&
		parameters.overlayOpacity !== undefined
	) {
		const opacity = parameters.overlayOpacity / 100;
		filters.push(`opacity(${opacity})`);
	}

	return filters.join(" ");
}

/**
 * Applies effects to a canvas context
 * Used during export/rendering process
 */
export function applyEffectsToCanvas(
	ctx: CanvasRenderingContext2D,
	parameters: EffectParameters
): void {
	const filterString = parametersToCSSFilters(parameters);
	console.log("🎨 CANVAS EFFECTS: Applying filter to canvas context");
	console.log("  🔧 Parameters:", parameters);
	console.log(`  ✨ CSS Filter: "${filterString || "none"}"`);
	console.log(`  🎯 Canvas filter before: "${ctx.filter}"`);
	ctx.filter = filterString ? filterString : "none";
	console.log(`  ✅ Canvas filter after: "${ctx.filter}"`);
}

/**
 * Resets canvas filters
 */
export function resetCanvasFilters(ctx: CanvasRenderingContext2D): void {
	ctx.filter = "none";
}

/**
 * Validates effect parameters
 */
export function validateEffectParameters(
	parameters: EffectParameters
): boolean {
	// Check brightness range
	if (parameters.brightness !== undefined) {
		if (parameters.brightness < -100 || parameters.brightness > 100) {
			return false;
		}
	}

	// Check contrast range
	if (parameters.contrast !== undefined) {
		if (parameters.contrast < -100 || parameters.contrast > 100) {
			return false;
		}
	}

	// Check saturation range
	if (parameters.saturation !== undefined) {
		if (parameters.saturation < -100 || parameters.saturation > 200) {
			return false;
		}
	}

	// Check blur range (must be non-negative)
	if (parameters.blur !== undefined) {
		if (parameters.blur < 0 || parameters.blur > 100) {
			return false;
		}
	}

	// Check opacity range (0-100 for percentage, will be converted to 0-1 for CSS)
	if (parameters.opacity !== undefined) {
		if (parameters.opacity < 0 || parameters.opacity > 100) {
			return false;
		}
	}

	// Check other percentage-based parameters
	const percentageParams = [
		"sepia",
		"grayscale",
		"invert",
		"vintage",
		"dramatic",
		"warm",
		"cool",
		"cinematic",
		"fadeIn",
		"fadeOut",
		"overlayOpacity",
	] as const;

	for (const param of percentageParams) {
		const value = parameters[param as keyof EffectParameters];
		if (value !== undefined && typeof value === "number") {
			if (value < 0 || value > 100) {
				return false;
			}
		}
	}

	return true;
}

/**
 * Merges multiple effect parameters with consistent behavior
 *
 * Merging strategy:
 * - Additive parameters (brightness, contrast, saturation, hue): Values are summed
 * - Multiplicative parameters (blur, opacity, scale): Values are multiplied
 * - Override parameters (all others): Last value wins
 *
 * @param parameterSets - Array of effect parameters to merge
 * @returns Merged effect parameters
 */
export function mergeEffectParameters(
	...parameterSets: EffectParameters[]
): EffectParameters {
	const merged: EffectParameters = {};

	// Define merging strategies for different parameter types
	const additiveParams = ["brightness", "contrast", "saturation", "hue"];
	const multiplicativeParams = ["blur", "opacity", "scale"];

	for (const params of parameterSets) {
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) {
				const typedKey = key as keyof EffectParameters;
				const currentValue = merged[typedKey];

				if (additiveParams.includes(key)) {
					// Additive: sum values (useful for color adjustments)
					const numericCurrentValue =
						typeof currentValue === "number" ? currentValue : 0;
					const numericValue = typeof value === "number" ? value : 0;
					(merged as any)[typedKey] = numericCurrentValue + numericValue;
				} else if (multiplicativeParams.includes(key)) {
					// Multiplicative: multiply values (useful for cumulative effects)
					// Default to 1 for first value to maintain multiplication identity
					const numericCurrentValue =
						typeof currentValue === "number" ? currentValue : 1;
					const numericValue = typeof value === "number" ? value : 1;
					(merged as any)[typedKey] = numericCurrentValue * numericValue;
				} else {
					// Override: last value wins (for discrete/boolean parameters)
					merged[typedKey] = value;
				}
			}
		}
	}

	// Clamp values to valid ranges after merging
	if (merged.brightness !== undefined) {
		merged.brightness = Math.max(-100, Math.min(100, merged.brightness));
	}
	if (merged.contrast !== undefined) {
		merged.contrast = Math.max(-100, Math.min(100, merged.contrast));
	}
	if (merged.saturation !== undefined) {
		merged.saturation = Math.max(-100, Math.min(200, merged.saturation));
	}
	if (merged.opacity !== undefined) {
		merged.opacity = Math.max(0, Math.min(1, merged.opacity));
	}
	if (merged.blur !== undefined) {
		merged.blur = Math.max(0, Math.min(100, merged.blur));
	}

	return merged;
}

/**
 * Gets default parameters for an effect type
 */
export function getDefaultParameters(effectType: string): EffectParameters {
	const defaults: Record<string, EffectParameters> = {
		brightness: { brightness: 0 },
		contrast: { contrast: 0 },
		saturation: { saturation: 0 },
		hue: { hue: 0 },
		blur: { blur: 0 },
		sepia: { sepia: 50 },
		grayscale: { grayscale: 100 },
		invert: { invert: 100 },
		vintage: { vintage: 70 },
		dramatic: { dramatic: 60 },
		warm: { warm: 50 },
		cool: { cool: 50 },
		cinematic: { cinematic: 70 },
	};

	return defaults[effectType] || {};
}

/**
 * Creates a unique effect ID
 */
export function createEffectId(): string {
	return generateUUID();
}
