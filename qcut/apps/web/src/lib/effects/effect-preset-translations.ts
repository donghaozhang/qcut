import type { TranslationKey } from "@/lib/i18n";
import type { EffectPresetId } from "./effect-presets";

interface EffectPresetTranslationKeys {
	name: TranslationKey;
	description: TranslationKey;
}

const EFFECT_PRESET_TRANSLATIONS = {
	"brightness-increase": {
		name: "effects.preset.brightness-increase.name",
		description: "effects.preset.brightness-increase.description",
	},
	"brightness-decrease": {
		name: "effects.preset.brightness-decrease.name",
		description: "effects.preset.brightness-decrease.description",
	},
	"contrast-high": {
		name: "effects.preset.contrast-high.name",
		description: "effects.preset.contrast-high.description",
	},
	"contrast-soft": {
		name: "effects.preset.contrast-soft.name",
		description: "effects.preset.contrast-soft.description",
	},
	"saturation-boost": {
		name: "effects.preset.saturation-boost.name",
		description: "effects.preset.saturation-boost.description",
	},
	desaturate: {
		name: "effects.preset.desaturate.name",
		description: "effects.preset.desaturate.description",
	},
	"warm-filter": {
		name: "effects.preset.warm-filter.name",
		description: "effects.preset.warm-filter.description",
	},
	"cool-filter": {
		name: "effects.preset.cool-filter.name",
		description: "effects.preset.cool-filter.description",
	},
	"hue-shift": {
		name: "effects.preset.hue-shift.name",
		description: "effects.preset.hue-shift.description",
	},
	sepia: {
		name: "effects.preset.sepia.name",
		description: "effects.preset.sepia.description",
	},
	"faded-film": {
		name: "effects.preset.faded-film.name",
		description: "effects.preset.faded-film.description",
	},
	grayscale: {
		name: "effects.preset.grayscale.name",
		description: "effects.preset.grayscale.description",
	},
	"blur-soft": {
		name: "effects.preset.blur-soft.name",
		description: "effects.preset.blur-soft.description",
	},
	dreamy: {
		name: "effects.preset.dreamy.name",
		description: "effects.preset.dreamy.description",
	},
	dramatic: {
		name: "effects.preset.dramatic.name",
		description: "effects.preset.dramatic.description",
	},
	invert: {
		name: "effects.preset.invert.name",
		description: "effects.preset.invert.description",
	},
} satisfies Record<EffectPresetId, EffectPresetTranslationKeys>;

export function getEffectPresetTranslationKeys({
	presetId,
}: {
	presetId: string;
}): EffectPresetTranslationKeys | undefined {
	return EFFECT_PRESET_TRANSLATIONS[presetId as EffectPresetId];
}
