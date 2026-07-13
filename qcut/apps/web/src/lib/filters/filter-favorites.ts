import { FILTER_PRESETS } from "./filter-registry";
import { LEGACY_FILTER_FAVORITES_STORAGE_KEY } from "@/stores/asset-library-store";

export const FILTER_FAVORITES_STORAGE_KEY = LEGACY_FILTER_FAVORITES_STORAGE_KEY;

const validPresetIds = new Set(FILTER_PRESETS.map((preset) => preset.id));

export function loadFilterFavorites(): string[] {
	if (typeof localStorage === "undefined") return [];
	try {
		const stored: unknown = JSON.parse(
			localStorage.getItem(FILTER_FAVORITES_STORAGE_KEY) ?? "[]"
		);
		if (!Array.isArray(stored)) return [];
		return stored.filter(
			(candidate): candidate is string =>
				typeof candidate === "string" && validPresetIds.has(candidate)
		);
	} catch {
		return [];
	}
}

export function persistFilterFavorites({ presetIds }: { presetIds: string[] }) {
	localStorage.setItem(
		FILTER_FAVORITES_STORAGE_KEY,
		JSON.stringify(
			[...new Set(presetIds)].filter((id) => validPresetIds.has(id))
		)
	);
}
