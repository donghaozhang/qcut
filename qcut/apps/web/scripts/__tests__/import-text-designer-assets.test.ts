import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
	applyTextDesignerAssetImportPlan,
	buildTextDesignerAssetImportPlan,
	extractTextDesignerAssetPackArchive,
	parseTextDesignerAssetImportArgs,
	readDesignerAssetPackManifest,
	readOptionalDesignerAssetPackSummary,
	writeTextDesignerAssetImportPlanReport,
	type TextDesignerAssetPackManifest,
	type TextDesignerAssetPackSummary,
} from "../import-text-designer-assets";
import {
	TEXT_DESIGNER_READY_CATEGORY_IDS,
	TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
	type TextAssetGeneratedEntry,
} from "../verify-text-asset-cdn-manifest";

type TestFileContent = Buffer | string;
const execFileAsync = promisify(execFile);

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
	byteLength = 2048,
	height,
	width,
}: {
	byteLength?: number;
	height: number;
	width: number;
}): Buffer {
	const bytes = Buffer.alloc(byteLength);
	bytes.write("RIFF", 0, "ascii");
	bytes.writeUInt32LE(22, 4);
	bytes.write("WEBP", 8, "ascii");
	bytes.write("VP8X", 12, "ascii");
	bytes.writeUInt32LE(10, 16);
	bytes.writeUIntLE(width - 1, 24, 3);
	bytes.writeUIntLE(height - 1, 27, 3);
	return bytes;
}

const DESIGNER_THUMBNAIL_TEXT = createVp8xWebpBytes({
	height: 304,
	width: 320,
});

function createGeneratedEntry({
	assetId = "text-demo",
	cacheKey = "text-assets/demo/plain@1",
	packageId = "text-demo",
}: {
	assetId?: string;
	cacheKey?: string;
	packageId?: string;
} = {}): TextAssetGeneratedEntry {
	return {
		assetId,
		cacheKey,
		packageId,
		version: 1,
		thumbnail: {
			byteSize: 3,
			checksumSha256: checksum({ value: "old" }),
			mimeType: "image/webp",
			url: `/${cacheKey}/thumbnail.webp`,
		},
		source: {
			byteSize: 3,
			checksumSha256: checksum({ value: "old" }),
			mimeType: "application/json",
			url: `/${cacheKey}/template.json`,
		},
		qcutPackage: {
			byteSize: 3,
			checksumSha256: checksum({ value: "old" }),
			mimeType: "application/vnd.qcut.text-template+json",
			url: `/${cacheKey}/template.qctext`,
		},
	};
}

function designerSourceText({
	assetId = "text-demo",
	marketplace,
	packageId = "text-demo",
	template = {
		content: "设计师花字",
		id: "designer-demo",
		name: "Designer demo",
		type: "text",
	},
	templatePack,
}: {
	assetId?: string;
	marketplace?: Record<string, unknown>;
	template?: Record<string, unknown>;
	templatePack?: Record<string, unknown>;
} = {}): string {
	return `${JSON.stringify(
		{
			assetId,
			definition: { id: "designer-demo", name: "Designer demo" },
			marketplace,
			packageId,
			schemaVersion: 1,
			template,
			templatePack,
			version: 1,
		},
		null,
		"\t"
	)}\n`;
}

function designerTemplate({ content, id }: { content: string; id: string }) {
	return {
		content,
		id,
		name: `Designer ${id}`,
		type: "text",
	};
}

function designerPackageText({
	assetId = "text-demo",
	cacheKey = "text-assets/demo/plain@1",
	files = {
		source: "template.json",
		thumbnail: "thumbnail.webp",
	},
	packageId = "text-demo",
	source = designerSourceText({ assetId }),
}: {
	assetId?: string;
	cacheKey?: string;
	files?: {
		source: string;
		thumbnail: string;
	};
	packageId?: string;
	source?: string;
} = {}): string {
	const sourcePayload = JSON.parse(source) as Record<string, unknown>;
	return `${JSON.stringify(
		{
			assetId,
			cacheKey,
			files,
			kind: "qcut-text-template-package",
			packageId,
			schemaVersion: 1,
			source: sourcePayload,
			version: 1,
		},
		null,
		"\t"
	)}\n`;
}

async function createDesignerFixture(): Promise<{
	generatedManifest: Record<string, TextAssetGeneratedEntry>;
	generatedManifestPath: string;
	packDir: string;
	packManifest: TextDesignerAssetPackManifest;
	publicDir: string;
}> {
	const root = join(tmpdir(), `qcut-designer-import-${randomUUID()}`);
	const packDir = join(root, "pack");
	const publicDir = join(root, "public");
	const generatedManifestPath = join(root, "generated.json");
	const generatedManifest = { "text-demo": createGeneratedEntry() };
	const packManifest: TextDesignerAssetPackManifest = {
		assets: [
			{
				assetId: "text-demo",
				qcutPackage: "template.qctext",
				source: "template.json",
				thumbnail: "thumbnail.webp",
			},
		],
		schemaVersion: 1,
	};
	await mkdir(packDir, { recursive: true });
	const sourceText = designerSourceText();
	const packageText = designerPackageText();
	await Promise.all([
		writeFile(join(packDir, "thumbnail.webp"), DESIGNER_THUMBNAIL_TEXT),
		writeFile(join(packDir, "template.json"), sourceText),
		writeFile(join(packDir, "template.qctext"), packageText),
		writeFile(
			join(packDir, "manifest.json"),
			`${JSON.stringify(packManifest, null, "\t")}\n`
		),
		writeFile(
			generatedManifestPath,
			`${JSON.stringify(generatedManifest, null, "\t")}\n`
		),
	]);
	return {
		generatedManifest,
		generatedManifestPath,
		packDir,
		packManifest,
		publicDir,
	};
}

async function archiveDesignerPack({
	archivePath,
	packDir,
}: {
	archivePath: string;
	packDir: string;
}): Promise<void> {
	await execFileAsync("tar", ["-czf", archivePath, "-C", packDir, "."], {
		maxBuffer: 1024 * 1024,
	});
}

async function writeDesignerPackSummary({
	packDir,
	summary,
}: {
	packDir: string;
	summary: TextDesignerAssetPackSummary;
}): Promise<void> {
	await writeFile(
		join(packDir, "pack-summary.json"),
		`${JSON.stringify(summary, null, "\t")}\n`
	);
}

async function writeDesignerAssetPackFiles({
	assetId,
	cacheKey,
	packDir,
	packageId,
	prefix,
	thumbnailBytes = DESIGNER_THUMBNAIL_TEXT,
}: {
	assetId: string;
	cacheKey: string;
	packDir: string;
	packageId: string;
	prefix: string;
	thumbnailBytes?: Buffer;
}) {
	const sourceText = designerSourceText({
		assetId,
		packageId,
		template: designerTemplate({
			content: `设计师花字 ${prefix}`,
			id: `designer-${prefix}`,
		}),
	});
	await Promise.all([
		writeFile(join(packDir, `${prefix}-thumbnail.webp`), thumbnailBytes),
		writeFile(join(packDir, `${prefix}-template.json`), sourceText),
		writeFile(
			join(packDir, `${prefix}-template.qctext`),
			designerPackageText({
				assetId,
				cacheKey,
				packageId,
				source: sourceText,
			})
		),
	]);
}

describe("text designer asset import script", () => {
	it("parses import arguments and defaults manifest path to pack manifest", () => {
		expect(
			parseTextDesignerAssetImportArgs({
				argv: [
					"--allow-unchanged",
					"--dry-run",
					"--generated-manifest",
					"/tmp/generated.json",
					"--min-designer-assets",
					"10",
					"--min-designer-assets-per-category",
					"5",
					"--pack-dir",
					"/tmp/designer-pack",
					"--public-dir",
					"/tmp/public",
					"--require-designer-categories",
					"red, texture",
					"--write-plan",
					"/tmp/import-plan.json",
				],
			})
		).toMatchObject({
			allowUnchanged: true,
			dryRun: true,
			generatedManifestPath: "/tmp/generated.json",
			marketplaceConfigPath: expect.stringContaining(
				"text-assets/marketplace.json"
			),
			minDesignerAssets: 10,
			minDesignerAssetsPerCategory: 5,
			packDir: "/tmp/designer-pack",
			packManifestPath: "/tmp/designer-pack/manifest.json",
			publicDir: "/tmp/public",
			requiredDesignerCategories: ["red", "texture"],
			syncMarketplace: true,
			writePlanPath: "/tmp/import-plan.json",
		});
		expect(
			parseTextDesignerAssetImportArgs({
				argv: ["--pack-archive", "/tmp/designer-pack.tar.gz"],
			})
		).toMatchObject({
			packArchivePath: "/tmp/designer-pack.tar.gz",
			packDir: "",
			packManifestPath: "",
		});
		expect(
			parseTextDesignerAssetImportArgs({
				argv: [
					"--pack-dir",
					"/tmp/designer-pack",
					"--marketplace-config",
					"/tmp/marketplace.json",
				],
			})
		).toMatchObject({
			marketplaceConfigPath: "/tmp/marketplace.json",
			syncMarketplace: true,
		});
		expect(
			parseTextDesignerAssetImportArgs({
				argv: ["--pack-dir", "/tmp/designer-pack", "--skip-marketplace-sync"],
			})
		).toMatchObject({
			marketplaceConfigPath: undefined,
			syncMarketplace: false,
		});
		expect(() =>
			parseTextDesignerAssetImportArgs({
				argv: [
					"--pack-dir",
					"/tmp/designer-pack",
					"--pack-archive",
					"/tmp/designer-pack.tar.gz",
				],
			})
		).toThrow("Pass only one of --pack-dir or --pack-archive");
	});

	it("expands designer-ready import coverage from the shared preset", () => {
		expect(
			parseTextDesignerAssetImportArgs({
				argv: ["--pack-dir", "/tmp/designer-pack", "--designer-ready"],
			})
		).toMatchObject({
			minDesignerAssetsPerCategory: TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
			requiredDesignerCategories: [...TEXT_DESIGNER_READY_CATEGORY_IDS],
		});
	});

	it("reads and validates designer pack manifests", async () => {
		const { packDir } = await createDesignerFixture();

		await expect(
			readDesignerAssetPackManifest({
				manifestPath: join(packDir, "manifest.json"),
			})
		).resolves.toMatchObject({
			assets: [expect.objectContaining({ assetId: "text-demo" })],
			schemaVersion: 1,
		});
	});

	it("extracts archived designer packs for direct import", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();
		const packSummary: TextDesignerAssetPackSummary = {
			assets: 1,
			categoryCounts: {
				unknown: 1,
			},
			expectedDesignerImportedAssets: 1,
			requiredReplacementFiles: 3,
			schemaVersion: 1,
		};
		await writeDesignerPackSummary({ packDir, summary: packSummary });
		const archivePath = join(dirname(packDir), "designer-pack.tar.gz");
		await archiveDesignerPack({ archivePath, packDir });

		const extracted = await extractTextDesignerAssetPackArchive({
			archivePath,
		});
		const extractedManifest = await readDesignerAssetPackManifest({
			manifestPath: extracted.manifestPath,
		});
		const extractedSummary = await readOptionalDesignerAssetPackSummary({
			summaryPath: extracted.summaryPath,
		});

		expect(extracted.fileCount).toBe(5);
		expect(extractedManifest).toEqual(packManifest);
		expect(extractedSummary).toEqual(packSummary);
		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir: extracted.packDir,
				packManifest: extractedManifest,
				packSummary: extractedSummary,
				publicDir,
			})
		).resolves.toMatchObject({
			items: expect.arrayContaining([
				expect.objectContaining({
					assetId: "text-demo",
					role: "thumbnail",
				}),
			]),
		});
	});

	it("rejects designer pack summaries that do not match the import plan", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest,
				packSummary: {
					assets: 2,
					categoryCounts: {
						unknown: 1,
					},
					expectedDesignerImportedAssets: 1,
					requiredReplacementFiles: 3,
					schemaVersion: 1,
				},
				publicDir,
			})
		).rejects.toThrow("Designer asset pack summary mismatch");
		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest,
				packSummary: {
					assets: 1,
					categoryCounts: {
						red: 1,
					},
					expectedDesignerImportedAssets: 1,
					requiredReplacementFiles: 3,
					schemaVersion: 1,
				},
				publicDir,
			})
		).rejects.toThrow("categoryCounts.red expected 1");
	});

	it("builds import plans and updates manifest metadata", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();

		const plan = await buildTextDesignerAssetImportPlan({
			generatedManifest,
			packDir,
			packManifest,
			packSummary: {
				assets: 1,
				categoryCounts: { unknown: 1 },
				expectedDesignerImportedAssets: 1,
				requiredReplacementFiles: 3,
				schemaVersion: 1,
			},
			publicDir,
		});

		expect(plan.items).toHaveLength(3);
		expect(plan.items.map((item) => item.role)).toEqual([
			"thumbnail",
			"source",
			"package",
		]);
		expect(plan.updatedManifest["text-demo"]?.thumbnail).toMatchObject({
			byteSize: byteLength({ value: DESIGNER_THUMBNAIL_TEXT }),
			checksumSha256: checksum({ value: DESIGNER_THUMBNAIL_TEXT }),
		});
		expect(plan.updatedManifest["text-demo"]?.provenance).toEqual({
			source: "designer-imported",
			pipeline: "designer-pack-v1",
		});
	});

	it("rejects designer pack summaries that do not match the import plan", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest,
				packSummary: {
					assets: 1,
					categoryCounts: { red: 1 },
					expectedDesignerImportedAssets: 1,
					requiredReplacementFiles: 2,
					schemaVersion: 1,
				},
				publicDir,
			})
		).rejects.toThrow(
			"Designer asset pack summary mismatch: requiredReplacementFiles expected 2, received 3, categoryCounts.unknown expected 0, received 1, categoryCounts.red expected 1, received 0"
		);
	});

	it("rejects designer packs that do not satisfy ready category coverage", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				minDesignerAssetsPerCategory: 1,
				packDir,
				packManifest,
				publicDir,
				requiredDesignerCategories: ["red"],
			})
		).rejects.toThrow("red (0)");
	});

	it("accepts designer packs that satisfy ready category coverage", async () => {
		const { packDir, packManifest, publicDir } = await createDesignerFixture();
		const generatedManifest = {
			"text-demo": createGeneratedEntry({
				cacheKey: "text-assets/text-fancy-red/plain@1",
				packageId: "text-fancy-red",
			}),
		};
		const sourceText = designerSourceText({ packageId: "text-fancy-red" });
		await Promise.all([
			writeFile(join(packDir, "template.json"), sourceText),
			writeFile(
				join(packDir, "template.qctext"),
				designerPackageText({
					cacheKey: "text-assets/text-fancy-red/plain@1",
					packageId: "text-fancy-red",
					source: sourceText,
				})
			),
		]);

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				minDesignerAssets: 1,
				minDesignerAssetsPerCategory: 1,
				packDir,
				packManifest,
				publicDir,
				requiredDesignerCategories: ["red"],
			})
		).resolves.toMatchObject({
			updatedManifest: {
				"text-demo": {
					provenance: {
						source: "designer-imported",
					},
				},
			},
		});
	});

	it("rejects designer package payloads that target another asset", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();
		await writeFile(
			join(packDir, "template.qctext"),
			designerPackageText({ assetId: "other-text-demo" })
		);

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest,
				publicDir,
			})
		).rejects.toThrow("identity mismatch");
	});

	it("rejects designer packs that reuse the same file for multiple assets", async () => {
		const { packDir, publicDir } = await createDesignerFixture();
		const generatedManifest = {
			"text-demo-a": createGeneratedEntry({
				assetId: "text-demo-a",
				cacheKey: "text-assets/demo-a/plain@1",
				packageId: "text-demo-a",
			}),
			"text-demo-b": createGeneratedEntry({
				assetId: "text-demo-b",
				cacheKey: "text-assets/demo-b/plain@1",
				packageId: "text-demo-b",
			}),
		};
		await writeDesignerAssetPackFiles({
			assetId: "text-demo-a",
			cacheKey: "text-assets/demo-a/plain@1",
			packDir,
			packageId: "text-demo-a",
			prefix: "a",
		});
		await writeDesignerAssetPackFiles({
			assetId: "text-demo-b",
			cacheKey: "text-assets/demo-b/plain@1",
			packDir,
			packageId: "text-demo-b",
			prefix: "b",
		});

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest: {
					assets: [
						{
							assetId: "text-demo-a",
							qcutPackage: "a-template.qctext",
							source: "a-template.json",
							thumbnail: "a-thumbnail.webp",
						},
						{
							assetId: "text-demo-b",
							qcutPackage: "b-template.qctext",
							source: "b-template.json",
							thumbnail: "a-thumbnail.webp",
						},
					],
					schemaVersion: 1,
				},
				publicDir,
			})
		).rejects.toThrow(
			"Designer thumbnail file is reused across assets: text-demo-a, text-demo-b"
		);
	});

	it("rejects designer packs that duplicate file contents across assets", async () => {
		const { packDir, publicDir } = await createDesignerFixture();
		const generatedManifest = {
			"text-demo-a": createGeneratedEntry({
				assetId: "text-demo-a",
				cacheKey: "text-assets/demo-a/plain@1",
				packageId: "text-demo-a",
			}),
			"text-demo-b": createGeneratedEntry({
				assetId: "text-demo-b",
				cacheKey: "text-assets/demo-b/plain@1",
				packageId: "text-demo-b",
			}),
		};
		await writeDesignerAssetPackFiles({
			assetId: "text-demo-a",
			cacheKey: "text-assets/demo-a/plain@1",
			packDir,
			packageId: "text-demo-a",
			prefix: "a",
		});
		await writeDesignerAssetPackFiles({
			assetId: "text-demo-b",
			cacheKey: "text-assets/demo-b/plain@1",
			packDir,
			packageId: "text-demo-b",
			prefix: "b",
			thumbnailBytes: Buffer.from(DESIGNER_THUMBNAIL_TEXT),
		});

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest: {
					assets: [
						{
							assetId: "text-demo-a",
							qcutPackage: "a-template.qctext",
							source: "a-template.json",
							thumbnail: "a-thumbnail.webp",
						},
						{
							assetId: "text-demo-b",
							qcutPackage: "b-template.qctext",
							source: "b-template.json",
							thumbnail: "b-thumbnail.webp",
						},
					],
					schemaVersion: 1,
				},
				publicDir,
			})
		).rejects.toThrow(
			"Designer thumbnail content is duplicated across assets: text-demo-a, text-demo-b"
		);
	});

	it("rejects designer package file references that will not exist after import", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();
		await writeFile(
			join(packDir, "template.qctext"),
			designerPackageText({
				files: {
					source: "designer-source.json",
					thumbnail: "designer-thumbnail.webp",
				},
			})
		);

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest,
				publicDir,
			})
		).rejects.toThrow("file reference mismatch");
	});

	it("rejects designer source files without valid text template payloads", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();
		await writeFile(
			join(packDir, "template.json"),
			designerSourceText({ template: { type: "image" } })
		);

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest,
				publicDir,
			})
		).rejects.toThrow("source template must be a text element");
	});

	it("rejects designer package source files with invalid template pack copy slots", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();
		await writeFile(
			join(packDir, "template.qctext"),
			designerPackageText({
				source: designerSourceText({
					templatePack: {
						category: "headline-template",
						copySlots: [
							{
								defaultContent: "标题",
								elementIndex: 3,
								id: "headline",
								label: "主标题",
							},
						],
						elements: [
							{
								content: "标题",
								id: "pack-title",
								name: "Pack title",
								type: "text",
							},
						],
						id: "pack-designer-demo",
						name: "Designer pack",
					},
				}),
			})
		);

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest,
				publicDir,
			})
		).rejects.toThrow(
			"package source templatePack copy slot 0 elementIndex is out of range"
		);
	});

	it("rejects designer thumbnails without WebP payloads", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();
		await writeFile(join(packDir, "thumbnail.webp"), "not-webp");

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest,
				publicDir,
			})
		).rejects.toThrow("must contain a WebP payload");
	});

	it("rejects designer thumbnails that are too small to be real assets", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();
		await writeFile(
			join(packDir, "thumbnail.webp"),
			createVp8xWebpBytes({ byteLength: 30, height: 304, width: 320 })
		);

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest,
				publicDir,
			})
		).rejects.toThrow(
			"Designer thumbnail is too small for text-demo: expected at least 1024 bytes, received 30"
		);
	});

	it("rejects designer thumbnails with unexpected dimensions", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();
		await writeFile(
			join(packDir, "thumbnail.webp"),
			createVp8xWebpBytes({ height: 200, width: 200 })
		);

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest,
				publicDir,
			})
		).rejects.toThrow(
			"Designer thumbnail dimensions must be 320x304 for text-demo, received 200x200"
		);
	});

	it("rejects unchanged generated files unless explicitly allowed", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();
		const sourceText = designerSourceText();
		const packageText = designerPackageText();
		const unchangedGeneratedManifest = {
			"text-demo": {
				...generatedManifest["text-demo"],
				thumbnail: {
					...generatedManifest["text-demo"]!.thumbnail,
					byteSize: byteLength({ value: DESIGNER_THUMBNAIL_TEXT }),
					checksumSha256: checksum({ value: DESIGNER_THUMBNAIL_TEXT }),
				},
				source: {
					...generatedManifest["text-demo"]!.source,
					byteSize: sourceText.length,
					checksumSha256: checksum({ value: sourceText }),
				},
				qcutPackage: {
					...generatedManifest["text-demo"]!.qcutPackage!,
					byteSize: packageText.length,
					checksumSha256: checksum({ value: packageText }),
				},
			},
		};

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest: unchangedGeneratedManifest,
				packDir,
				packManifest,
				publicDir,
			})
		).rejects.toThrow("files are unchanged");
		await expect(
			buildTextDesignerAssetImportPlan({
				allowUnchanged: true,
				generatedManifest: unchangedGeneratedManifest,
				packDir,
				packManifest,
				publicDir,
			})
		).resolves.toMatchObject({
			items: expect.arrayContaining([
				expect.objectContaining({ assetId: "text-demo" }),
			]),
		});
	});

	it("blocks designer files that escape the pack directory", async () => {
		const { generatedManifest, packDir, publicDir } =
			await createDesignerFixture();
		const packManifest: TextDesignerAssetPackManifest = {
			assets: [
				{
					assetId: "text-demo",
					qcutPackage: "template.qctext",
					source: "../outside.json",
					thumbnail: "thumbnail.webp",
				},
			],
			schemaVersion: 1,
		};

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest,
				publicDir,
			})
		).rejects.toThrow("escapes pack directory");
	});

	it("rejects unknown and duplicate asset ids", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();
		const packEntry = packManifest.assets[0];
		if (!packEntry) throw new Error("missing designer pack fixture");

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest: {},
				packDir,
				packManifest,
				publicDir,
			})
		).rejects.toThrow("Unknown text asset id: text-demo");

		await expect(
			buildTextDesignerAssetImportPlan({
				generatedManifest,
				packDir,
				packManifest: {
					assets: [packEntry, packEntry],
					schemaVersion: 1,
				},
				publicDir,
			})
		).rejects.toThrow("Duplicate designer asset id: text-demo");
	});

	it("applies import plans only when not dry-running", async () => {
		const {
			generatedManifest,
			generatedManifestPath,
			packDir,
			packManifest,
			publicDir,
		} = await createDesignerFixture();
		const marketplaceConfigPath = join(
			dirname(generatedManifestPath),
			"marketplace.json"
		);
		const plan = await buildTextDesignerAssetImportPlan({
			generatedManifest,
			packDir,
			packManifest,
			publicDir,
		});

		await expect(
			applyTextDesignerAssetImportPlan({
				dryRun: true,
				generatedManifestPath,
				marketplaceConfigPath,
				plan,
				publicDir,
			})
		).resolves.toMatchObject({ copiedFiles: 0, dryRun: true, totalFiles: 3 });
		await expect(readFile(marketplaceConfigPath, "utf8")).rejects.toThrow();
		await expect(
			applyTextDesignerAssetImportPlan({
				dryRun: false,
				generatedManifestPath,
				marketplaceConfigPath,
				plan,
				publicDir,
			})
		).resolves.toMatchObject({ copiedFiles: 3, dryRun: false, totalFiles: 3 });

		await expect(
			readFile(join(publicDir, "text-assets/demo/plain@1/thumbnail.webp"))
		).resolves.toEqual(DESIGNER_THUMBNAIL_TEXT);
		const writtenManifest = JSON.parse(
			await readFile(generatedManifestPath, "utf8")
		) as Record<string, TextAssetGeneratedEntry>;
		expect(writtenManifest["text-demo"]?.source.byteSize).toBe(
			Buffer.byteLength(designerSourceText())
		);
		expect(writtenManifest["text-demo"]?.provenance).toEqual({
			source: "designer-imported",
			pipeline: "designer-pack-v1",
		});
		const marketplaceConfig = JSON.parse(
			await readFile(marketplaceConfigPath, "utf8")
		) as { assets: Array<{ remoteTags?: string[]; templateId?: string }> };
		expect(marketplaceConfig.assets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					remoteTags: expect.arrayContaining(["source:designer-imported"]),
					templateId: "designer-demo",
				}),
			])
		);
	});

	it("writes reviewable dry-run import plan reports", async () => {
		const {
			generatedManifest,
			generatedManifestPath,
			packDir,
			packManifest,
			publicDir,
		} = await createDesignerFixture();
		const plan = await buildTextDesignerAssetImportPlan({
			generatedManifest,
			packDir,
			packManifest,
			publicDir,
		});
		const summary = await applyTextDesignerAssetImportPlan({
			dryRun: true,
			generatedManifestPath,
			plan,
		});
		const planPath = join(dirname(packDir), "designer-import-plan.json");

		const report = await writeTextDesignerAssetImportPlanReport({
			path: planPath,
			plan,
			summary,
		});
		const writtenReport = JSON.parse(
			await readFile(planPath, "utf8")
		) as typeof report;

		expect(report).toMatchObject({
			schemaVersion: 1,
			summary: {
				copiedFiles: 0,
				designerImportedAssets: 1,
				dryRun: true,
				totalFiles: 3,
			},
		});
		expect(writtenReport.items.map((item) => item.role)).toEqual([
			"thumbnail",
			"source",
			"package",
		]);
		expect(writtenReport.items[0]).toMatchObject({
			assetId: "text-demo",
			checksumSha256: checksum({ value: DESIGNER_THUMBNAIL_TEXT }),
			targetUrl: "/text-assets/demo/plain@1/thumbnail.webp",
		});
	});
});
