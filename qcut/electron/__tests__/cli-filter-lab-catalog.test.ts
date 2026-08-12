// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { JianyingFilterCatalogExport } from "../jianying-filter-catalog-export";
import { handleFilterLabCatalog } from "../native-pipeline/cli/cli-handlers-filter-lab-catalog";

function fakeCatalog(): JianyingFilterCatalogExport {
	const cards = [
		{
			resourceId: "7100000000000000001",
			title: "晴空",
			categories: ["🍉夏日"],
			version: "aa00",
			implementation: "single-lut" as const,
			cacheStatus: "cached" as const,
			available: true,
			verification: "verified" as const,
			lutCount: 1,
		},
		{
			resourceId: "7100000000000000002",
			title: "美颜",
			categories: ["人像"],
			requirements: ["face_detect", "skin_seg"],
			sdkModel: "portrait-filter",
			implementation: "face-ai" as const,
			cacheStatus: "partial" as const,
			available: false,
			verification: "unverified" as const,
			lutCount: 0,
		},
		{
			resourceId: "7100000000000000003",
			title: "迷雾",
			categories: ["风格化"],
			implementation: "shader" as const,
			cacheStatus: "cached" as const,
			available: true,
			verification: "close" as const,
			lutCount: 1,
			multiPassKind: "fog-lut",
			multiPassCount: 4,
		},
	];
	return { count: cards.length, cards };
}

describe("filter-lab catalog CLI", () => {
	it("dumps the full catalog with stratification fields intact", async () => {
		const result = await handleFilterLabCatalog(
			{},
			{ exportCatalog: async () => fakeCatalog() }
		);
		expect(result.success).toBe(true);
		const data = result.data as {
			count: number;
			cards: Record<string, unknown>[];
		};
		expect(data.count).toBe(3);
		expect(data.cards[1]).toMatchObject({
			resourceId: "7100000000000000002",
			requirements: ["face_detect", "skin_seg"],
			sdkModel: "portrait-filter",
			implementation: "face-ai",
		});
		// The stop condition: catalog metadata only, nothing reconstructable.
		for (const card of data.cards) {
			expect(card).not.toHaveProperty("cube");
			expect(card).not.toHaveProperty("values");
			expect(card).not.toHaveProperty("filePath");
			expect(card).not.toHaveProperty("shader");
		}
	});

	it("samples deterministically for the same seed", async () => {
		const deps = { exportCatalog: async () => fakeCatalog() };
		const first = await handleFilterLabCatalog(
			{ sample: 2, seed: 7, stratify: "implementation" },
			deps
		);
		const second = await handleFilterLabCatalog(
			{ sample: 2, seed: 7, stratify: "implementation" },
			deps
		);
		expect(first.data).toEqual(second.data);
		const data = first.data as {
			sample: { size: number; strata: { key: string }[] };
			cards: { resourceId: string }[];
		};
		expect(data.sample.size).toBe(2);
		expect(data.cards).toHaveLength(2);
	});

	it("rejects unknown stratify fields with the supported list", async () => {
		const result = await handleFilterLabCatalog(
			{ sample: 2, stratify: "implementation,bogus" },
			{ exportCatalog: async () => fakeCatalog() }
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("bogus");
		expect(result.error).toContain("implementation");
	});

	it("rejects a non-positive sample size", async () => {
		const result = await handleFilterLabCatalog(
			{ sample: 0 },
			{ exportCatalog: async () => fakeCatalog() }
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--sample");
	});

	it("fails with guidance when the caches know no cards", async () => {
		const exportCatalog = vi.fn(async () => ({ count: 0, cards: [] }));
		const result = await handleFilterLabCatalog({}, { exportCatalog });
		expect(result.success).toBe(false);
		expect(result.error).toContain("Jianying");
	});
});
