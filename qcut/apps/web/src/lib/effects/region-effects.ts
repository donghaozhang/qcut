import type {
	CompositionPlan,
	EffectInstance,
	EffectParameters,
} from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import { mergeEffectParameters } from "@/lib/effects/effects-utils";
import { inferEffectType } from "@/lib/utils/effects";
import { generateUUID } from "@/lib/utils";

/**
 * Resolve which visual layers the plan's region effects cover at `currentTime`
 * and merge the covering parameter sets per element.
 *
 * A region effect covers every visual layer whose track sits below its own
 * (layer.trackOrder > region.trackOrder). Phase 1 supports parameter-driven
 * looks (the CSS-filter presets of EFFECT_CATALOG); render-program overlays
 * and jianying-local runtime effects stay per-clip until the composed-group
 * pipeline exists (T5 阶段 2 in docs/task/timeline-rules-vs-jianying/TASKS.md).
 *
 * Shared by the preview panel and the export engine so a frame exports the
 * way it previews.
 */
export function buildRegionParametersByElementId({
	plan,
	currentTime,
}: {
	plan: Pick<CompositionPlan, "regionEffects" | "visualLayers">;
	currentTime: number;
}): Map<string, EffectParameters> {
	const parametersByElementId = new Map<string, EffectParameters>();
	if (plan.regionEffects.length === 0) return parametersByElementId;

	const activeRegions = plan.regionEffects.filter(
		(region) =>
			region.element.effect.enabled &&
			currentTime >= region.startTime &&
			currentTime < region.endTime
	);
	if (activeRegions.length === 0) return parametersByElementId;

	for (const layer of plan.visualLayers) {
		const covering = activeRegions.filter(
			(region) => layer.trackOrder > region.trackOrder
		);
		if (covering.length === 0) continue;
		parametersByElementId.set(
			layer.element.id,
			mergeEffectParameters(
				...covering.map((region) => region.element.effect.parameters)
			)
		);
	}
	return parametersByElementId;
}

/**
 * Instance carried by a region effect segment. Mirrors the construction in
 * effects-store.applyEffect so a preset behaves identically whether it is
 * applied to one clip or dropped as a region segment.
 */
export function createRegionEffectInstance({
	preset,
}: {
	preset: EffectPreset;
}): EffectInstance {
	return {
		id: generateUUID(),
		presetId: preset.id,
		name: preset.name,
		effectType: preset.effectType ?? inferEffectType(preset.parameters),
		parameters: { ...preset.parameters },
		renderProgram: preset.renderProgram,
		audioCompanion: preset.audioCompanion,
		duration: 0,
		enabled: true,
		engine: preset.engine,
		packageHash: preset.packageHash,
		adjustParameters: preset.adjustParameters,
		adjustValues: preset.adjustParameters?.map((parameter) => ({
			key: parameter.key,
			value: parameter.defaultValue,
		})),
	};
}
