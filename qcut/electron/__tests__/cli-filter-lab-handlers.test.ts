// @vitest-environment node
import { describe, expect, it } from "vitest";
import type {
	JianyingFilterCategoryCatalog,
	resolveJianyingFilterCategories,
	resolveJianyingFilterTitles,
} from "../jianying-filter-metadata";
import {
	handleFilterLabCompare,
	handleFilterLabList,
	handleFilterLabVerify,
} from "../native-pipeline/cli/cli-handlers-filter-lab";
import type { JianyingLutEntry } from "../native-pipeline/filters/filter-lab-lut";

function createEntry({
	resourceId,
	version,
	chroma = 0.5,
}: {
	resourceId: string;
	version: string;
	chroma?: number;
}): JianyingLutEntry {
	const size = 2;
	return {
		lutId: `${resourceId}/${version}/filter.cube.vf`,
		resourceId,
		version,
		fileName: "filter.cube.vf",
		filePath: `/private/${resourceId}/filter.cube.vf`,
		role: "single",
		size,
		cube: { size, values: new Float64Array(size * size * size * 3) },
		chroma,
	};
}

const summerEntry = createEntry({ resourceId: "710001", version: "aaa" });
const monoEntry = createEntry({
	resourceId: "710002",
	version: "bbb",
	chroma: 0,
});

/** Fakes keyed exactly like the real metadata module keys its results. */
function createResolvers({
	catalog,
	titles,
}: {
	catalog: JianyingFilterCategoryCatalog;
	titles: Map<string, string>;
}): {
	resolveCategories: typeof resolveJianyingFilterCategories;
	resolveTitles: typeof resolveJianyingFilterTitles;
} {
	return {
		resolveCategories: async () => catalog,
		resolveTitles: async () => titles,
	};
}

describe("handleFilterLabList", () => {
	it("enriches rows with Jianying categories and titles", async () => {
		const { resolveCategories, resolveTitles } = createResolvers({
			catalog: {
				order: ["夏日", "影视级"],
				byResourceId: new Map([["710001", ["夏日", "影视级"]]]),
			},
			titles: new Map([["710001/aaa", "蓝调"]]),
		});
		const result = await handleFilterLabList(
			{ json: true },
			{
				listLuts: async () => [summerEntry, monoEntry],
				resolveCategories,
				resolveTitles,
			}
		);
		expect(result.success).toBe(true);
		const data = result.data as {
			count: number;
			luts: {
				lutId: string;
				kind: string;
				title?: string;
				categories?: string[];
			}[];
		};
		expect(data.count).toBe(2);
		const [first, second] = data.luts;
		expect(first.title).toBe("蓝调");
		expect(first.categories).toEqual(["夏日", "影视级"]);
		expect(first.kind).toBe("colour");
		// Metadata absent for this LUT: fields are omitted, not null.
		expect("title" in second).toBe(false);
		expect("categories" in second).toBe(false);
		expect(second.kind).toBe("monochrome");
	});

	it("degrades to plain rows when metadata resolution fails", async () => {
		const result = await handleFilterLabList(
			{ json: true },
			{
				listLuts: async () => [summerEntry],
				resolveCategories: async () => {
					throw new Error("rp.db is locked");
				},
				resolveTitles: async () => new Map(),
			}
		);
		expect(result.success).toBe(true);
		const data = result.data as { luts: { title?: string }[] };
		expect(data.luts).toHaveLength(1);
		expect("title" in data.luts[0]).toBe(false);
	});

	it("errors helpfully when no LUTs are cached", async () => {
		const result = await handleFilterLabList(
			{ json: true },
			{ listLuts: async () => [] }
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("No Jianying LUTs are cached locally");
	});
});

describe("handleFilterLabCompare", () => {
	it("requires an identifier before touching the cache", async () => {
		const result = await handleFilterLabCompare({});
		expect(result.success).toBe(false);
		expect(result.error).toContain("--lut-id or --resource-id");
	});
});

describe("handleFilterLabVerify", () => {
	it("requires exact versioned frame evidence", async () => {
		const result = await handleFilterLabVerify({ resourceId: "filter-1" });
		expect(result.success).toBe(false);
		expect(result.error).toContain("--filter-version");
	});

	it("measures and persists one resource version", async () => {
		const saved: unknown[] = [];
		const result = await handleFilterLabVerify(
			{
				resourceId: "filter-1",
				filterVersion: "v2",
				referenceFrame: "jianying.png",
				candidateFrame: "qcut.png",
				referenceMask: "jianying-mask.png",
				candidateMask: "qcut-mask.png",
			},
			{
				verify: async ({ input }) => {
					expect(input).toEqual({
						referenceFrame: "jianying.png",
						candidateFrame: "qcut.png",
						referenceMask: "jianying-mask.png",
						candidateMask: "qcut-mask.png",
					});
					return {
						status: "verified",
						width: 1920,
						height: 1080,
						rgbRmse: 0.5,
						psnr: 54.15,
						ssim: 0.999,
						deltaE: 0.4,
						maskEdgeMae: 0.01,
						referenceSha256: "a".repeat(64),
						candidateSha256: "b".repeat(64),
						verifiedAt: "2026-08-11T00:00:00.000Z",
					};
				},
				save: async ({ record }) => {
					saved.push(record);
					return "/tmp/verifications.json";
				},
			}
		);
		expect(result.success).toBe(true);
		expect(saved).toMatchObject([
			{
				resourceId: "filter-1",
				version: "v2",
				status: "verified",
			},
		]);
		expect(result.data).toMatchObject({
			storePath: "/tmp/verifications.json",
		});
	});
});
