// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buildJianyingFilterLabCatalog,
	mergeKnownFiltersWithReferences,
} from "../jianying-filter-lab-catalog.js";
import type { JianyingFilterKnownCatalog } from "../jianying-filter-metadata.js";
import type { JianyingFilterPackageSummary } from "../jianying-filter-package-inspector.js";
import type { JianyingLutReference } from "../native-pipeline/filters/filter-lab-lut.js";

function reference({
	resourceId,
	version,
	role = "single",
	fileName = "filter.cube.vf",
}: {
	resourceId: string;
	version: string;
	role?: JianyingLutReference["role"];
	fileName?: string;
}): JianyingLutReference {
	return {
		lutId: `${resourceId}/${version}/${fileName}`,
		resourceId,
		version,
		fileName,
		filePath: `/private/${resourceId}/${version}/${fileName}`,
		role,
		size: 17,
	};
}

function packageSummary({
	implementation,
}: {
	implementation: JianyingFilterPackageSummary["implementation"];
}): JianyingFilterPackageSummary {
	return {
		cacheStatus: "cached",
		implementation,
		versions: ["current"],
		hasThumbnail: false,
		issues: [],
	};
}

describe("Jianying filter lab catalog", () => {
	it("groups versions and dual LUT roles into one row per filter", () => {
		const catalog: JianyingFilterKnownCatalog = {
			order: ["人像", "基础"],
			filters: [
				{
					resourceId: "single",
					title: "清透",
					categories: ["基础"],
					version: "current",
				},
				{
					resourceId: "dual",
					title: "亮肤",
					categories: ["人像"],
					version: "dual-current",
				},
				{
					resourceId: "missing",
					title: "云端滤镜",
					categories: ["人像"],
					version: "remote",
				},
			],
		};
		const references = [
			reference({ resourceId: "single", version: "old" }),
			reference({ resourceId: "single", version: "current" }),
			reference({
				resourceId: "dual",
				version: "dual-current",
				role: "background",
				fileName: "filter_bg.3dl.vf",
			}),
			reference({
				resourceId: "dual",
				version: "dual-current",
				role: "skin",
				fileName: "filter_skin.3dl.vf",
			}),
		];
		const packages = new Map<string, JianyingFilterPackageSummary>([
			["single", packageSummary({ implementation: "single-lut" })],
			["dual", packageSummary({ implementation: "dual-lut" })],
		]);

		const result = buildJianyingFilterLabCatalog({
			catalog,
			references,
			packages,
		});

		expect(result).toMatchObject({
			count: 3,
			cachedCount: 2,
			availableCount: 2,
			categories: [
				{ name: "人像", total: 2, cached: 1, available: 1 },
				{ name: "基础", total: 1, cached: 1, available: 1 },
			],
		});
		expect(result.filters[0]).toMatchObject({
			resourceId: "single",
			implementation: "single-lut",
			available: true,
			version: "current",
		});
		expect(result.filters[0]?.luts).toHaveLength(1);
		expect(result.filters[0]?.luts[0]?.version).toBe("current");
		expect(result.filters[1]).toMatchObject({
			resourceId: "dual",
			implementation: "dual-lut",
			available: true,
		});
		expect(result.filters[1]?.luts.map(({ role }) => role).sort()).toEqual([
			"background",
			"skin",
		]);
		expect(result.filters[2]).toMatchObject({
			resourceId: "missing",
			cacheStatus: "uncached",
			implementation: "unknown",
			verification: { status: "unverified" },
		});
	});

	it("does not apply a stale LUT under a newer catalog version", () => {
		const result = buildJianyingFilterLabCatalog({
			catalog: {
				order: ["基础"],
				filters: [
					{
						resourceId: "stale",
						title: "旧缓存",
						categories: ["基础"],
						version: "new",
					},
				],
			},
			references: [reference({ resourceId: "stale", version: "old" })],
			packages: new Map([
				["stale", packageSummary({ implementation: "single-lut" })],
			]),
		});
		expect(result.filters[0]).toMatchObject({
			version: "new",
			cacheStatus: "partial",
			available: false,
		});
	});

	it("preserves measured verification without inferring parity", () => {
		const result = buildJianyingFilterLabCatalog({
			catalog: {
				order: ["基础"],
				filters: [
					{
						resourceId: "verified",
						title: "实测",
						categories: ["基础"],
						version: "current",
					},
				],
			},
			references: [reference({ resourceId: "verified", version: "current" })],
			packages: new Map([
				["verified", packageSummary({ implementation: "single-lut" })],
			]),
			verifications: new Map([
				[
					"verified",
					{
						status: "verified" as const,
						version: "current",
						rgbRmse: 1.2,
						psnr: 46.5,
						ssim: 0.998,
					},
				],
			]),
		});
		expect(result.filters[0]?.verification).toEqual({
			status: "verified",
			version: "current",
			rgbRmse: 1.2,
			psnr: 46.5,
			ssim: 0.998,
		});
	});

	it("rejects stale verification and requires mask evidence for dual LUTs", () => {
		const catalog: JianyingFilterKnownCatalog = {
			order: ["人像", "基础"],
			filters: [
				{
					resourceId: "single",
					title: "单 LUT",
					categories: ["基础"],
					version: "v2",
				},
				{
					resourceId: "dual",
					title: "双 LUT",
					categories: ["人像"],
					version: "v1",
				},
			],
		};
		const result = buildJianyingFilterLabCatalog({
			catalog,
			references: [
				reference({ resourceId: "single", version: "v2" }),
				reference({
					resourceId: "dual",
					version: "v1",
					role: "background",
					fileName: "background.cube.vf",
				}),
				reference({
					resourceId: "dual",
					version: "v1",
					role: "skin",
					fileName: "skin.cube.vf",
				}),
			],
			packages: new Map([
				["single", packageSummary({ implementation: "single-lut" })],
				["dual", packageSummary({ implementation: "dual-lut" })],
			]),
			verifications: new Map([
				["single", { status: "verified", version: "v1" }],
				["dual", { status: "verified", version: "v1", rgbRmse: 0.4 }],
			]),
		});
		expect(result.filters[0]?.verification).toEqual({ status: "unverified" });
		expect(result.filters[1]?.verification).toMatchObject({
			status: "unverified",
			version: "v1",
			rgbRmse: 0.4,
		});
	});

	it("adds cached resources absent from stale metadata once", () => {
		const cached = reference({ resourceId: "orphan", version: "v1" });
		const result = mergeKnownFiltersWithReferences({
			catalog: { order: ["高清"], filters: [] },
			references: [cached, { ...cached, fileName: "duplicate.cube.vf" }],
			fallbackTitles: new Map([["orphan", "高清黑白"]]),
			fallbackCategories: new Map([["orphan", ["高清"]]]),
		});
		expect(result.filters).toEqual([
			{
				resourceId: "orphan",
				title: "高清黑白",
				categories: ["高清"],
				version: "v1",
			},
		]);
	});

	it("exposes a recognized tiled LUT shader as an available local cube", () => {
		const renderer = {
			kind: "tiled-lut-8x8" as const,
			container: "artistEffect" as const,
			packageIdentifier: "shader",
			version: "v1",
			relativePath: "AmazingFeature/image/filter.png",
			cubeSize: 64 as const,
		};
		const result = buildJianyingFilterLabCatalog({
			catalog: {
				order: ["黑白"],
				filters: [
					{
						resourceId: "shader",
						title: "黑金",
						categories: ["黑白"],
						version: "v1",
					},
				],
			},
			references: [],
			packages: new Map([
				[
					"shader",
					{ ...packageSummary({ implementation: "shader" }), renderer },
				],
			]),
		});
		expect(result).toMatchObject({
			availableCount: 1,
			filters: [
				{
					implementation: "shader",
					available: true,
					luts: [
						{
							lutId: "shader/v1/AmazingFeature/image/filter.png",
							role: "single",
							size: 64,
						},
					],
				},
			],
		});
	});

	it("exposes a recognized multi-pass shader without pretending it is a LUT", () => {
		const result = buildJianyingFilterLabCatalog({
			catalog: {
				order: ["美食"],
				filters: [
					{
						resourceId: "food",
						title: "清透美食",
						categories: ["美食"],
						version: "v1",
					},
				],
			},
			references: [],
			packages: new Map([
				[
					"food",
					{
						...packageSummary({ implementation: "shader" }),
						multiPassRenderer: {
							kind: "sharpen-lut" as const,
							container: "artistEffect" as const,
							packageIdentifier: "food",
							version: "v1",
							lutRelativePath: "AmazingFeature/image/filter.png",
							passCount: 2,
							fidelity: "structural" as const,
						},
					},
				],
			]),
		});

		expect(result.filters[0]).toMatchObject({
			implementation: "shader",
			available: true,
			luts: [],
			renderer: {
				kind: "sharpen-lut",
				passCount: 2,
				fidelity: "structural",
			},
		});
	});
});
