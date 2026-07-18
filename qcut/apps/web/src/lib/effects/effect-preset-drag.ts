import type { EffectPreset } from "@/types/effects";
import { EFFECT_CATALOG } from "./effect-catalog";

export const EFFECT_PRESET_DRAG_MIME = "application/x-qcut-effect-preset";

interface EffectPresetDragPayload {
	version: 1;
	presetId: string;
}

export function serializeEffectPresetDrag({
	presetId,
}: {
	presetId: string;
}): string {
	return JSON.stringify({
		version: 1,
		presetId,
	} satisfies EffectPresetDragPayload);
}

export function parseEffectPresetDrag({
	value,
}: {
	value: string;
}): EffectPreset | undefined {
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== "object") return;
		if (!("version" in parsed) || parsed.version !== 1) return;
		if (!("presetId" in parsed) || typeof parsed.presetId !== "string") return;
		return EFFECT_CATALOG.find(
			(entry) =>
				entry.publication === "published" && entry.preset.id === parsed.presetId
		)?.preset;
	} catch {
		return;
	}
}
