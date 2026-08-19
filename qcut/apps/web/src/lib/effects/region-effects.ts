import type { EffectInstance } from "@qcut/editor-core";
import type { EffectPreset } from "@/types/effects";
import { inferEffectType } from "@/lib/utils/effects";
import { generateUUID } from "@/lib/utils";

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
