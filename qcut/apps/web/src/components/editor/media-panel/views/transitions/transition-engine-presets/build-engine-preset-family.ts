import type {
	ClipTransitionDirection,
	ClipTransitionTuning,
	ClipTransitionType,
} from "@/types/timeline";
import {
	defineTransitionPreset,
	type TransitionContentCategory,
	type TransitionPreset,
	type TransitionType,
} from "../transition-preset-types";

export interface EngineVariant {
	id: string;
	name: string;
	localizedName: string;
	category: TransitionContentCategory;
	direction?: ClipTransitionDirection;
	intensity: number;
	frequency?: number;
	tint?: string;
}

export function enginePresetFamily({
	clipType,
	type,
	variants,
}: {
	clipType: ClipTransitionType;
	type: TransitionType;
	variants: readonly EngineVariant[];
}): TransitionPreset[] {
	return variants.map((variant, index) => {
		const tuning: ClipTransitionTuning = {
			intensity: variant.intensity,
			...(variant.frequency ? { frequency: variant.frequency } : {}),
			...(variant.tint ? { tint: variant.tint } : {}),
		};
		return defineTransitionPreset({
			...variant,
			type,
			clipType,
			tuning,
			defaultDuration: 0.36 + (index % 5) * 0.07,
			delivery: index >= 4 ? "remote" : "bundled",
			premium: index === variants.length - 1,
			popular: index === 0,
			latest: index >= variants.length - 2,
			tags: [clipType, type, "advanced-engine"],
		});
	});
}
