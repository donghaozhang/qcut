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
	renderDesignerAssetGapChecklistCsv,
	summarizeDesignerCategoryCoverage,
	summarizeTextAssetReleaseReadiness,
	summarizeTextAssetProvenance,
	summarizeTextAssetVerifierFileReadiness,
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
	definition = { id: "text-demo-template" },
	marketplace,
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
	definition?: Record<string, unknown>;
	marketplace?: Record<string, unknown>;
	packageId?: string;
	template?: Record<string, unknown>;
	version?: number;
} = {}): Record<string, unknown> {
	return {
		assetId,
		definition,
		marketplace,
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
	resources = createPackageResources({
		cacheKey,
		sourceText: SOURCE_TEXT,
		thumbnailText: THUMBNAIL_TEXT,
	}),
	version = DEFAULT_VERSION,
	source = createSourcePayload({ assetId, packageId, version }),
}: {
	assetId?: string;
	cacheKey?: string;
	files?: Record<string, unknown>;
	packageId?: string;
	resources?: Record<string, unknown>[];
	source?: Record<string, unknown>;
	version?: number;
} = {}): Record<string, unknown> {
	return {
		assetId,
		cacheKey,
		files,
		kind: "qcut-text-template-package",
		packageId,
		resources,
		schemaVersion: 1,
		source,
		version,
	};
}

const SOURCE_TEXT = JSON.stringify(createSourcePayload());

function createPackageResources({
	cacheKey = DEFAULT_CACHE_KEY,
	sourceText = SOURCE_TEXT,
	thumbnailText = THUMBNAIL_TEXT,
}: {
	cacheKey?: string;
	sourceText?: string;
	thumbnailText?: TestFileContent;
} = {}): Record<string, unknown>[] {
	return [
		{
			byteSize: byteLength({ value: thumbnailText }),
			checksumSha256: checksum({ value: thumbnailText }),
			mimeType: "image/webp",
			path: "thumbnail.webp",
			role: "thumbnail",
			url: `/${cacheKey}/thumbnail.webp`,
		},
		{
			byteSize: byteLength({ value: sourceText }),
			checksumSha256: checksum({ value: sourceText }),
			mimeType: "application/json",
			path: "template.json",
			role: "source",
			url: `/${cacheKey}/template.json`,
		},
	];
}

function createPackageText({
	assetId = DEFAULT_ASSET_ID,
	cacheKey = DEFAULT_CACHE_KEY,
	packageId = DEFAULT_PACKAGE_ID,
	source = JSON.parse(SOURCE_TEXT) as Record<string, unknown>,
	sourceText = SOURCE_TEXT,
	thumbnailText = THUMBNAIL_TEXT,
	version = DEFAULT_VERSION,
}: {
	assetId?: string;
	cacheKey?: string;
	packageId?: string;
	source?: Record<string, unknown>;
	sourceText?: string;
	thumbnailText?: TestFileContent;
	version?: number;
} = {}): string {
	return JSON.stringify(
		createPackagePayload({
			assetId,
			cacheKey,
			packageId,
			resources: createPackageResources({
				cacheKey,
				sourceText,
				thumbnailText,
			}),
			source,
			version,
		})
	);
}

const PACKAGE_TEXT = createPackageText();

function createGeneratedEntry({
	assetId = DEFAULT_ASSET_ID,
	cacheKey = DEFAULT_CACHE_KEY,
	packageId = DEFAULT_PACKAGE_ID,
	packageText,
	sourceText = SOURCE_TEXT,
	thumbnailText = THUMBNAIL_TEXT,
}: {
	assetId?: string;
	cacheKey?: string;
	packageId?: string;
	packageText?: string;
	sourceText?: string;
	thumbnailText?: TestFileContent;
} = {}): TextAssetGeneratedEntry {
	const resolvedPackageText =
		packageText ??
		createPackageText({
			assetId,
			cacheKey,
			packageId,
			source: JSON.parse(sourceText) as Record<string, unknown>,
			sourceText,
			thumbnailText,
		});
	return {
		assetId,
		cacheKey,
		packageId,
		version: DEFAULT_VERSION,
		thumbnail: {
			byteSize: byteLength({ value: thumbnailText }),
			checksumSha256: checksum({ value: thumbnailText }),
			mimeType: "image/webp",
			url: `/${cacheKey}/thumbnail.webp`,
		},
		source: {
			byteSize: Buffer.byteLength(sourceText),
			checksumSha256: checksum({ value: sourceText }),
			mimeType: "application/json",
			url: `/${cacheKey}/template.json`,
		},
		qcutPackage: {
			byteSize: Buffer.byteLength(resolvedPackageText),
			checksumSha256: checksum({ value: resolvedPackageText }),
			mimeType: "application/vnd.qcut.text-template+json",
			url: `/${cacheKey}/template.qctext`,
		},
	};
}

async function writeGeneratedEntryFiles({
	entry,
	packageText,
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
	const resolvedPackageText =
		packageText ??
		createPackageText({
			assetId: entry.assetId,
			cacheKey: entry.cacheKey,
			packageId: entry.packageId,
			source: JSON.parse(sourceText) as Record<string, unknown>,
			sourceText,
			thumbnailText,
			version: entry.version,
		});
	await Promise.all(
		[
			{ content: thumbnailText, file: entry.thumbnail },
			{ content: sourceText, file: entry.source },
			{ content: resolvedPackageText, file: entry.qcutPackage },
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
					"--check-remote-metadata",
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
					"--write-designer-gap-checklist",
					"/tmp/designer-gap.csv",
				],
			})
		).toMatchObject({
			allowDesignerGaps: true,
			baseUrl: "https://cdn.example.com/assets/",
			checkRemote: true,
			checkRemoteChecksum: true,
			checkRemoteMetadata: true,
			fullIssues: true,
			issueLimit: 2,
			manifestPath: "/tmp/generated.json",
			minDesignerAssets: 12,
			minDesignerAssetsPerCategory: 5,
			publicDir: "/tmp/public",
			remoteConcurrency: 4,
			requiredDesignerCategories: ["red", "texture", "headline-template"],
			writeDesignerGapChecklistPath: "/tmp/designer-gap.csv",
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

	it("summarizes local and remote file readiness separately from coverage gates", () => {
		expect(
			summarizeTextAssetVerifierFileReadiness({
				localIssues: [
					{
						assetId: "text-demo",
						code: "missing-file",
						detail: "missing thumbnail",
					},
				],
				remoteIssues: [
					{
						assetId: "text-demo",
						code: "remote-checksum-mismatch",
						detail: "bad remote checksum",
					},
					{
						assetId: "text-demo",
						code: "remote-unavailable",
						detail: "HEAD failed",
					},
				],
			})
		).toEqual({
			localFilesReady: false,
			localIssueSummary: {
				byCode: { "missing-file": 1 },
				count: 1,
				truncated: 1,
			},
			remoteFilesReady: false,
			remoteIssueSummary: {
				byCode: {
					"remote-checksum-mismatch": 1,
					"remote-unavailable": 1,
				},
				count: 2,
				truncated: 2,
			},
		});
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

	it("summarizes designer readiness independently from structural verification", () => {
		const generatedEntry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			assetId: "text-red-generated",
			packageId: "text-fancy-red",
			provenance: {
				pipeline: "qcut-canvas-thumbnail-v1",
				source: "generated",
			},
		};
		const designerEntry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			assetId: "text-red-designer",
			packageId: "text-fancy-red",
			provenance: {
				pipeline: "designer-pack-v1",
				source: "designer-imported",
			},
		};

		expect(
			summarizeTextAssetReleaseReadiness({
				generatedManifest: {
					"text-red-designer": designerEntry,
					"text-red-generated": generatedEntry,
				},
				requiredDesignerCategories: ["red", "texture"],
			})
		).toEqual({
			designerImported: 1,
			designerReady: false,
			designerReadyMissing: 9,
			generated: 1,
			missingResourceFileMetadata: 0,
			minDesignerAssetsPerCategory: 5,
			releaseStatus: "generated-fallback",
			resourceFilesReady: true,
			resourceReadyAssets: 2,
			requiredDesignerCategories: ["red", "texture"],
			requiredDesignerCategoriesCount: 2,
			totalRequiredResourceFiles: 6,
			totalRequiredDesignerAssets: 10,
			virtualResourceUrls: 0,
		});
	});

	it("marks text assets designer-ready once required categories are filled", () => {
		const designerEntries = Object.fromEntries(
			Array.from({ length: 5 }, (_, index) => {
				const entry: TextAssetGeneratedEntry = {
					...createGeneratedEntry(),
					assetId: `text-red-designer-${index + 1}`,
					packageId: "text-fancy-red",
					provenance: {
						pipeline: "designer-pack-v1",
						source: "designer-imported",
					},
				};
				return [entry.assetId, entry];
			})
		);

		expect(
			summarizeTextAssetReleaseReadiness({
				generatedManifest: designerEntries,
				requiredDesignerCategories: ["red"],
			})
		).toMatchObject({
			designerImported: 5,
			designerReady: true,
			designerReadyMissing: 0,
			missingResourceFileMetadata: 0,
			releaseStatus: "designer-ready",
			resourceFilesReady: true,
			resourceReadyAssets: 5,
			totalRequiredResourceFiles: 15,
			totalRequiredDesignerAssets: 5,
			virtualResourceUrls: 0,
		});
	});

	it("keeps resource file readiness separate from designer coverage", () => {
		const completeDesignerEntries = Object.fromEntries(
			Array.from({ length: 4 }, (_, index) => {
				const entry: TextAssetGeneratedEntry = {
					...createGeneratedEntry(),
					assetId: `text-red-designer-${index + 1}`,
					packageId: "text-fancy-red",
					provenance: {
						pipeline: "designer-pack-v1",
						source: "designer-imported",
					},
				};
				return [entry.assetId, entry];
			})
		);
		const virtualDesignerEntry: TextAssetGeneratedEntry = {
			...createGeneratedEntry(),
			assetId: "text-red-designer-virtual",
			packageId: "text-fancy-red",
			provenance: {
				pipeline: "designer-pack-v1",
				source: "designer-imported",
			},
			thumbnail: {
				...createGeneratedEntry().thumbnail,
				url: "qcut-text-asset://text-red-designer-virtual/thumbnail.webp",
			},
			qcutPackage: undefined,
		};

		expect(
			summarizeTextAssetReleaseReadiness({
				generatedManifest: {
					...completeDesignerEntries,
					[virtualDesignerEntry.assetId]: virtualDesignerEntry,
				},
				requiredDesignerCategories: ["red"],
			})
		).toMatchObject({
			designerImported: 5,
			designerReady: true,
			designerReadyMissing: 0,
			missingResourceFileMetadata: 1,
			resourceFilesReady: false,
			resourceReadyAssets: 4,
			totalRequiredResourceFiles: 15,
			virtualResourceUrls: 1,
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

	it("renders designer gap reports as a handoff checklist csv", () => {
		const report = buildDesignerAssetGapReport({
			coverage: {
				categories: [{ category: "red", current: 3, missing: 1, required: 4 }],
				ok: false,
				requiredCategories: 1,
				totalMissing: 1,
			},
			generatedAt: "2026-07-15T00:00:00.000Z",
			minDesignerAssetsPerCategory: 4,
			requiredDesignerCategories: ["red"],
		});

		expect(renderDesignerAssetGapChecklistCsv({ report })).toBe(
			[
				'"category","currentDesignerAssets","requiredDesignerAssets","missingDesignerAssets","assetId","packageId","variantId","targetDirectory","visualGoal","thumbnailDirection","templateDirection","thumbnailPath","sourcePath","qcutPackagePath","requiredFiles"',
				'"red","3","4","1","text-fancy-red-designer-04","text-fancy-red","designer-04","text-assets/text-fancy-red/designer-04@1","Commerce, live-selling, and urgent cover text with strong red impact.","Make red urgency obvious with burst, flame, sticker, or price-promo accents.","Use sale, warning, fire, or hot-list treatments with strong edges and energetic emphasis.","text-assets/text-fancy-red/designer-04@1/thumbnail.webp","text-assets/text-fancy-red/designer-04@1/template.json","text-assets/text-fancy-red/designer-04@1/template.qctext","thumbnail.webp;template.json;template.qctext"',
				"",
			].join("\n")
		);
	});

	it("targets existing generated assets for designer replacement slots", () => {
		const generatedManifest = {
			"text-fancy-red-outline": createGeneratedEntry({
				assetId: "text-fancy-red-outline",
				cacheKey: "text-assets/text-fancy-red/outline@1",
				packageId: "text-fancy-red",
			}),
			"text-fancy-red-plain": createGeneratedEntry({
				assetId: "text-fancy-red-plain",
				cacheKey: "text-assets/text-fancy-red/plain@1",
				packageId: "text-fancy-red",
			}),
			"text-fancy-red-imported": {
				...createGeneratedEntry({
					assetId: "text-fancy-red-imported",
					cacheKey: "text-assets/text-fancy-red/imported@1",
					packageId: "text-fancy-red",
				}),
				provenance: {
					pipeline: "designer-pack-v1",
					source: "designer-imported" as const,
				},
			},
		};

		expect(
			buildDesignerAssetGapReport({
				coverage: {
					categories: [
						{ category: "red", current: 1, missing: 2, required: 3 },
					],
					ok: false,
					requiredCategories: 1,
					totalMissing: 2,
				},
				generatedAt: "2026-07-15T00:00:00.000Z",
				generatedManifest,
				minDesignerAssetsPerCategory: 3,
				requiredDesignerCategories: ["red"],
			}).categories[0]?.suggestedImports
		).toEqual([
			{
				assetId: "text-fancy-red-outline",
				cacheKey: "text-assets/text-fancy-red/outline@1",
				packageId: "text-fancy-red",
				requiredFilePaths: [
					"text-assets/text-fancy-red/outline@1/thumbnail.webp",
					"text-assets/text-fancy-red/outline@1/template.json",
					"text-assets/text-fancy-red/outline@1/template.qctext",
				],
				requiredFiles: ["thumbnail.webp", "template.json", "template.qctext"],
				targetDirectory: "text-assets/text-fancy-red/outline@1",
				variantId: "outline",
			},
			{
				assetId: "text-fancy-red-plain",
				cacheKey: "text-assets/text-fancy-red/plain@1",
				packageId: "text-fancy-red",
				requiredFilePaths: [
					"text-assets/text-fancy-red/plain@1/thumbnail.webp",
					"text-assets/text-fancy-red/plain@1/template.json",
					"text-assets/text-fancy-red/plain@1/template.qctext",
				],
				requiredFiles: ["thumbnail.webp", "template.json", "template.qctext"],
				targetDirectory: "text-assets/text-fancy-red/plain@1",
				variantId: "plain",
			},
		]);
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

	it("reports every missing text asset companion file without crashing", () => {
		const missingThumbnail = {
			...createGeneratedEntry({
				assetId: "text-missing-thumbnail",
				cacheKey: "text-assets/demo/missing-thumbnail@1",
			}),
			thumbnail: undefined as unknown as TextAssetGeneratedEntry["thumbnail"],
		};
		const missingSource = {
			...createGeneratedEntry({
				assetId: "text-missing-source",
				cacheKey: "text-assets/demo/missing-source@1",
			}),
			source: undefined as unknown as TextAssetGeneratedEntry["source"],
		};
		const missingPackage = {
			...createGeneratedEntry({
				assetId: "text-missing-package",
				cacheKey: "text-assets/demo/missing-package@1",
			}),
			qcutPackage: undefined,
		};

		const { issues, manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com/assets/",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: {
				[missingPackage.assetId]: missingPackage,
				[missingSource.assetId]: missingSource,
				[missingThumbnail.assetId]: missingThumbnail,
			},
			publicDir: "/tmp/public",
		});

		expect(issues).toEqual([
			expect.objectContaining({
				assetId: "text-missing-package",
				code: "missing-package",
				detail: "Missing required companion package file metadata",
			}),
			expect.objectContaining({
				assetId: "text-missing-source",
				code: "missing-package",
				detail: "Missing required companion source file metadata",
			}),
			expect.objectContaining({
				assetId: "text-missing-thumbnail",
				code: "missing-package",
				detail: "Missing required companion thumbnail file metadata",
			}),
		]);
		expect(manifest.totalAssets).toBe(3);
		expect(manifest.totalFiles).toBe(6);
	});

	it("reports duplicate thumbnail checksums within a text asset category", () => {
		const duplicateThumbnail = createVp8xWebpBytes({ height: 304, width: 320 });
		const first = createGeneratedEntry({
			assetId: "text-fancy-red-plain",
			cacheKey: "text-assets/text-fancy-red/plain@1",
			packageId: "text-fancy-red",
			thumbnailText: duplicateThumbnail,
		});
		const second = createGeneratedEntry({
			assetId: "text-fancy-red-outline",
			cacheKey: "text-assets/text-fancy-red/outline@1",
			packageId: "text-fancy-red",
			thumbnailText: duplicateThumbnail,
		});

		const { issues } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com/assets/",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: {
				[first.assetId]: first,
				[second.assetId]: second,
			},
			publicDir: "/tmp/public",
		});

		expect(issues).toEqual([
			expect.objectContaining({
				assetId: "text-thumbnail-diversity",
				code: "thumbnail-diversity",
				detail: expect.stringContaining("text-fancy-red-plain"),
				url: "/text-assets/text-fancy-red/plain@1/thumbnail.webp",
			}),
		]);
		expect(issues[0]?.detail).toContain("text-fancy-red-outline");
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

	it("accepts marketplace metadata synced from source payloads", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-marketplace-source-${randomUUID()}`
		);
		const marketplacePath = join(publicDir, "text-assets/marketplace.json");
		const sourceText = JSON.stringify(
			createSourcePayload({
				marketplace: {
					editorialRank: 3,
					heatScore: 98,
					remoteTags: ["market:hero", "scene:commerce"],
					searchAliases: ["直播爆款"],
				},
			})
		);
		const entry = {
			...createGeneratedEntry({ sourceText }),
			provenance: {
				pipeline: "designer-pack-v1",
				source: "designer-imported" as const,
			},
		};
		await writeGeneratedEntryFiles({ entry, publicDir, sourceText });
		await mkdir(dirname(marketplacePath), { recursive: true });
		await writeFile(
			marketplacePath,
			JSON.stringify({
				assets: [
					{
						assetId: "text-demo",
						editorialRank: 3,
						heatScore: 98,
						remoteTags: [
							"source:designer-imported",
							"market:hero",
							"scene:commerce",
						],
						searchAliases: ["直播爆款"],
						templateId: "text-demo-template",
					},
				],
				schemaVersion: 1,
			})
		);

		const marketplace = await buildTextMarketplacePublishEntry({
			baseUrl: "https://cdn.example.com/assets/",
			generatedManifest: { "text-demo": entry },
			publicDir,
		});

		expect(marketplace.issues).toEqual([]);
	});

	it("reports marketplace metadata that is stale versus source payloads", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-marketplace-stale-${randomUUID()}`
		);
		const marketplacePath = join(publicDir, "text-assets/marketplace.json");
		const sourceText = JSON.stringify(
			createSourcePayload({
				marketplace: {
					editorialRank: 3,
					heatScore: 98,
					remoteTags: ["market:hero"],
					searchAliases: ["直播爆款"],
				},
			})
		);
		const entry = {
			...createGeneratedEntry({ sourceText }),
			provenance: {
				pipeline: "designer-pack-v1",
				source: "designer-imported" as const,
			},
		};
		await writeGeneratedEntryFiles({ entry, publicDir, sourceText });
		await mkdir(dirname(marketplacePath), { recursive: true });
		await writeFile(
			marketplacePath,
			JSON.stringify({
				assets: [
					{
						assetId: "text-demo",
						editorialRank: 8,
						heatScore: 60,
						remoteTags: [],
						searchAliases: [],
						templateId: "old-template",
					},
				],
				schemaVersion: 1,
			})
		);

		const marketplace = await buildTextMarketplacePublishEntry({
			baseUrl: "https://cdn.example.com/assets/",
			generatedManifest: { "text-demo": entry },
			publicDir,
		});

		expect(marketplace.issues).toEqual([
			expect.objectContaining({
				assetId: "text-demo",
				code: "marketplace-metadata-coverage",
				detail: expect.stringContaining(
					"templateId expected text-demo-template"
				),
				url: "/text-assets/marketplace.json",
			}),
		]);
		expect(marketplace.issues[0]?.detail).toEqual(
			expect.stringContaining("remoteTags missing source:designer-imported")
		);
		expect(marketplace.issues[0]?.detail).toEqual(
			expect.stringContaining("searchAliases missing 直播爆款")
		);
	});

	it("reports marketplace sections that reference missing template or asset ids", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-marketplace-section-${randomUUID()}`
		);
		const marketplacePath = join(publicDir, "text-assets/marketplace.json");
		await mkdir(dirname(marketplacePath), { recursive: true });
		await writeFile(
			marketplacePath,
			JSON.stringify({
				assets: [
					{
						assetId: "text-demo",
						packageId: "text-demo",
						templateId: "text-demo-template",
					},
				],
				schemaVersion: 1,
				sections: [
					{
						assetIds: ["text-demo", "missing-asset"],
						id: "recommended",
						templateIds: ["text-demo-template", "missing-template"],
						title: "推荐",
					},
				],
			})
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
				detail: expect.stringContaining("missing-template"),
				url: "/text-assets/marketplace.json",
			}),
		]);
		expect(marketplace.issues[0]?.detail).toEqual(
			expect.stringContaining("missing-asset")
		);
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
			expect.objectContaining({
				code: "invalid-file-payload",
				detail: expect.stringContaining("package source identity mismatch"),
				url: "/text-assets/demo/plain@1/template.qctext",
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
			expect.objectContaining({
				code: "invalid-file-payload",
				detail: "package source template must be a text element",
				url: "/text-assets/demo/plain@1/template.qctext",
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

	it("reports local package resource manifest mismatches", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-package-resources-${randomUUID()}`
		);
		const packageText = JSON.stringify(
			createPackagePayload({
				resources: [
					{
						...createPackageResources()[0],
						checksumSha256: "wrong-checksum",
					},
					createPackageResources()[1] ?? {},
				],
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
				detail: expect.stringContaining("thumbnail package resource mismatch"),
				url: "/text-assets/demo/plain@1/template.qctext",
			}),
		]);
	});

	it("reports local packages missing companion resources", async () => {
		const publicDir = join(
			tmpdir(),
			`qcut-text-package-missing-resources-${randomUUID()}`
		);
		const packageText = JSON.stringify(
			Object.fromEntries(
				Object.entries(createPackagePayload()).filter(
					([key]) => key !== "resources"
				)
			)
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
				detail: "QCut text package resources must be a non-empty array",
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

	it("verifies remote object identity metadata when requested", async () => {
		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": createGeneratedEntry() },
			publicDir: "/tmp/public",
		});
		const fetchImpl: typeof fetch = async (_input, init) => {
			expect(init?.method).toBe("HEAD");
			return new Response(null, {
				headers: {
					"content-length": String(byteLength({ value: THUMBNAIL_TEXT })),
					"x-amz-meta-qcut-asset-id": "text-demo",
					"x-amz-meta-qcut-cache-key": "text-assets/demo/plain@1",
					"x-amz-meta-qcut-package-id": "text-demo",
					"x-amz-meta-qcut-provenance-pipeline": "qcut-canvas-thumbnail-v1",
					"x-amz-meta-qcut-provenance-source": "generated",
					"x-amz-meta-qcut-role": "thumbnail",
					"x-amz-meta-qcut-version": "1",
					"x-amz-meta-sha256": checksum({ value: THUMBNAIL_TEXT }),
				},
				status: 200,
			});
		};

		const issues = await verifyRemoteFiles({
			fetchImpl,
			manifest: {
				...manifest,
				assets: [
					{
						...manifest.assets[0]!,
						files: [manifest.assets[0]!.files[0]!],
					},
				],
			},
			metadata: true,
		});

		expect(issues).toEqual([]);
	});

	it("reports remote object metadata mismatches", async () => {
		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": createGeneratedEntry() },
			publicDir: "/tmp/public",
		});
		const fetchImpl: typeof fetch = async () =>
			new Response(null, {
				headers: {
					"content-length": String(byteLength({ value: THUMBNAIL_TEXT })),
					"x-amz-meta-qcut-asset-id": "wrong-asset",
				},
				status: 200,
			});

		const issues = await verifyRemoteFiles({
			fetchImpl,
			manifest: {
				...manifest,
				assets: [
					{
						...manifest.assets[0]!,
						files: [manifest.assets[0]!.files[0]!],
					},
				],
			},
			metadata: true,
		});

		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					assetId: "text-demo",
					code: "remote-metadata-mismatch",
					detail: "qcut-asset-id expected text-demo, received wrong-asset",
					url: "/text-assets/demo/plain@1/thumbnail.webp",
				}),
				expect.objectContaining({
					assetId: "text-demo",
					code: "remote-metadata-mismatch",
					detail:
						"qcut-cache-key expected text-assets/demo/plain@1, received (missing)",
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
