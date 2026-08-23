import { afterEach, describe, expect, test, vi } from "vitest";
import {
	handleStickerLabCatalogs,
	handleStickerLabCategories,
	handleStickerLabItems,
	handleStickerLabSearch,
	type StickerLabHandlerDependencies,
} from "../cli-handlers-sticker-lab";
import type { CLIRunOptions } from "../cli-runner/types";

type LocalStickerLabDiscovery = Awaited<
	ReturnType<StickerLabHandlerDependencies["discover"]>
>;

const ROOT_PATH = "/private/QCut Sticker Lab";

function discovery(): LocalStickerLabDiscovery {
	return {
		rootPath: ROOT_PATH,
		catalogs: [
			{
				version: 1,
				batchId: "jianying-2026-08-22-batch-17-v3",
				referenceOnly: true,
				generatedAt: "2026-08-22T00:00:00.000Z",
				categories: [
					{
						id: "100",
						label: "热门",
						sourcePanel: "贴纸 > 热门",
						items: [
							{
								id: "17001",
								displayName: "安排",
								fileName: "17001.gif",
								mimeType: "image/gif",
								sourceKind: "direct-gif",
								playback: {
									kind: "animated",
									frameCount: 12,
									cycleDuration: 1.2,
									loop: true,
								},
								asset: {
									kind: "local-reference",
									rootPath: ROOT_PATH,
									batchId: "jianying-2026-08-22-batch-17-v3",
									stickerId: "17001",
									byteSize: 1200,
									checksumSha256: "a".repeat(64),
								},
							},
							{
								id: "17002",
								displayName: "收到",
								fileName: "17002.png",
								mimeType: "image/png",
								sourceKind: "static-image",
								playback: { kind: "static" },
								asset: {
									kind: "local-reference",
									rootPath: ROOT_PATH,
									batchId: "jianying-2026-08-22-batch-17-v3",
									stickerId: "17002",
									byteSize: 800,
									checksumSha256: "b".repeat(64),
								},
							},
						],
					},
				],
				itemCount: 2,
				totalBytes: 2000,
			},
			{
				version: 1,
				batchId: "jianying-2026-08-23-batch-18-v2",
				referenceOnly: true,
				categories: [
					{
						id: "200",
						label: "秋日",
						sourcePanel: "贴纸 > 秋日",
						items: [
							{
								id: "18001",
								displayName: "落叶",
								fileName: "18001.png",
								mimeType: "image/png",
								sourceKind: "static-image",
								playback: { kind: "static" },
								asset: {
									kind: "local-reference",
									rootPath: ROOT_PATH,
									batchId: "jianying-2026-08-23-batch-18-v2",
									stickerId: "18001",
									byteSize: 3000,
									checksumSha256: "c".repeat(64),
								},
							},
						],
					},
				],
				itemCount: 1,
				totalBytes: 3000,
			},
		],
		warnings: [{ batchId: "broken-batch", message: "manifest unavailable" }],
		summary: {
			batchCount: 2,
			categoryCount: 2,
			itemCount: 3,
			totalBytes: 5000,
		},
	};
}

function baseOptions({ command }: { command: string }): CLIRunOptions {
	return {
		command,
		outputDir: "/tmp",
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

function dependencies({
	discover = async () => discovery(),
}: {
	discover?: StickerLabHandlerDependencies["discover"];
} = {}): StickerLabHandlerDependencies {
	return { discover };
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("sticker-lab CLI handlers", () => {
	test("lists catalog summaries with reference-only policy and provenance", async () => {
		vi.stubEnv("QCUT_STICKER_LAB_ROOT", "/configured/QCut Sticker Lab");
		const discover = vi.fn(async () => discovery());
		const result = await handleStickerLabCatalogs(
			{
				...baseOptions({ command: "sticker-lab-catalogs" }),
				root: ROOT_PATH,
				query: "batch-18",
			},
			dependencies({ discover })
		);

		expect(discover).toHaveBeenCalledWith({ rootPath: ROOT_PATH });
		expect(result).toMatchObject({
			success: true,
			data: {
				referenceOnly: true,
				warning: expect.stringContaining("Do not redistribute"),
				warnings: [{ message: "manifest unavailable" }],
				provenance: {
					kind: "local-reference",
					rootPath: ROOT_PATH,
					redistribution: "prohibited",
				},
				matching: 1,
				returned: 1,
				catalogs: [
					{
						batchId: "jianying-2026-08-23-batch-18-v2",
						itemCount: 1,
						referenceOnly: true,
					},
				],
			},
		});
		expect(JSON.stringify(result)).not.toMatch(/signed|https?:\/\//i);
	});

	test("uses QCUT_STICKER_LAB_ROOT when --root is absent", async () => {
		vi.stubEnv("QCUT_STICKER_LAB_ROOT", "  /configured/QCut Sticker Lab  ");
		const discover = vi.fn(async () => discovery());

		const result = await handleStickerLabCatalogs(
			baseOptions({ command: "sticker-lab-catalogs" }),
			dependencies({ discover })
		);

		expect(result.success).toBe(true);
		expect(discover).toHaveBeenCalledWith({
			rootPath: "/configured/QCut Sticker Lab",
		});
	});

	test("fails when an explicit or configured root has no usable catalogs", async () => {
		const unavailableDiscovery: StickerLabHandlerDependencies["discover"] =
			async ({ rootPath } = {}) => ({
				rootPath: rootPath ?? "/platform/default",
				catalogs: [],
				warnings: [{ message: "ENOENT: Sticker Lab root is unavailable" }],
				summary: {
					batchCount: 0,
					categoryCount: 0,
					itemCount: 0,
					totalBytes: 0,
				},
			});
		const explicit = await handleStickerLabCatalogs(
			{
				...baseOptions({ command: "sticker-lab-catalogs" }),
				root: "/missing/explicit-root",
			},
			dependencies({ discover: unavailableDiscovery })
		);
		vi.stubEnv("QCUT_STICKER_LAB_ROOT", "/missing/configured-root");
		const configured = await handleStickerLabCatalogs(
			baseOptions({ command: "sticker-lab-catalogs" }),
			dependencies({ discover: unavailableDiscovery })
		);

		expect(explicit).toMatchObject({
			success: false,
			error: expect.stringContaining("/missing/explicit-root"),
		});
		expect(configured).toMatchObject({
			success: false,
			error: expect.stringContaining("/missing/configured-root"),
		});
		expect(explicit.error).toContain("ENOENT");
	});

	test("keeps a missing platform default as an unavailable empty result", async () => {
		vi.stubEnv("QCUT_STICKER_LAB_ROOT", "  ");
		const result = await handleStickerLabCatalogs(
			baseOptions({ command: "sticker-lab-catalogs" }),
			dependencies({
				discover: async ({ rootPath }) => ({
					rootPath: rootPath ?? "/home/tester/Videos/QCut Sticker Lab",
					catalogs: [],
					warnings: [{ message: "Sticker Lab root is unavailable" }],
					summary: {
						batchCount: 0,
						categoryCount: 0,
						itemCount: 0,
						totalBytes: 0,
					},
				}),
			})
		);

		expect(result).toMatchObject({
			success: true,
			data: {
				total: 0,
				catalogs: [],
				warnings: [{ message: "Sticker Lab root is unavailable" }],
			},
		});
	});

	test("filters categories by exact label and reports aggregate bytes", async () => {
		const result = await handleStickerLabCategories(
			{
				...baseOptions({ command: "sticker-lab-categories" }),
				category: "热门",
			},
			dependencies()
		);

		expect(result.data).toMatchObject({
			matching: 1,
			categories: [
				{
					batchId: "jianying-2026-08-22-batch-17-v3",
					id: "100",
					itemCount: 2,
					totalBytes: 2000,
				},
			],
		});
	});

	test("searches item metadata and applies pagination after filtering", async () => {
		const result = await handleStickerLabSearch(
			{
				...baseOptions({ command: "sticker-lab-search" }),
				query: "贴纸 热门",
				offset: 1,
				limit: 1,
			},
			dependencies()
		);

		expect(result.data).toMatchObject({
			matching: 2,
			offset: 1,
			limit: 1,
			returned: 1,
			hasMore: false,
			results: [
				{
					id: "17002",
					categoryLabel: "热门",
					asset: {
						kind: "local-reference",
						stickerId: "17002",
					},
				},
			],
		});
	});

	test("lists items without requiring a query", async () => {
		const result = await handleStickerLabItems(
			{
				...baseOptions({ command: "sticker-lab-items" }),
				batchId: "jianying-2026-08-23-batch-18-v2",
			},
			dependencies()
		);

		expect(result.data).toMatchObject({
			matching: 1,
			items: [{ id: "18001", displayName: "落叶" }],
		});
	});

	test("rejects missing search text and invalid pagination before browsing", async () => {
		const discover = vi.fn(async () => discovery());
		const missingQuery = await handleStickerLabSearch(
			baseOptions({ command: "sticker-lab-search" }),
			dependencies({ discover })
		);
		const invalidLimit = await handleStickerLabItems(
			{
				...baseOptions({ command: "sticker-lab-items" }),
				limit: 501,
			},
			dependencies({ discover })
		);

		expect(missingQuery).toMatchObject({
			success: false,
			error: expect.stringContaining("Missing --query"),
		});
		expect(invalidLimit).toMatchObject({
			success: false,
			error: expect.stringContaining("--limit"),
		});
		expect(discover).toHaveBeenCalledTimes(1);
	});
});
