export type FreesoundSearchType = "effects" | "songs";

export function buildFreesoundSearchFilters({
	type,
	minRating,
	commercialOnly,
}: {
	type: FreesoundSearchType;
	minRating: number;
	commercialOnly: boolean;
}): string[] {
	const filters = [`avg_rating:[${Math.max(0, minRating)} TO *]`];
	if (commercialOnly) {
		filters.push('license:("Attribution" OR "Creative Commons 0")');
	}

	if (type === "songs") {
		return [
			"duration:[15.0 TO 600.0]",
			...filters,
			"tag:music OR tag:instrumental OR tag:soundtrack OR tag:loop OR tag:background-music",
		];
	}

	return [
		"duration:[* TO 30.0]",
		...filters,
		"tag:sound-effect OR tag:sfx OR tag:foley OR tag:ambient OR tag:nature OR tag:mechanical OR tag:electronic OR tag:impact OR tag:whoosh OR tag:explosion",
	];
}
