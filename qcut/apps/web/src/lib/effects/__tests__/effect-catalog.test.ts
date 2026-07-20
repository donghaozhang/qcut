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
		assetVersion: 1,
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

	it("publishes the 16 classic CSS-filter presets with verified contracts", () => {
		expect(LEGACY_EFFECT_CATALOG).toHaveLength(16);
		expect(
			new Set(LEGACY_EFFECT_CATALOG.map((entry) => entry.preset.id)).size
		).toBe(16);
		// Formerly publication:"legacy" and hidden — now surfaced in the panel.
		expect(
			LEGACY_EFFECT_CATALOG.every((entry) => entry.publication === "published")
		).toBe(true);
		expect(
			LEGACY_EFFECT_CATALOG.every((entry) => entry.render.parity === "verified")
		).toBe(true);
		expect(
			auditEffectRenderContracts({ entries: LEGACY_EFFECT_CATALOG })
		).toEqual([]);
		// The published "invert" preset (tagged negative) is now searchable.
		expect(
			selectEffectCatalogEntries({
				entries: EFFECT_CATALOG,
				section: "visual",
				query: "negative",
			}).map((entry) => entry.preset.id)
		).toContain("invert");
	});

	it("keeps every implemented category ready and deepens the filter tabs", () => {
		const coverage = auditEffectCatalogCoverage({ entries: EFFECT_CATALOG });
		const coverageByCategory = new Map(
			coverage.map((item) => [item.category, item])
		);

		// Every category (including the new 自然 tab) ships ready with content.
		for (const category of VISUAL_EFFECT_CATEGORY_IDS) {
			const entry = coverageByCategory.get(category);
			expect(entry?.status).toBe("ready");
			expect(entry?.count ?? 0).toBeGreaterThanOrEqual(3);
		}

		// Classic filters deepen the four filter-driven tabs past the old cap of 3.
		for (const category of [
			"basic",
			"atmosphere",
			"trendy",
			"light",
		] as const) {
			expect(coverageByCategory.get(category)?.count ?? 0).toBeGreaterThan(3);
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
		// Every published effect has a verified render contract EXCEPT the
		// procedural particle effects: their canvas preview is complete but
		// frame-based export burn-in is a tracked follow-up (parity: pending).
		expect(auditEffectRenderContracts({ entries: EFFECT_CATALOG })).toEqual([
			"atmosphere-snow",
			"atmosphere-sakura",
			"atmosphere-embers",
			"atmosphere-stars",
			"atmosphere-confetti",
			"atmosphere-fog",
			"atmosphere-snow-sparkle",
			"atmosphere-sad-snow",
			"atmosphere-gold-stars",
			"atmosphere-gold-coins",
			"atmosphere-butterfly",
			"atmosphere-dissolve",
			"nature-falling-leaves",
			"nature-fireflies",
			"nature-snowfall",
			"basic-grid",
			"basic-film-end",
			"atmosphere-rainbow-rays",
			"basic-fisheye",
			"dynamic-ripple",
			"dynamic-shockwave",
		]);
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
