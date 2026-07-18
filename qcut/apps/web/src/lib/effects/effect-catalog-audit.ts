import {
	VISUAL_EFFECT_CATEGORY_IDS,
	type EffectCatalogEntry,
	type VisualEffectCatalogEntry,
	type VisualEffectCategoryId,
} from "./effect-catalog-types";

export interface EffectCategoryCoverage {
	category: VisualEffectCategoryId;
	count: number;
	status: "underfilled" | "ready" | "overfilled";
}

function resolveCoverageStatus({
	count,
	minimum,
	maximum,
}: {
	count: number;
	minimum: number;
	maximum: number;
}): EffectCategoryCoverage["status"] {
	if (count < minimum) return "underfilled";
	if (count > maximum) return "overfilled";
	return "ready";
}

export function auditEffectCatalogCoverage({
	entries,
	minimum = 2,
	maximum = 3,
}: {
	entries: readonly EffectCatalogEntry[];
	minimum?: number;
	maximum?: number;
}): EffectCategoryCoverage[] {
	return VISUAL_EFFECT_CATEGORY_IDS.map((category) => {
		const count = entries.filter(
			(entry) =>
				entry.family === "visual" &&
				entry.publication === "published" &&
				entry.category === category
		).length;
		const status = resolveCoverageStatus({ count, minimum, maximum });
		return { category, count, status };
	});
}

export function auditEffectRenderContracts({
	entries,
}: {
	entries: readonly EffectCatalogEntry[];
}): string[] {
	return entries.flatMap((entry) => {
		if (entry.publication !== "published") return [];
		if (entry.render.parity === "verified") return [];
		return [entry.preset.id];
	});
}
