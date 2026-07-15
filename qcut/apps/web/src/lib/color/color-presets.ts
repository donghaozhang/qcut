import type { MediaColorSettings } from "@/types/timeline";
import { generateUUID } from "@/types/timeline";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "./color-properties";
import {
	notifyUserLibraryChanged,
	USER_LIBRARY_NAMESPACES,
} from "@/lib/user-library/user-library-events";

export const COLOR_PRESET_STORAGE_KEY = "qcut-color-presets";
export const COLOR_PRESETS_CHANGED_EVENT = "qcut:color-presets-changed";

export interface SavedColorPreset {
	id: string;
	name: string;
	createdAt: string;
	color: MediaColorSettings;
}

export function parseColorPreset({
	value,
}: {
	value: unknown;
}): SavedColorPreset | null {
	if (
		typeof value !== "object" ||
		value === null ||
		typeof (value as Partial<SavedColorPreset>).id !== "string" ||
		typeof (value as Partial<SavedColorPreset>).name !== "string" ||
		typeof (value as Partial<SavedColorPreset>).color !== "object"
	) {
		return null;
	}
	return value as SavedColorPreset;
}

export function loadColorPresets(): SavedColorPreset[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const stored: unknown = JSON.parse(
			localStorage.getItem(COLOR_PRESET_STORAGE_KEY) ?? "[]"
		);
		if (!Array.isArray(stored)) return [];
		return stored
			.map((value) => parseColorPreset({ value }))
			.filter((preset): preset is SavedColorPreset => preset !== null);
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
	notifyUserLibraryChanged({
		namespace: USER_LIBRARY_NAMESPACES.colorPresets,
	});
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
