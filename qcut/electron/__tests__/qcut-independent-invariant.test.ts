// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	hashIndependentGraphAssets,
	supportsIndependentGraph,
} from "../qcut-independent-filter/graph-data.js";
import { INDEPENDENT_INVARIANT_PROFILES } from "../qcut-independent-filter/graph-profiles-invariant.js";
import { selectIndependentCatalog } from "../qcut-independent-filter/lut-catalog.js";
import type { JianyingFilterCatalogCard } from "../jianying-filter-catalog-export.js";

function invariantCard({
	index = 0,
}: {
	index?: number;
} = {}): JianyingFilterCatalogCard {
	return {
		...INDEPENDENT_INVARIANT_PROFILES[index],
		available: true,
		cacheStatus: "cached",
		categories: [],
		implementation: "dual-lut",
		verification: "verified",
		lutCount: 2,
		requirements: ["blit", "skin_seg"],
	};
}

describe("mask-invariant graph admission", () => {
	it("admits only audited identities, without inheriting parity claims", () => {
		const cards = INDEPENDENT_INVARIANT_PROFILES.map((_, index) =>
			invariantCard({ index })
		);
		expect(cards).toHaveLength(4);
		expect(cards.every((card) => supportsIndependentGraph({ card }))).toBe(
			true
		);
		const catalog = selectIndependentCatalog({
			catalog: { count: cards.length, cards },
		});
		for (const card of cards) {
			expect(
				catalog.cards.find(
					(candidate) => candidate.resourceId === card.resourceId
				)?.verification
			).toBe("unverified");
		}
	});
	it("does not use equal LUT names as proof of equal mix weights or topology", () => {
		const card = invariantCard();
		for (const changed of [
			{
				...card,
				resourceId: "7617814057051016484",
				version: "0".repeat(32),
			},
			{
				...card,
				resourceId: "7239235794744003851",
				version: "00287143258a0513b431070bd20ac371",
			},
			{ ...card, version: "0".repeat(32) },
			{ ...card, requirements: ["skin_seg", "matting"] },
			{ ...card, sdkModel: "new-model" },
			{ ...card, available: false },
		])
			expect(supportsIndependentGraph({ card: changed })).toBe(false);
	});
	it.each([
		"vf",
		"tiled",
	] as const)("fingerprints both %s LUTs, including the unused skin table", async (maskInvariant) => {
		const root = await mkdtemp(join(tmpdir(), "qcut-invariant-"));
		try {
			const directory = join(
				root,
				"AmazingFeature",
				maskInvariant === "vf" ? "texture" : "image"
			);
			await mkdir(directory, { recursive: true });
			const extension = maskInvariant === "vf" ? "3dl.vf" : "png";
			await writeFile(
				join(directory, `filter_bg.${extension}`),
				"synthetic-same"
			);
			await writeFile(
				join(directory, `filter_skin.${extension}`),
				"synthetic-same"
			);
			const options = {
				root,
				profile: { ...INDEPENDENT_INVARIANT_PROFILES[0], maskInvariant },
			};
			const before = await hashIndependentGraphAssets(options);
			await writeFile(
				join(directory, `filter_skin.${extension}`),
				"synthetic-different"
			);
			expect(await hashIndependentGraphAssets(options)).not.toBe(before);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
