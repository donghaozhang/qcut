import { useMemo } from "react";
import {
	combineEffectRenderPrograms,
	type EffectAudioCompanion,
	type EffectInstance,
	type EffectParameters,
	type EffectRenderProgram,
} from "@qcut/editor-core";
import { useEffectsStore } from "@/stores/ai/effects-store";
import {
	mergeEffectParameters,
	parametersToCSSFilters,
} from "@/lib/effects/effects-utils";

export interface ElementEffectsRendering {
	filterStyle: string;
	hasEffects: boolean;
	renderProgram?: EffectRenderProgram;
	/** Merged effect parameters (drives overlay-rendered filters like vignette). */
	parameters?: EffectParameters;
	audioCompanions: readonly ElementEffectAudioCompanion[];
}

export interface ElementEffectAudioCompanion {
	effectId: string;
	effectName: string;
	companion: EffectAudioCompanion;
}

export const EMPTY_ELEMENT_EFFECTS_RENDERING: ElementEffectsRendering = {
	filterStyle: "",
	hasEffects: false,
	audioCompanions: [],
};

export function buildElementEffectsRendering({
	effects,
}: {
	effects: readonly EffectInstance[];
}): ElementEffectsRendering {
	const enabledEffects = effects.filter((effect) => effect.enabled);
	if (enabledEffects.length === 0) return EMPTY_ELEMENT_EFFECTS_RENDERING;

	const mergedParameters = mergeEffectParameters(
		...enabledEffects.map((effect) => effect.parameters)
	);
	const renderProgram = combineEffectRenderPrograms({
		programs: enabledEffects.flatMap((effect) =>
			effect.renderProgram ? [effect.renderProgram] : []
		),
	});
	const audioCompanions = enabledEffects.flatMap((effect) =>
		effect.audioCompanion
			? [
					{
						effectId: effect.id,
						effectName: effect.name,
						companion: effect.audioCompanion,
					},
				]
			: []
	);

	return {
		filterStyle: parametersToCSSFilters(mergedParameters),
		hasEffects: true,
		renderProgram,
		parameters: mergedParameters,
		audioCompanions,
	};
}

/**
 * Computes preview render data for every timeline element with enabled
 * effects. Region-effect parameters (untargeted effect segments covering the
 * layers below them, resolved per frame by the caller) merge into each
 * covered element's look on top of its own effects, so a clip under a region
 * segment previews exactly the way it exports.
 */
export function useEffectsRendering(
	enabled = false,
	regionParametersByElementId?: ReadonlyMap<string, EffectParameters>
): ReadonlyMap<string, ElementEffectsRendering> {
	const activeEffects = useEffectsStore((state) => state.activeEffects);

	return useMemo(() => {
		if (!enabled) return new Map<string, ElementEffectsRendering>();
		const result = new Map<string, ElementEffectsRendering>();
		for (const [elementId, effects] of activeEffects) {
			const rendering = buildElementEffectsRendering({ effects });
			if (rendering.hasEffects) result.set(elementId, rendering);
		}
		if (regionParametersByElementId) {
			for (const [elementId, regionParameters] of regionParametersByElementId) {
				const own = result.get(elementId);
				const parameters = own?.parameters
					? mergeEffectParameters(own.parameters, regionParameters)
					: regionParameters;
				result.set(elementId, {
					...(own ?? EMPTY_ELEMENT_EFFECTS_RENDERING),
					filterStyle: parametersToCSSFilters(parameters),
					hasEffects: true,
					parameters,
				});
			}
		}
		return result;
	}, [activeEffects, enabled, regionParametersByElementId]);
}
