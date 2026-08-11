export const JIANYING_FILTER_RECENTS_STORAGE_KEY =
	"qcut-jianying-filter-recents-v1";

const MAX_RECENT_FILTERS = 20;

function normalizeRecentIds({ value }: { value: unknown }): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const normalized: string[] = [];
	for (const candidate of value) {
		if (typeof candidate !== "string") continue;
		const resourceId = candidate.trim();
		if (!resourceId || seen.has(resourceId)) continue;
		seen.add(resourceId);
		normalized.push(resourceId);
		if (normalized.length === MAX_RECENT_FILTERS) break;
	}
	return normalized;
}

export function loadJianyingFilterRecents(): string[] {
	if (typeof window === "undefined") return [];
	try {
		const stored: unknown = JSON.parse(
			window.localStorage.getItem(JIANYING_FILTER_RECENTS_STORAGE_KEY) ?? "[]"
		);
		return normalizeRecentIds({ value: stored });
	} catch {
		return [];
	}
}

export function rememberJianyingFilter({
	resourceId,
	current,
}: {
	resourceId: string;
	current: string[];
}): string[] {
	const next = normalizeRecentIds({ value: [resourceId, ...current] });
	try {
		window.localStorage.setItem(
			JIANYING_FILTER_RECENTS_STORAGE_KEY,
			JSON.stringify(next)
		);
	} catch {
		return next;
	}
	return next;
}
