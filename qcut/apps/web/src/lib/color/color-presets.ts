import type { MediaColorSettings } from "@/types/timeline";
import { generateUUID } from "@/types/timeline";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "./color-properties";

export const COLOR_PRESET_STORAGE_KEY = "qcut-color-presets";
export const COLOR_PRESETS_CHANGED_EVENT = "qcut:color-presets-changed";

export interface SavedColorPreset {
	id: string;
	name: string;
	createdAt: string;
	color: MediaColorSettings;
}

export function loadColorPresets(): SavedColorPreset[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const stored: unknown = JSON.parse(
			localStorage.getItem(COLOR_PRESET_STORAGE_KEY) ?? "[]"
		);
		if (!Array.isArray(stored)) return [];
		return stored.filter(
			(candidate): candidate is SavedColorPreset =>
				typeof candidate === "object" &&
				candidate !== null &&
				typeof (candidate as Partial<SavedColorPreset>).id === "string" &&
				typeof (candidate as Partial<SavedColorPreset>).name === "string" &&
				typeof (candidate as Partial<SavedColorPreset>).color === "object"
		);
	} catch {
		return [];
	}
}

export function persistColorPresets({
	presets,
}: {
	presets: SavedColorPreset[];
}) {
	localStorage.setItem(COLOR_PRESET_STORAGE_KEY, JSON.stringify(presets));
	window.dispatchEvent(new Event(COLOR_PRESETS_CHANGED_EVENT));
}

export function createColorPreset({
	settings,
	name,
}: {
	settings: MediaColorSettings;
	name?: string;
}): SavedColorPreset {
	const createdAt = new Date().toISOString();
	return {
		id: `color-preset-${generateUUID()}`,
		name:
			name?.trim() || `Color preset ${new Date(createdAt).toLocaleString()}`,
		createdAt,
		color: {
			...structuredClone(settings),
			mask: { ...DEFAULT_MEDIA_COLOR_SETTINGS.mask },
			keyframes: {},
			curveShapeKeyframes: {},
		},
	};
}
