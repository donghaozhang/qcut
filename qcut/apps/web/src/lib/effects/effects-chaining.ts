import type {
	EffectChain,
	EffectInstance,
	EffectParameters,
} from "@/types/effects";
import { mergeEffectParameters } from "@/lib/effects/effects-utils";

/**
 * Effect Chain Management
 * Handles the sequential application of multiple effects
 */

export type { EffectChain } from "@/types/effects";

/**
 * Process effect chain to get combined parameters
 */
export function processEffectChain(
	effects: EffectInstance[],
	currentTime?: number
): EffectParameters {
	// Filter enabled effects
	const enabledEffects = effects.filter((effect) => effect.enabled);

	if (enabledEffects.length === 0) {
		return {};
	}

	// Process effects in order, merging parameters
	const chainedParams = enabledEffects.reduce((acc, effect) => {
		// Apply time-based animations if currentTime is provided
		let effectParams = { ...effect.parameters };

		if (currentTime !== undefined && effect.animations) {
			effectParams = applyAnimationsAtTime(
				effectParams,
				effect.animations,
				currentTime
			);
		}

		return mergeEffectParameters(acc, effectParams);
	}, {} as EffectParameters);

	return chainedParams;
}

/**
 * Apply animations to parameters at specific time
 */
function applyAnimationsAtTime(
	parameters: EffectParameters,
	animations: any[],
	time: number
): EffectParameters {
	const animatedParams = { ...parameters };

	animations.forEach((animation) => {
		const value = interpolateKeyframes(animation.keyframes, time);
		(animatedParams as any)[animation.parameter] = value;
	});

	return animatedParams;
}

/**
 * Interpolate between keyframes
 */
function interpolateKeyframes(keyframes: any[], time: number): number {
	if (keyframes.length === 0) return 0;
	if (keyframes.length === 1) return keyframes[0].value;

	// Find surrounding keyframes
	let before = keyframes[0];
	let after = keyframes[keyframes.length - 1];

	for (let i = 0; i < keyframes.length - 1; i++) {
		if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
			before = keyframes[i];
			after = keyframes[i + 1];
			break;
		}
	}

	if (time <= before.time) return before.value;
	if (time >= after.time) return after.value;

	// Linear interpolation
	const progress = (time - before.time) / (after.time - before.time);
	return before.value + (after.value - before.value) * progress;
}

/**
 * Layer multiple effect chains with blend modes
 */
export function layerEffectChains(
	chains: EffectChain[],
	currentTime?: number
): EffectParameters {
	if (chains.length === 0) return {};

	// Process first chain as base
	const baseParams = processEffectChain(chains[0].effects, currentTime);

	if (chains.length === 1) return baseParams;

	// Layer additional chains
	return chains.slice(1).reduce((acc, chain) => {
		const chainParams = processEffectChain(chain.effects, currentTime);
		return blendParameters(acc, chainParams, chain.blendMode || "normal");
	}, baseParams);
}

/**
 * Blend parameters based on blend mode
 */
function blendParameters(
	base: EffectParameters,
	overlay: EffectParameters,
	blendMode: string
): EffectParameters {
	const blended = { ...base };

	switch (blendMode) {
		case "overlay":
			// Overlay blend mode - emphasizes contrast
			for (const key in overlay) {
				if (Object.hasOwn(overlay, key)) {
					const baseValue = (base as any)[key] || 0;
					const overlayValue = (overlay as any)[key] || 0;

					if (
						typeof baseValue === "number" &&
						typeof overlayValue === "number"
					) {
						if (baseValue < 50) {
							(blended as any)[key] = (2 * baseValue * overlayValue) / 100;
						} else {
							(blended as any)[key] =
								100 - (2 * (100 - baseValue) * (100 - overlayValue)) / 100;
						}
					}
				}
			}
			break;

		case "multiply":
			// Multiply blend mode - darkens
			for (const key in overlay) {
				if (Object.hasOwn(overlay, key)) {
					const baseValue = (base as any)[key] || 0;
					const overlayValue = (overlay as any)[key] || 0;

					if (
						typeof baseValue === "number" &&
						typeof overlayValue === "number"
					) {
						(blended as any)[key] = (baseValue * overlayValue) / 100;
					}
				}
			}
			break;

		case "screen":
			// Screen blend mode - lightens
			for (const key in overlay) {
				if (Object.hasOwn(overlay, key)) {
					const baseValue = (base as any)[key] || 0;
					const overlayValue = (overlay as any)[key] || 0;

					if (
						typeof baseValue === "number" &&
						typeof overlayValue === "number"
					) {
						(blended as any)[key] =
							100 - ((100 - baseValue) * (100 - overlayValue)) / 100;
					}
				}
			}
			break;

		default:
			// Normal blend - overlay values override base
			Object.assign(blended, overlay);
			break;
	}

	// Set blend mode
	if (blendMode !== "normal") {
		blended.blendMode = blendMode as any;
	}

	return blended;
}

/**
 * Create an independent chain from active effect instances.
 */
export function createEffectChain(
	name: string,
	effectIds: string[],
	availableEffects: EffectInstance[]
): EffectChain {
	const effects = effectIds
		.map((id) => availableEffects.find((effect) => effect.id === id))
		.filter((effect): effect is EffectInstance => effect !== undefined)
		.map((effect) => ({
			...effect,
			id: crypto.randomUUID(),
			parameters: { ...effect.parameters },
			animations: effect.animations?.map((animation) => ({
				...animation,
				keyframes: animation.keyframes.map((keyframe) => ({ ...keyframe })),
			})),
		}));

	return {
		id: crypto.randomUUID(),
		name,
		effects,
	};
}

/**
 * Validation result for effect chains
 */
export interface EffectChainValidationResult {
	isValid: boolean;
	warnings: string[];
	errors: string[];
}

/**
 * Validate effect chain and return detailed result
 */
export function validateEffectChain(
	chain: EffectChain
): EffectChainValidationResult {
	const warnings: string[] = [];
	const errors: string[] = [];

	// Check required fields
	if (!chain.id) {
		errors.push("Effect chain is missing an ID");
	}
	if (!chain.name) {
		errors.push("Effect chain is missing a name");
	}
	if (!chain.effects) {
		errors.push("Effect chain is missing effects array");
	}

	// Return early if basic validation fails
	if (errors.length > 0) {
		return {
			isValid: false,
			warnings,
			errors,
		};
	}

	// Check for parameter conflicts
	const parameterUsage = new Map<string, number>();

	for (const effect of chain.effects) {
		for (const param in effect.parameters) {
			if (Object.hasOwn(effect.parameters, param)) {
				const count = parameterUsage.get(param) || 0;
				parameterUsage.set(param, count + 1);

				// Collect warning if same parameter is modified multiple times
				if (count > 2) {
					warnings.push(
						`Parameter "${param}" is modified ${count + 1} times in chain. This may cause unexpected results.`
					);
				}
			}
		}
	}

	// Check for potential performance issues
	if (chain.effects.length > 10) {
		warnings.push(
			`Chain contains ${chain.effects.length} effects. Consider optimizing for performance.`
		);
	}

	return {
		isValid: errors.length === 0,
		warnings,
		errors,
	};
}

/**
 * Simple validation check that returns boolean
 * Use validateEffectChain() for detailed validation results
 */
export function isEffectChainValid(chain: EffectChain): boolean {
	return validateEffectChain(chain).isValid;
}

/**
 * Optimize effect chain by combining compatible effects
 */
export function optimizeEffectChain(chain: EffectChain): EffectChain {
	const optimized: EffectInstance[] = [];
	let current: EffectInstance | null = null;

	for (const effect of chain.effects) {
		if (!effect.enabled) continue;

		if (!current) {
			current = { ...effect };
		} else if (canCombineEffects(current, effect)) {
			// Combine parameters
			current.parameters = mergeEffectParameters(
				current.parameters,
				effect.parameters
			);
			current.name = `${current.name} + ${effect.name}`;
		} else {
			optimized.push(current);
			current = { ...effect };
		}
	}

	if (current) {
		optimized.push(current);
	}

	return {
		...chain,
		effects: optimized,
	};
}

/**
 * Check if two effects can be combined
 */
function canCombineEffects(a: EffectInstance, b: EffectInstance): boolean {
	// Can combine if they modify different parameters
	const aParams = new Set(Object.keys(a.parameters));
	const bParams = new Set(Object.keys(b.parameters));

	for (const param of bParams) {
		if (aParams.has(param)) {
			return false; // Overlapping parameters, can't combine
		}
	}

	return true;
}
