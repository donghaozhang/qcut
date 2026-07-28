import { normalizeTextAnimations } from "@qcut/editor-core";
import type { TextAnimationsV1, TextElement } from "@/types/timeline";
import {
	getSelectedTextAnimationPreset,
	type TextAnimationPhase,
	type TextAnimationPresetDefinition,
} from "@/lib/text/text-animation-presets";

const LEGACY_SLIDE_LEFT_PRESET_ID = "legacy-slide-left";

const LEGACY_SLIDE_LEFT_PRESET: TextAnimationPresetDefinition = {
	id: LEGACY_SLIDE_LEFT_PRESET_ID,
	phase: "entrance",
	nameKey: "textProperties.animation.slideLeft",
	previewKind: "fade",
	defaultDuration: 0.6,
	defaultDelay: 0,
	defaultIntensity: 1,
	searchTerms: ["legacy", "slide", "left", "左滑"],
};

function legacySourcePresetId({
	animationType,
}: {
	animationType: string | undefined;
}): string | undefined {
	if (animationType === "fade" || animationType === "scale") {
		return "fade-text";
	}
	if (animationType === "slide-up") {
		return "slide-up";
	}
	if (animationType === "slide-left") {
		return LEGACY_SLIDE_LEFT_PRESET_ID;
	}
	return undefined;
}

export interface ResolvedTextAnimationsForProperties {
	animations?: TextAnimationsV1;
	unsupportedSchemaVersion?: unknown;
}

export function resolveTextAnimationsForProperties({
	element,
	fps,
}: {
	element: TextElement;
	fps: number;
}): ResolvedTextAnimationsForProperties {
	const normalization = normalizeTextAnimations({ element, fps });
	if (normalization.source === "unsupported") {
		const value = element.textAnimations as unknown as Record<string, unknown>;
		return { unsupportedSchemaVersion: value.schemaVersion };
	}
	if (!normalization.animation) return {};
	if (normalization.source !== "legacy" || !normalization.animation.entrance) {
		return { animations: normalization.animation };
	}

	const sourcePresetId = legacySourcePresetId({
		animationType: element.animationType as string | undefined,
	});
	if (!sourcePresetId) {
		return { animations: normalization.animation };
	}
	return {
		animations: {
			...normalization.animation,
			entrance: {
				...normalization.animation.entrance,
				sourcePreset: { id: sourcePresetId, version: 1 },
			},
		},
	};
}

export function getSelectedTextAnimationPresetForProperties({
	animations,
	phase,
}: {
	animations: TextAnimationsV1 | undefined;
	phase: TextAnimationPhase;
}): TextAnimationPresetDefinition {
	if (
		phase === "entrance" &&
		animations?.entrance?.sourcePreset?.id === LEGACY_SLIDE_LEFT_PRESET_ID
	) {
		return LEGACY_SLIDE_LEFT_PRESET;
	}
	return getSelectedTextAnimationPreset({ animations, phase });
}
