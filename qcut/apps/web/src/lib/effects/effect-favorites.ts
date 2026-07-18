const EFFECT_FAVORITES_STORAGE_KEY = "effectsFavorites";

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

export function readEffectFavoriteIds(): Set<string> {
	if (typeof localStorage === "undefined") return new Set();
	try {
		const stored = JSON.parse(
			localStorage.getItem(EFFECT_FAVORITES_STORAGE_KEY) ?? "[]"
		);
		return isStringArray(stored) ? new Set(stored) : new Set();
	} catch {
		return new Set();
	}
}

export function writeEffectFavoriteIds({
	favoriteIds,
}: {
	favoriteIds: ReadonlySet<string>;
}): void {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(
			EFFECT_FAVORITES_STORAGE_KEY,
			JSON.stringify([...favoriteIds])
		);
	} catch {
		// The in-memory favorite remains usable when browser storage is unavailable.
	}
}

export function toggleEffectFavoriteId({
	favoriteIds,
	presetId,
}: {
	favoriteIds: ReadonlySet<string>;
	presetId: string;
}): Set<string> {
	const next = new Set(favoriteIds);
	if (next.has(presetId)) {
		next.delete(presetId);
		return next;
	}
	next.add(presetId);
	return next;
}
