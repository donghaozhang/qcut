import type {
	EffectCatalogNavigation,
	EffectLibrarySectionId,
	VisualEffectCatalogEntry,
} from "./effect-catalog-types";

interface SelectEffectCatalogEntriesOptions {
	entries: readonly VisualEffectCatalogEntry[];
	section: EffectLibrarySectionId;
	navigation?: EffectCatalogNavigation;
	favoriteIds?: ReadonlySet<string>;
	query?: string;
	collectionLimit?: number;
}

function compareByPopularity({
	left,
	right,
}: {
	left: VisualEffectCatalogEntry;
	right: VisualEffectCatalogEntry;
}) {
	return right.popularityScore - left.popularityScore;
}

function compareByReleaseDate({
	left,
	right,
}: {
	left: VisualEffectCatalogEntry;
	right: VisualEffectCatalogEntry;
}) {
	return Date.parse(right.releasedAt) - Date.parse(left.releasedAt);
}

function matchesQuery({
	entry,
	query,
}: {
	entry: VisualEffectCatalogEntry;
	query: string;
}) {
	if (!query) return true;
	const searchableText = [
		entry.preset.name,
		entry.preset.description,
		entry.localizedName,
		entry.localizedDescription,
		entry.category,
		...entry.tags,
	]
		.join(" ")
		.toLowerCase();
	return searchableText.includes(query);
}

export function selectEffectCatalogEntries({
	entries,
	section,
	navigation,
	favoriteIds = new Set<string>(),
	query = "",
	collectionLimit = 3,
}: SelectEffectCatalogEntriesOptions): VisualEffectCatalogEntry[] {
	if (section === "person") return [];

	const normalizedQuery = query.trim().toLowerCase();
	const availableEntries = entries.filter(
		(entry) =>
			entry.publication !== "planned" &&
			matchesQuery({ entry, query: normalizedQuery })
	);

	if (section === "favorites") {
		return availableEntries.filter((entry) => favoriteIds.has(entry.preset.id));
	}

	if (!navigation) return availableEntries;
	if (navigation.kind === "category") {
		return availableEntries.filter((entry) => entry.category === navigation.id);
	}

	const sorted = [...availableEntries].sort((left, right) =>
		navigation.id === "popular"
			? compareByPopularity({ left, right })
			: compareByReleaseDate({ left, right })
	);
	return sorted.slice(0, Math.max(0, collectionLimit));
}
