import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
	TEXT_DESIGNER_READY_CATEGORY_IDS,
	TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
	buildDesignerAssetGapReport,
	buildTextAssetPublishManifest,
	buildTextMarketplacePublishEntry,
	inferTextAssetCategory,
	parseTextAssetCdnArgs,
	summarizeDesignerCategoryCoverage,
	summarizeTextAssetProvenance,
	summarizeVerifyIssues,
	verifyDesignerAssetCoverage,
	verifyDesignerCategoryCoverage,
	verifyLocalFiles,
	verifyRemoteFiles,
	type TextAssetGeneratedEntry,
} from "../verify-text-asset-cdn-manifest";

type TestFileContent = Buffer | string;

function checksum({ value }: { value: TestFileContent }): string {
	return createHash("sha256").update(toBuffer({ value })).digest("hex");
}

function byteLength({ value }: { value: TestFileContent }): number {
	return toBuffer({ value }).byteLength;
}

function toBuffer({ value }: { value: TestFileContent }): Buffer {
	return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function createVp8xWebpBytes({
	height,
	width,
}: {
	height: number;
	width: number;
}): Buffer {
	const bytes = Buffer.alloc(30);
	bytes.write("RIFF", 0, "ascii");
	bytes.writeUInt32LE(bytes.byteLength - 8, 4);
	bytes.write("WEBP", 8, "ascii");
	bytes.write("VP8X", 12, "ascii");
	bytes.writeUInt32LE(10, 16);
	bytes.writeUIntLE(width - 1, 24, 3);
	bytes.writeUIntLE(height - 1, 27, 3);
	return bytes;
}

const THUMBNAIL_TEXT = createVp8xWebpBytes({ height: 304, width: 320 });
const DEFAULT_ASSET_ID = "text-demo";
const DEFAULT_CACHE_KEY = "text-assets/demo/plain@1";
const DEFAULT_PACKAGE_ID = "text-demo";
const DEFAULT_VERSION = 1;

function createSourcePayload({
	assetId = DEFAULT_ASSET_ID,
	packageId = DEFAULT_PACKAGE_ID,
	template = {
		content: "花字",
		id: "text-demo-template",
		name: "Demo template",
		type: "text",
	},
	version = DEFAULT_VERSION,
}: {
	assetId?: string;
	packageId?: string;
	template?: Record<string, unknown>;
	version?: number;
} = {}): Record<string, unknown> {
	return {
		assetId,
		packageId,
		schemaVersion: 1,
		template,
		version,
	};
}

function createPackagePayload({
	assetId = DEFAULT_ASSET_ID,
	cacheKey = DEFAULT_CACHE_KEY,
	files = {
		source: "template.json",
		thumbnail: "thumbnail.webp",
	},
	packageId = DEFAULT_PACKAGE_ID,
	version = DEFAULT_VERSION,
	source = createSourcePayload({ assetId, packageId, version }),
}: {
	assetId?: string;
	cacheKey?: string;
	files?: Record<string, unknown>;
	packageId?: string;
	source?: Record<string, unknown>;
	version?: number;
} = {}): Record<string, unknown> {
	return {
		assetId,
		cacheKey,
		files,
		kind: "qcut-text-template-package",
		packageId,
		schemaVersion: 1,
		source,
		version,
	};
}

const SOURCE_TEXT = JSON.stringify(createSourcePayload());
const PACKAGE_TEXT = JSON.stringify(createPackagePayload());

function createGeneratedEntry({
	packageText = PACKAGE_TEXT,
	sourceText = SOURCE_TEXT,
	thumbnailText = THUMBNAIL_TEXT,
}: {
	packageText?: string;
	sourceText?: string;
	thumbnailText?: TestFileContent;
} = {}): TextAssetGeneratedEntry {
	return {
		assetId: DEFAULT_ASSET_ID,
		cacheKey: DEFAULT_CACHE_KEY,
		packageId: DEFAULT_PACKAGE_ID,
		version: DEFAULT_VERSION,
		thumbnail: {
			byteSize: byteLength({ value: thumbnailText }),
			checksumSha256: checksum({ value: thumbnailText }),
			mimeType: "image/webp",
			url: "/text-assets/demo/plain@1/thumbnail.webp",
		},
		source: {
			byteSize: Buffer.byteLength(sourceText),
			checksumSha256: checksum({ value: sourceText }),
			mimeType: "application/json",
			url: "/text-assets/demo/plain@1/template.json",
		},
		qcutPackage: {
			byteSize: Buffer.byteLength(packageText),
			checksumSha256: checksum({ value: packageText }),
			mimeType: "application/vnd.qcut.text-template+json",
			url: "/text-assets/demo/plain@1/template.qctext",
		},
	};
}

async function writeGeneratedEntryFiles({
	entry,
	packageText = PACKAGE_TEXT,
	publicDir,
	sourceText = SOURCE_TEXT,
	thumbnailText = THUMBNAIL_TEXT,
}: {
	entry: TextAssetGeneratedEntry;
	packageText?: string;
	publicDir: string;
	sourceText?: string;
	thumbnailText?: TestFileContent;
}): Promise<void> {
	await Promise.all(
		[
			{ content: thumbnailText, file: entry.thumbnail },
			{ content: sourceText, file: entry.source },
			{ content: packageText, file: entry.qcutPackage },
		].map(async ({ content, file }) => {
			if (!file) return;
			const path = join(publicDir, file.url.replace(/^\/+/, ""));
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, content);
		})
	);
}

describe("text asset CDN manifest verifier", () => {
	it("parses CLI options with explicit paths and remote checks", () => {
		expect(
			parseTextAssetCdnArgs({
				argv: [
					"--base-url",
					"https://cdn.example.com/assets/",
					"--check-remote",
					"--check-remote-checksum",
					"--full-issues",
					"--manifest",
					"/tmp/generated.json",
					"--issue-limit",
					"2",
					"--min-designer-assets",
					"12",
					"--min-designer-assets-per-category",
					"5",
					"--require-designer-categories",
					"red, texture,headline-template",
					"--public-dir",
					"/tmp/public",
					"--remote-concurrency",
					"4",
					"--allow-designer-gaps",
					"--write",
					"/tmp/publish.json",
					"--write-designer-gap-report",
					"/tmp/designer-gap.json",
				],
			})
		).toMatchObject({
			allowDesignerGaps: true,
			baseUrl: "https://cdn.example.com/assets/",
			checkRemote: true,
			checkRemoteChecksum: true,
			fullIssues: true,
			issueLimit: 2,
			manifestPath: "/tmp/generated.json",
			minDesignerAssets: 12,
			minDesignerAssetsPerCategory: 5,
			publicDir: "/tmp/public",
			remoteConcurrency: 4,
			requiredDesignerCategories: ["red", "texture", "headline-template"],
			writeDesignerGapReportPath: "/tmp/designer-gap.json",
			writePath: "/tmp/publish.json",
		});
	});

	it("expands the designer-ready verification preset", () => {
		expect(
			parseTextAssetCdnArgs({
				argv: ["--designer-ready"],
			})
		).toMatchObject({
			minDesignerAssetsPerCategory: TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
			requiredDesignerCategories: [...TEXT_DESIGNER_READY_CATEGORY_IDS],
		});
	});

	it("summarizes verifier issues for readable CLI output", () => {
		const { issueSummary, issues } = summarizeVerifyIssues({
			issues: [
				{
					assetId: "text-demo",
					code: "remote-unavailable",
					detail: "first",
				},
				{
					assetId: "text-demo",
					code: "remote-unavailable",
					detail: "second",
				},
				{
					assetId: "text-demo",
					code: "checksum-mismatch",
					detail: "third",
				},
			],
			limit: 2,
		});

		expect(issueSummary).toEqual({
			byCode: {
				"checksum-mismatch": 1,
				"remote-unavailable": 2,
			},
			count: 3,
			truncated: 1,
		});
		expect(issues.map((issue) => issue.detail)).toEqual(["first", "second"]);
	});

	it("summarizes generated versus designer-imported provenance", () => {
		const designerEntry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			assetId: "text-designer",
			provenance: {
				pipeline: "designer-pack-v1",
				source: "designer-imported",
			},
		};
		const generatedEntry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			assetId: "text-generated",
			provenance: {
				pipeline: "qcut-canvas-thumbnail-v1",
				source: "generated",
			},
		};
		const missingEntry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			assetId: "text-missing-provenance",
		};

		expect(
			summarizeTextAssetProvenance({
				generatedManifest: {
					"text-designer": designerEntry,
					"text-generated": generatedEntry,
					"text-missing-provenance": missingEntry,
				},
			})
		).toEqual({
			designerImported: 1,
			generated: 1,
			missingProvenance: 1,
			pipelines: {
				"designer-pack-v1": 1,
				"qcut-canvas-thumbnail-v1": 1,
				missing: 1,
			},
			total: 3,
		});
	});

	it("reports designer asset coverage shortfalls when a release threshold is set", () => {
		expect(
			verifyDesignerAssetCoverage({
				minDesignerAssets: 2,
				provenance: {
					designerImported: 1,
					generated: 4,
					missingProvenance: 0,
					pipelines: { "designer-pack-v1": 1 },
					total: 5,
				},
			})
		).toEqual([
			{
				assetId: "text-designer-assets",
				code: "designer-import-threshold",
				detail: "Expected at least 2 designer-imported text assets, received 1",
			},
		]);
	});

	it("infers text asset categories from package IDs and cache keys", () => {
		expect(
			inferTextAssetCategory({
				entry: {
					...createGeneratedEntry(),
					packageId: "text-fancy-black-white",
				},
			})
		).toBe("black-white");
		expect(
			inferTextAssetCategory({
				entry: {
					...createGeneratedEntry(),
					cacheKey: "text-assets/text-templates-headline-template/plain@1",
					packageId: "text-demo",
				},
			})
		).toBe("headline-template");
	});

	it("reports missing designer category coverage", () => {
		const redDesignerEntry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			assetId: "text-red-designer",
			packageId: "text-fancy-red",
			provenance: {
				pipeline: "designer-pack-v1",
				source: "designer-imported",
			},
		};
		const textureGeneratedEntry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			assetId: "text-texture-generated",
			packageId: "text-fancy-texture",
			provenance: {
				pipeline: "qcut-canvas-thumbnail-v1",
				source: "generated",
			},
		};

		expect(
			verifyDesignerCategoryCoverage({
				generatedManifest: {
					"text-red-designer": redDesignerEntry,
					"text-texture-generated": textureGeneratedEntry,
				},
				requiredDesignerCategories: ["red", "texture"],
			})
		).toEqual([
			{
				assetId: "text-designer-assets",
				code: "designer-category-coverage",
				detail:
					"Expected at least 1 designer-imported text assets for each category, missing: texture (0)",
			},
		]);
	});

	it("reports designer categories below the per-category threshold", () => {
		const redDesignerEntry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			assetId: "text-red-designer",
			packageId: "text-fancy-red",
			provenance: {
				pipeline: "designer-pack-v1",
				source: "designer-imported",
			},
		};

		expect(
			verifyDesignerCategoryCoverage({
				generatedManifest: {
					"text-red-designer": redDesignerEntry,
				},
				minDesignerAssetsPerCategory: 5,
				requiredDesignerCategories: ["red"],
			})
		).toEqual([
			{
				assetId: "text-designer-assets",
				code: "designer-category-coverage",
				detail:
					"Expected at least 5 designer-imported text assets for each category, missing: red (1)",
			},
		]);
	});

	it("summarizes designer category coverage as an actionable gap report", () => {
		const redDesignerEntry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			assetId: "text-red-designer",
			packageId: "text-fancy-red",
			provenance: {
				pipeline: "designer-pack-v1",
				source: "designer-imported",
			},
		};

		expect(
			summarizeDesignerCategoryCoverage({
				generatedManifest: {
					"text-red-designer": redDesignerEntry,
				},
				minDesignerAssetsPerCategory: 5,
				requiredDesignerCategories: ["red", "texture"],
			})
		).toEqual({
			categories: [
				{ category: "red", current: 1, missing: 4, required: 5 },
				{ category: "texture", current: 0, missing: 5, required: 5 },
			],
			ok: false,
			requiredCategories: 2,
			totalMissing: 9,
		});
	});

	it("builds designer import slots for missing category coverage", () => {
		expect(
			buildDesignerAssetGapReport({
				coverage: {
					categories: [
						{ category: "red", current: 3, missing: 2, required: 5 },
						{
							category: "headline-template",
							current: 0,
							missing: 1,
							required: 1,
						},
					],
					ok: false,
					requiredCategories: 2,
					totalMissing: 3,
				},
				generatedAt: "2026-07-15T00:00:00.000Z",
				minDesignerAssetsPerCategory: 5,
				requiredDesignerCategories: ["red", "headline-template"],
			})
		).toEqual({
			categories: [
				{
					category: "red",
					current: 3,
					missing: 2,
					required: 5,
					suggestedImports: [
						{
							assetId: "text-fancy-red-designer-04",
							cacheKey: "text-assets/text-fancy-red/designer-04@1",
							packageId: "text-fancy-red",
							requiredFilePaths: [
								"text-assets/text-fancy-red/designer-04@1/thumbnail.webp",
								"text-assets/text-fancy-red/designer-04@1/template.json",
								"text-assets/text-fancy-red/designer-04@1/template.qctext",
							],
							requiredFiles: [
								"thumbnail.webp",
								"template.json",
								"template.qctext",
							],
							targetDirectory: "text-assets/text-fancy-red/designer-04@1",
							variantId: "designer-04",
						},
						{
							assetId: "text-fancy-red-designer-05",
							cacheKey: "text-assets/text-fancy-red/designer-05@1",
							packageId: "text-fancy-red",
							requiredFilePaths: [
								"text-assets/text-fancy-red/designer-05@1/thumbnail.webp",
								"text-assets/text-fancy-red/designer-05@1/template.json",
								"text-assets/text-fancy-red/designer-05@1/template.qctext",
							],
							requiredFiles: [
								"thumbnail.webp",
								"template.json",
								"template.qctext",
							],
							targetDirectory: "text-assets/text-fancy-red/designer-05@1",
							variantId: "designer-05",
						},
					],
				},
				{
					category: "headline-template",
					current: 0,
					missing: 1,
					required: 1,
					suggestedImports: [
						{
							assetId: "text-templates-headline-template-designer-01",
							cacheKey:
								"text-assets/text-templates-headline-template/designer-01@1",
							packageId: "text-templates-headline-template",
							requiredFilePaths: [
								"text-assets/text-templates-headline-template/designer-01@1/thumbnail.webp",
								"text-assets/text-templates-headline-template/designer-01@1/template.json",
								"text-assets/text-templates-headline-template/designer-01@1/template.qctext",
							],
							requiredFiles: [
								"thumbnail.webp",
								"template.json",
								"template.qctext",
							],
							targetDirectory:
								"text-assets/text-templates-headline-template/designer-01@1",
							variantId: "designer-01",
						},
					],
				},
			],
			generatedAt: "2026-07-15T00:00:00.000Z",
			minDesignerAssetsPerCategory: 5,
			requiredDesignerCategories: ["red", "headline-template"],
			schemaVersion: 1,
			totalMissing: 3,
		});
	});

	it("builds publish manifests with CDN URLs and local paths", () => {
		const entry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			provenance: {
				pipeline: "designer-pack-v1",
				source: "designer-imported",
			},
		};
		const { issues, manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com/assets/",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": entry },
			publicDir: "/tmp/public",
		});

		expect(issues).toEqual([]);
		expect(manifest.totalAssets).toBe(1);
		expect(manifest.totalFiles).toBe(3);
		expect(manifest.totalBytes).toBe(
			byteLength({ value: THUMBNAIL_TEXT }) +
				Buffer.byteLength(SOURCE_TEXT) +
				Buffer.byteLength(PACKAGE_TEXT)
		);
		expect(manifest.provenance).toMatchObject({
			designerImported: 1,
			total: 1,
		});
		expect(manifest.assets[0]?.provenance).toEqual(entry.provenance);
		expect(manifest.assets[0]?.files.map((file) => file.cdnUrl)).toEqual([
			"https://cdn.example.com/assets/text-assets/demo/plain@1/thumbnail.webp",
			"https://cdn.example.com/assets/text-assets/demo/plain@1/template.json",
			"https://cdn.example.com/assets/text-assets/demo/plain@1/template.qctext",
		]);
	});

	it("rejects virtual text asset URLs in publish manifests", () => {
		const entry = createGeneratedEntry();
		const virtualEntry: TextAssetGeneratedEntry = {
			...entry,
			thumbnail: {
				...entry.thumbnail,
				url: "qcut-text-asset://text-demo/thumbnail.webp",
			},
			source: {
				...entry.source,
				url: "qcut-text-asset://text-demo/template.json",
			},
			qcutPackage: {
				...entry.qcutPackage,
				url: "qcut-text-asset://text-demo/template.qctext",
			},
		};

		const { issues } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com/assets/",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": virtualEntry },
			publicDir: "/tmp/public",
		});

		expect(issues).toEqual([
			expect.objectContaining({
				assetId: "text-demo",
				code: "virtual-resource-url",
				detail: expect.stringContaining("thumbnail file"),
				url: "qcut-text-asset://text-demo/thumbnail.webp",
			}),
			expect.objectContaining({
				assetId: "text-demo",
				code: "virtual-resource-url",
				detail: expect.stringContaining("source file"),
				url: "qcut-text-asset://text-demo/template.json",
			}),
			expect.objectContaining({
				assetId: "text-demo",
				code: "virtual-resource-url",
				detail: expect.stringContaining("package file"),
				url: "qcut-text-asset://text-demo/template.qctext",
			}),
		]);
	});

	it("builds marketplace config publish entries", async () => {
		const publicDir = join(tmpdir(), `qcut-text-marketplace-${randomUUID()}`);
		const marketplacePath = join(publicDir, "text-assets/marketplace.json");
		await mkdir(dirname(marketplacePath), { recursive: true });
		await writeFile(
			marketplacePath,
			JSON.stringify({ assets: [], schemaVersion: 1 })
		);

		const marketplace = await buildTextMarketplacePublishEntry({
			baseUrl: "https://cdn.example.com/assets/",
			publicDir,
		});

		expect(marketplace.issues).toEqual([]);
		expect(marketplace.entry).toMatchObject({
			assetId: "text-marketplace-config",
			files: [
				expect.objectContaining({
					cdnUrl: "https://cdn.example.com/assets/text-assets/marketplace.json",
					localPath: marketplacePath,
					mimeType: "application/json",
					role: "metadata",
					url: "/text-assets/marketplace.json",
				}),
			],
		});
	});

	it("reports missing marketplace metadata coverage", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-marketplace-coverage-${randomUUID()}`
		);
		const marketplacePath = join(publicDir, "text-assets/marketplace.json");
		await mkdir(dirname(marketplacePath), { recursive: true });
		await writeFile(
			marketplacePath,
			JSON.stringify({ assets: [], schemaVersion: 1 })
		);

		const marketplace = await buildTextMarketplacePublishEntry({
			baseUrl: "https://cdn.example.com/assets/",
			generatedManifest: { "text-demo": createGeneratedEntry() },
			publicDir,
		});

		expect(marketplace.issues).toEqual([
			expect.objectContaining({
				assetId: "text-marketplace-config",
				code: "marketplace-metadata-coverage",
				detail: expect.stringContaining("text-demo"),
				url: "/text-assets/marketplace.json",
			}),
		]);
	});

	it("accepts marketplace metadata that covers generated assets", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-marketplace-covered-${randomUUID()}`
		);
		const marketplacePath = join(publicDir, "text-assets/marketplace.json");
		await mkdir(dirname(marketplacePath), { recursive: true });
		await writeFile(
			marketplacePath,
			JSON.stringify({
				assets: [{ assetId: "text-demo", packageId: "text-demo" }],
				schemaVersion: 1,
			})
		);

		const marketplace = await buildTextMarketplacePublishEntry({
			baseUrl: "https://cdn.example.com/assets/",
			generatedManifest: { "text-demo": createGeneratedEntry() },
			publicDir,
		});

		expect(marketplace.issues).toEqual([]);
		expect(marketplace.entry).toMatchObject({
			assetId: "text-marketplace-config",
		});
	});

	it("verifies local file byte sizes and checksums", async () => {
		const publicDir = join(tmpdir(), `qcut-text-assets-${randomUUID()}`);
		const entry = createGeneratedEntry();
		await writeGeneratedEntryFiles({ entry, publicDir });

		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": entry },
			publicDir,
		});

		await expect(verifyLocalFiles({ manifest })).resolves.toEqual([]);
	});

	it("reports local source identity mismatches", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-source-identity-${randomUUID()}`
		);
		const sourceText = JSON.stringify(
			createSourcePayload({ assetId: "text-other" })
		);
		const entry = createGeneratedEntry({ sourceText });
		await writeGeneratedEntryFiles({ entry, publicDir, sourceText });

		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": entry },
			publicDir,
		});

		await expect(verifyLocalFiles({ manifest })).resolves.toEqual([
			expect.objectContaining({
				code: "invalid-file-payload",
				detail: expect.stringContaining("source identity mismatch"),
				url: "/text-assets/demo/plain@1/template.json",
			}),
		]);
	});

	it("reports local source template payload mismatches", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-source-template-${randomUUID()}`
		);
		const sourceText = JSON.stringify(
			createSourcePayload({ template: { type: "image" } })
		);
		const entry = createGeneratedEntry({ sourceText });
		await writeGeneratedEntryFiles({ entry, publicDir, sourceText });

		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": entry },
			publicDir,
		});

		await expect(verifyLocalFiles({ manifest })).resolves.toEqual([
			expect.objectContaining({
				code: "invalid-file-payload",
				detail: "source template must be a text element",
				url: "/text-assets/demo/plain@1/template.json",
			}),
		]);
	});

	it("reports local package file reference mismatches", async () => {
		const publicDir = join(tmpdir(), `qcut-text-package-files-${randomUUID()}`);
		const packageText = JSON.stringify(
			createPackagePayload({
				files: {
					source: "wrong-template.json",
					thumbnail: "thumbnail.webp",
				},
			})
		);
		const entry = createGeneratedEntry({ packageText });
		await writeGeneratedEntryFiles({ entry, packageText, publicDir });

		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": entry },
			publicDir,
		});

		await expect(verifyLocalFiles({ manifest })).resolves.toEqual([
			expect.objectContaining({
				code: "invalid-file-payload",
				detail: expect.stringContaining("package file reference mismatch"),
				url: "/text-assets/demo/plain@1/template.qctext",
			}),
		]);
	});

	it("reports local package source identity mismatches", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-package-source-${randomUUID()}`
		);
		const packageText = JSON.stringify(
			createPackagePayload({
				source: createSourcePayload({ packageId: "text-other" }),
			})
		);
		const entry = createGeneratedEntry({ packageText });
		await writeGeneratedEntryFiles({ entry, packageText, publicDir });

		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": entry },
			publicDir,
		});

		await expect(verifyLocalFiles({ manifest })).resolves.toEqual([
			expect.objectContaining({
				code: "invalid-file-payload",
				detail: expect.stringContaining("package source identity mismatch"),
				url: "/text-assets/demo/plain@1/template.qctext",
			}),
		]);
	});

	it("reports local package source template pack copy slot mismatches", async () => {
		const publicDir = join(tmpdir(), `qcut-text-pack-slot-${randomUUID()}`);
		const packagePayload = createPackagePayload({
			source: {
				...createSourcePayload(),
				templatePack: {
					category: "headline-template",
					copySlots: [
						{
							defaultContent: "花字",
							elementIndex: 2,
							id: "headline",
							label: "主标题",
						},
					],
					elements: [
						{
							content: "花字",
							id: "pack-title",
							name: "Pack title",
							type: "text",
						},
					],
					id: "pack-demo",
					name: "Pack demo",
				},
			},
		});
		const entry = createGeneratedEntry({
			packageText: JSON.stringify(packagePayload),
		});
		await writeGeneratedEntryFiles({
			entry,
			packageText: JSON.stringify(packagePayload),
			publicDir,
		});

		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": entry },
			publicDir,
		});

		await expect(verifyLocalFiles({ manifest })).resolves.toEqual([
			expect.objectContaining({
				code: "invalid-file-payload",
				detail:
					"package source templatePack copy slot 0 elementIndex is out of range",
				url: "/text-assets/demo/plain@1/template.qctext",
			}),
		]);
	});

	it("reports local files with invalid resource payloads", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-invalid-payload-${randomUUID()}`
		);
		const entry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			thumbnail: {
				...createGeneratedEntry().thumbnail,
				byteSize: "not-webp".length,
				checksumSha256: checksum({ value: "not-webp" }),
			},
			source: {
				...createGeneratedEntry().source,
				byteSize: "not-json".length,
				checksumSha256: checksum({ value: "not-json" }),
			},
			qcutPackage: {
				...createGeneratedEntry().qcutPackage,
				byteSize: JSON.stringify({ kind: "wrong-kind" }).length,
				checksumSha256: checksum({
					value: JSON.stringify({ kind: "wrong-kind" }),
				}),
			},
		};
		await Promise.all(
			[
				{ content: "not-webp", file: entry.thumbnail },
				{ content: "not-json", file: entry.source },
				{
					content: JSON.stringify({ kind: "wrong-kind" }),
					file: entry.qcutPackage,
				},
			].map(async ({ content, file }) => {
				const path = join(publicDir, file.url.replace(/^\/+/, ""));
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, content);
			})
		);
		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": entry },
			publicDir,
		});

		await expect(verifyLocalFiles({ manifest })).resolves.toEqual([
			expect.objectContaining({
				code: "invalid-file-payload",
				url: "/text-assets/demo/plain@1/thumbnail.webp",
			}),
			expect.objectContaining({
				code: "invalid-file-payload",
				url: "/text-assets/demo/plain@1/template.json",
			}),
			expect.objectContaining({
				code: "invalid-file-payload",
				url: "/text-assets/demo/plain@1/template.qctext",
			}),
		]);
	});

	it("reports thumbnail WebP dimension mismatches", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-thumbnail-size-${randomUUID()}`
		);
		const thumbnailText = createVp8xWebpBytes({ height: 200, width: 200 });
		const entry = createGeneratedEntry({ thumbnailText });
		await writeGeneratedEntryFiles({ entry, publicDir, thumbnailText });
		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": entry },
			publicDir,
		});

		await expect(verifyLocalFiles({ manifest })).resolves.toEqual([
			expect.objectContaining({
				code: "invalid-file-payload",
				detail: "Thumbnail dimensions expected 320x304, received 200x200",
				url: "/text-assets/demo/plain@1/thumbnail.webp",
			}),
		]);
	});

	it("reports remote content-length mismatches", async () => {
		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": createGeneratedEntry() },
			publicDir: "/tmp/public",
		});
		const fetchImpl: typeof fetch = async () =>
			new Response(null, {
				headers: { "content-length": "999" },
				status: 200,
			});

		const issues = await verifyRemoteFiles({ fetchImpl, manifest });

		expect(issues).toHaveLength(3);
		expect(issues[0]).toMatchObject({
			assetId: "text-demo",
			code: "remote-size-mismatch",
		});
	});

	it("reports remote checksum mismatches during strict remote verification", async () => {
		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": createGeneratedEntry() },
			publicDir: "/tmp/public",
		});
		const requestedMethods: string[] = [];
		const fetchImpl: typeof fetch = async (_input, init) => {
			requestedMethods.push(init?.method ?? "GET");
			return new Response("wrong-but-available", {
				headers: {
					"content-length": String(byteLength({ value: THUMBNAIL_TEXT })),
				},
				status: 200,
			});
		};

		const issues = await verifyRemoteFiles({
			checksum: true,
			fetchImpl,
			manifest,
		});

		expect(requestedMethods).toEqual(["GET", "GET", "GET"]);
		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					assetId: "text-demo",
					code: "remote-checksum-mismatch",
					url: "/text-assets/demo/plain@1/thumbnail.webp",
				}),
			])
		);
	});

	it("reports remote fetch failures without aborting verification", async () => {
		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": createGeneratedEntry() },
			publicDir: "/tmp/public",
		});
		const fetchImpl: typeof fetch = async () => {
			throw new Error("connection refused");
		};

		const issues = await verifyRemoteFiles({ fetchImpl, manifest });

		expect(issues).toHaveLength(3);
		expect(issues[0]).toMatchObject({
			assetId: "text-demo",
			code: "remote-unavailable",
			detail: expect.stringContaining("connection refused"),
		});
	});

	it("limits remote verification concurrency", async () => {
		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": createGeneratedEntry() },
			publicDir: "/tmp/public",
		});
		let inFlight = 0;
		let maxInFlight = 0;
		const fetchImpl: typeof fetch = async () => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 5));
			inFlight -= 1;
			return new Response(null, { status: 200 });
		};

		await expect(
			verifyRemoteFiles({ concurrency: 2, fetchImpl, manifest })
		).resolves.toEqual([]);
		expect(maxInFlight).toBeLessThanOrEqual(2);
	});
});
