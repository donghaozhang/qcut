import type {
	EffectCatalogEntry,
	EffectCatalogNavigation,
	EffectLibrarySectionId,
} from "./effect-catalog-types";

interface SelectEffectCatalogEntriesOptions {
	entries: readonly EffectCatalogEntry[];
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
	left: EffectCatalogEntry;
	right: EffectCatalogEntry;
}) {
	return right.popularityScore - left.popularityScore;
}

function compareByReleaseDate({
	left,
	right,
}: {
	left: EffectCatalogEntry;
	right: EffectCatalogEntry;
}) {
	return Date.parse(right.releasedAt) - Date.parse(left.releasedAt);
}

function matchesQuery({
	entry,
	query,
}: {
	entry: EffectCatalogEntry;
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
}: SelectEffectCatalogEntriesOptions): EffectCatalogEntry[] {
	const normalizedQuery = query.trim().toLowerCase();
	const availableEntries = entries.filter(
		(entry) =>
			entry.publication === "published" &&
			matchesQuery({ entry, query: normalizedQuery })
	);

	if (section === "favorites") {
		return availableEntries.filter((entry) => favoriteIds.has(entry.preset.id));
	}

	const sectionEntries = availableEntries.filter(
		(entry) => entry.family === section
	);
	if (!navigation) return sectionEntries;
	if (navigation.kind === "category") {
		return sectionEntries.filter((entry) => entry.category === navigation.id);
	}

	const sorted = [...sectionEntries].sort((left, right) =>
		navigation.id === "popular"
			? compareByPopularity({ left, right })
			: compareByReleaseDate({ left, right })
	);
	return sorted.slice(0, Math.max(0, collectionLimit));
}
