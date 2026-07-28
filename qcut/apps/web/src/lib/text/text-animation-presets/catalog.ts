import type { TranslationKey } from "@/lib/i18n";

import {
	EXIT_TEXT_ANIMATION_PRESETS,
	LOOP_TEXT_ANIMATION_PRESETS,
} from "./catalog-exit-loop";
import { ENTRANCE_TEXT_ANIMATION_PRESETS } from "./catalog-entrance";
import type {
	TextAnimationPhase,
	TextAnimationPresetDefinition,
} from "./types";

export const TEXT_ANIMATION_PRESETS = {
	entrance: ENTRANCE_TEXT_ANIMATION_PRESETS,
	exit: EXIT_TEXT_ANIMATION_PRESETS,
	loop: LOOP_TEXT_ANIMATION_PRESETS,
} as const satisfies Record<
	TextAnimationPhase,
	readonly TextAnimationPresetDefinition[]
>;

export function getTextAnimationPreset({
	phase,
	presetId,
}: {
	phase: TextAnimationPhase;
	presetId: string | undefined;
}): TextAnimationPresetDefinition {
	return (
		TEXT_ANIMATION_PRESETS[phase].find((preset) => preset.id === presetId) ??
		TEXT_ANIMATION_PRESETS[phase][0]
	);
}

export function filterTextAnimationPresets({
	phase,
	query,
	translate,
}: {
	phase: TextAnimationPhase;
	query: string;
	translate: (key: TranslationKey) => string;
}): readonly TextAnimationPresetDefinition[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return TEXT_ANIMATION_PRESETS[phase];

	return TEXT_ANIMATION_PRESETS[phase].filter((preset) => {
		const searchable = [
			preset.id,
			translate(preset.nameKey),
			...preset.searchTerms,
		]
			.join(" ")
			.toLocaleLowerCase();
		return searchable.includes(normalizedQuery);
	});
}
