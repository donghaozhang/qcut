import { describe, expect, it } from "vitest";
import type { EffectPreset } from "@/types/effects";
import {
	EFFECT_COLLECTION_IDS,
	EFFECT_LIBRARY_SECTION_IDS,
	VISUAL_EFFECT_CATEGORY_IDS,
	type VisualEffectCatalogEntry,
	type VisualEffectCategoryId,
} from "../effect-catalog-types";
import {
	EFFECT_LIBRARY_SECTIONS,
	VISUAL_EFFECT_NAVIGATION,
} from "../effect-catalog-navigation";
import { EFFECT_CATALOG, LEGACY_EFFECT_CATALOG } from "../effect-catalog";
import { selectEffectCatalogEntries } from "../effect-catalog-selectors";
import {
	auditEffectCatalogCoverage,
	auditEffectRenderContracts,
} from "../effect-catalog-audit";

function createPublishedEntry({
	id,
	category,
	releasedAt,
	popularityScore,
}: {
	id: string;
	category: VisualEffectCategoryId;
	releasedAt: string;
	popularityScore: number;
}): VisualEffectCatalogEntry {
	const preset: EffectPreset = {
		id,
		name: id,
		description: `${id} description`,
		category: "basic",
		icon: id,
		parameters: { brightness: 10 },
	};
	return {
		preset,
		family: "visual",
		category,
		tags: [category],
		releasedAt,
		popularityScore,
		publication: "published",
		render: {
			kind: "filter",
			previewBackend: "css-filter",
			exportBackend: "ffmpeg-filter",
			parity: "verified",
		},
	};
}

const FIXTURE_ENTRIES = [
	createPublishedEntry({
		id: "basic-a",
		category: "basic",
		releasedAt: "2026-01-01T00:00:00.000Z",
		popularityScore: 20,
	}),
	createPublishedEntry({
		id: "dynamic-a",
		category: "dynamic",
		releasedAt: "2026-03-01T00:00:00.000Z",
		popularityScore: 90,
	}),
	createPublishedEntry({
		id: "light-a",
		category: "light",
		releasedAt: "2026-02-01T00:00:00.000Z",
		popularityScore: 60,
	}),
] as const;

describe("effect catalog", () => {
	it("defines the requested first-level sections in reference order", () => {
		expect(EFFECT_LIBRARY_SECTIONS.map((section) => section.id)).toEqual(
			EFFECT_LIBRARY_SECTION_IDS
		);
	});

	it("defines every requested visual category and derived collection", () => {
		const categories = VISUAL_EFFECT_NAVIGATION.flatMap((item) =>
			item.navigation.kind === "category" ? [item.navigation.id] : []
		);
		const collections = VISUAL_EFFECT_NAVIGATION.flatMap((item) =>
			item.navigation.kind === "collection" ? [item.navigation.id] : []
		);

		expect(categories).toEqual(VISUAL_EFFECT_CATEGORY_IDS);
		expect(collections).toEqual(EFFECT_COLLECTION_IDS);
	});

	it("keeps legacy presets resolvable without counting them as launch content", () => {
		expect(LEGACY_EFFECT_CATALOG).toHaveLength(16);
		expect(
			new Set(LEGACY_EFFECT_CATALOG.map((entry) => entry.preset.id)).size
		).toBe(16);
		expect(
			LEGACY_EFFECT_CATALOG.every((entry) => entry.publication === "legacy")
		).toBe(true);
		expect(
			auditEffectRenderContracts({ entries: LEGACY_EFFECT_CATALOG })
		).toEqual([]);

		const coverage = auditEffectCatalogCoverage({
			entries: LEGACY_EFFECT_CATALOG,
		});
		expect(coverage).toHaveLength(VISUAL_EFFECT_CATEGORY_IDS.length);
		expect(coverage.every((item) => item.status === "underfilled")).toBe(true);
		expect(
			selectEffectCatalogEntries({
				entries: EFFECT_CATALOG,
				section: "visual",
				query: "negative",
			})
		).toEqual([]);
	});

	it("publishes three real effects in every implemented category", () => {
		const coverage = auditEffectCatalogCoverage({ entries: EFFECT_CATALOG });
		const coverageByCategory = new Map(
			coverage.map((item) => [item.category, item])
		);

		expect(coverageByCategory.get("dynamic")).toMatchObject({
			count: 3,
			status: "ready",
		});
		expect(coverageByCategory.get("camera")).toMatchObject({
			count: 3,
			status: "ready",
		});
		for (const category of [
			"basic",
			"atmosphere",
			"trendy",
			"border",
			"multiscreen",
			"sound",
			"light",
			"heart",
			"audio",
			"creative-ai",
		] as const) {
			expect(coverageByCategory.get(category)).toMatchObject({
				count: 3,
				status: "ready",
			});
		}
		expect(
			EFFECT_CATALOG.filter(
				(entry) =>
					entry.publication === "published" && entry.category === "sound"
			).every((entry) => entry.preset.audioCompanion !== undefined)
		).toBe(true);
		expect(
			EFFECT_CATALOG.filter(
				(entry) =>
					entry.publication === "published" && entry.render.kind === "motion"
			).every(
				(entry) => entry.preset.renderProgram?.stages[0]?.kind === "motion"
			)
		).toBe(true);
		expect(auditEffectRenderContracts({ entries: EFFECT_CATALOG })).toEqual([]);
	});

	it("publishes three verified person effects from the shared catalog", () => {
		const entries = EFFECT_CATALOG.filter(
			(entry) => entry.family === "person" && entry.publication === "published"
		);
		expect(entries).toHaveLength(3);
		expect(entries.map((entry) => entry.preset.id)).toEqual([
			"person-neon-outline",
			"person-spotlight",
			"person-background-blur",
		]);
		expect(
			entries.every(
				(entry) =>
					entry.render.parity === "verified" &&
					entry.preset.renderProgram?.stages[0]?.kind === "person-tracking"
			)
		).toBe(true);
	});

	it("builds Popular and Latest from shared entries without duplication", () => {
		const popular = selectEffectCatalogEntries({
			entries: FIXTURE_ENTRIES,
			section: "visual",
			navigation: { kind: "collection", id: "popular" },
			collectionLimit: 2,
		});
		const latest = selectEffectCatalogEntries({
			entries: FIXTURE_ENTRIES,
			section: "visual",
			navigation: { kind: "collection", id: "latest" },
			collectionLimit: 2,
		});

		expect(popular.map((entry) => entry.preset.id)).toEqual([
			"dynamic-a",
			"light-a",
		]);
		expect(latest.map((entry) => entry.preset.id)).toEqual([
			"dynamic-a",
			"light-a",
		]);
		expect(popular[0]).toBe(FIXTURE_ENTRIES[1]);
		expect(latest[0]).toBe(FIXTURE_ENTRIES[1]);
	});

	it("derives Favorites from the same catalog and still applies search", () => {
		const favorites = selectEffectCatalogEntries({
			entries: FIXTURE_ENTRIES,
			section: "favorites",
			favoriteIds: new Set(["basic-a", "light-a"]),
			query: "light",
		});

		expect(favorites.map((entry) => entry.preset.id)).toEqual(["light-a"]);
		expect(favorites[0]).toBe(FIXTURE_ENTRIES[2]);
	});
});
