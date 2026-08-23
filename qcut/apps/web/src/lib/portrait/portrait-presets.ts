import {
	generateUUID,
	MEDIA_PORTRAIT_ADJUSTMENT_KEYS,
	normalizeMediaPortraitAdjustments,
} from "@qcut/editor-core";
import type {
	MediaPortraitAdjustmentKey,
	MediaPortraitAdjustments,
	MediaPortraitFaceTarget,
	MediaPortraitMakeupCategory,
	MediaPortraitMakeupSelection,
} from "@/types/timeline";

export const PORTRAIT_PRESET_STORAGE_KEY = "qcut-portrait-presets-v1";
export const PORTRAIT_PRESETS_CHANGED_EVENT = "qcut:portrait-presets-changed";

export type PortraitPresetScope = "face" | "body";

export interface SavedPortraitPreset {
	id: string;
	name: string;
	scope: PortraitPresetScope;
	createdAt: string;
	values: Partial<Record<MediaPortraitAdjustmentKey, number>>;
	faceTarget?: MediaPortraitFaceTarget;
	makeup?: Partial<
		Record<MediaPortraitMakeupCategory, MediaPortraitMakeupSelection>
	>;
}

export function portraitAdjustmentKeyScope({
	key,
}: {
	key: MediaPortraitAdjustmentKey;
}): PortraitPresetScope {
	return key.startsWith("body_adjust_") ? "body" : "face";
}

function valuesForScope({
	scope,
	values,
}: {
	scope: PortraitPresetScope;
	values: unknown;
}): SavedPortraitPreset["values"] {
	if (typeof values !== "object" || values === null) return {};
	const source = values as Record<string, unknown>;
	const result: SavedPortraitPreset["values"] = {};
	for (const key of MEDIA_PORTRAIT_ADJUSTMENT_KEYS) {
		if (portraitAdjustmentKeyScope({ key }) !== scope) continue;
		const value = source[key];
		if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
			result[key] = value;
		}
	}
	return result;
}

export function parsePortraitPreset({
	value,
}: {
	value: unknown;
}): SavedPortraitPreset | null {
	if (typeof value !== "object" || value === null) return null;
	const candidate = value as Partial<SavedPortraitPreset>;
	if (
		typeof candidate.id !== "string" ||
		typeof candidate.name !== "string" ||
		typeof candidate.createdAt !== "string" ||
		(candidate.scope !== "face" && candidate.scope !== "body")
	) {
		return null;
	}
	const normalized = normalizeMediaPortraitAdjustments({
		adjustments: {
			enabled: true,
			values: {},
			faceTarget: candidate.faceTarget,
			makeup: candidate.makeup,
		},
	});
	return {
		id: candidate.id,
		name: candidate.name,
		createdAt: candidate.createdAt,
		scope: candidate.scope,
		values: valuesForScope({
			scope: candidate.scope,
			values: candidate.values,
		}),
		...(candidate.scope === "face" && normalized.faceTarget
			? { faceTarget: normalized.faceTarget }
			: {}),
		...(candidate.scope === "face" && normalized.makeup
			? { makeup: normalized.makeup }
			: {}),
	};
}

export function loadPortraitPresets(): SavedPortraitPreset[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const stored: unknown = JSON.parse(
			localStorage.getItem(PORTRAIT_PRESET_STORAGE_KEY) ?? "[]"
		);
		if (!Array.isArray(stored)) return [];
		return stored
			.map((value) => parsePortraitPreset({ value }))
			.filter((preset): preset is SavedPortraitPreset => preset !== null);
	} catch {
		return [];
	}
}

export function persistPortraitPresets({
	presets,
}: {
	presets: SavedPortraitPreset[];
}) {
	localStorage.setItem(PORTRAIT_PRESET_STORAGE_KEY, JSON.stringify(presets));
	window.dispatchEvent(new Event(PORTRAIT_PRESETS_CHANGED_EVENT));
}

export function createPortraitPreset({
	adjustments,
	name,
	scope,
}: {
	adjustments: MediaPortraitAdjustments;
	name?: string;
	scope: PortraitPresetScope;
}): SavedPortraitPreset {
	const createdAt = new Date().toISOString();
	return {
		id: `portrait-preset-${generateUUID()}`,
		name:
			name?.trim() ||
			`${scope === "face" ? "美颜" : "美体"}预设 ${new Date(createdAt).toLocaleString()}`,
		scope,
		createdAt,
		values: valuesForScope({ scope, values: adjustments.values }),
		...(scope === "face" && adjustments.faceTarget
			? { faceTarget: adjustments.faceTarget }
			: {}),
		...(scope === "face" && adjustments.makeup
			? { makeup: adjustments.makeup }
			: {}),
	};
}

export function hasPortraitPresetContent({
	preset,
}: {
	preset: SavedPortraitPreset;
}) {
	return (
		Object.keys(preset.values).length > 0 ||
		Object.keys(preset.makeup ?? {}).length > 0
	);
}

export function applyPortraitPreset({
	adjustments,
	preset,
}: {
	adjustments: MediaPortraitAdjustments;
	preset: SavedPortraitPreset;
}): MediaPortraitAdjustments {
	const values: MediaPortraitAdjustments["values"] = {};
	for (const key of MEDIA_PORTRAIT_ADJUSTMENT_KEYS) {
		if (portraitAdjustmentKeyScope({ key }) === preset.scope) continue;
		const value = adjustments.values[key];
		if (value !== undefined) values[key] = value;
	}
	const mergedValues = { ...values, ...preset.values };
	if (preset.scope === "face") {
		return {
			enabled: true,
			values: mergedValues,
			...(preset.faceTarget ? { faceTarget: preset.faceTarget } : {}),
			...(preset.makeup ? { makeup: preset.makeup } : {}),
		};
	}
	return { ...adjustments, enabled: true, values: mergedValues };
}
