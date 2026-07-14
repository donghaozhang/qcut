import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
	applyTextDesignerAssetImportPlan,
	buildTextDesignerAssetImportPlan,
	parseTextDesignerAssetImportArgs,
	readDesignerAssetPackManifest,
	type TextDesignerAssetPackManifest,
} from "../import-text-designer-assets";
import type { TextAssetGeneratedEntry } from "../verify-text-asset-cdn-manifest";

function checksum({ value }: { value: string }): string {
	return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

const DESIGNER_THUMBNAIL_TEXT = "RIFF0000WEBP";

function createGeneratedEntry(): TextAssetGeneratedEntry {
	return {
		assetId: "text-demo",
		cacheKey: "text-assets/demo/plain@1",
		packageId: "text-demo",
		version: 1,
		thumbnail: {
			byteSize: 3,
			checksumSha256: checksum({ value: "old" }),
			mimeType: "image/webp",
			url: "/text-assets/demo/plain@1/thumbnail.webp",
		},
		source: {
			byteSize: 3,
			checksumSha256: checksum({ value: "old" }),
			mimeType: "application/json",
			url: "/text-assets/demo/plain@1/template.json",
		},
		qcutPackage: {
			byteSize: 3,
			checksumSha256: checksum({ value: "old" }),
			mimeType: "application/vnd.qcut.text-template+json",
			url: "/text-assets/demo/plain@1/template.qctext",
		},
	};
}

function designerSourceText({
	assetId = "text-demo",
	template = {
		content: "设计师花字",
		id: "designer-demo",
		name: "Designer demo",
		type: "text",
	},
	templatePack,
}: {
	assetId?: string;
	template?: Record<string, unknown>;
	templatePack?: Record<string, unknown>;
} = {}): string {
	return `${JSON.stringify(
		{
			assetId,
			definition: { id: "designer-demo", name: "Designer demo" },
			packageId: "text-demo",
			schemaVersion: 1,
			template,
			templatePack,
			version: 1,
		},
		null,
		"\t"
	)}\n`;
}

function designerPackageText({
	assetId = "text-demo",
	files = {
		source: "template.json",
		thumbnail: "thumbnail.webp",
	},
	source = designerSourceText({ assetId }),
}: {
	assetId?: string;
	files?: {
		source: string;
		thumbnail: string;
	};
	source?: string;
} = {}): string {
	const sourcePayload = JSON.parse(source) as Record<string, unknown>;
	return `${JSON.stringify(
		{
			assetId,
			cacheKey: "text-assets/demo/plain@1",
			files,
			kind: "qcut-text-template-package",
			packageId: "text-demo",
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

describe("text designer asset import script", () => {
	it("parses import arguments and defaults manifest path to pack manifest", () => {
		expect(
			parseTextDesignerAssetImportArgs({
				argv: [
					"--allow-unchanged",
					"--dry-run",
					"--generated-manifest",
					"/tmp/generated.json",
					"--pack-dir",
					"/tmp/designer-pack",
					"--public-dir",
					"/tmp/public",
				],
			})
		).toMatchObject({
			allowUnchanged: true,
			dryRun: true,
			generatedManifestPath: "/tmp/generated.json",
			packDir: "/tmp/designer-pack",
			packManifestPath: "/tmp/designer-pack/manifest.json",
			publicDir: "/tmp/public",
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

	it("builds import plans and updates manifest metadata", async () => {
		const { generatedManifest, packDir, packManifest, publicDir } =
			await createDesignerFixture();

		const plan = await buildTextDesignerAssetImportPlan({
			generatedManifest,
			packDir,
			packManifest,
			publicDir,
		});

		expect(plan.items).toHaveLength(3);
		expect(plan.items.map((item) => item.role)).toEqual([
			"thumbnail",
			"source",
			"package",
		]);
		expect(plan.updatedManifest["text-demo"]?.thumbnail).toMatchObject({
			byteSize: DESIGNER_THUMBNAIL_TEXT.length,
			checksumSha256: checksum({ value: DESIGNER_THUMBNAIL_TEXT }),
		});
		expect(plan.updatedManifest["text-demo"]?.provenance).toEqual({
			source: "designer-imported",
			pipeline: "designer-pack-v1",
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
					byteSize: DESIGNER_THUMBNAIL_TEXT.length,
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
				plan,
			})
		).resolves.toMatchObject({ copiedFiles: 0, dryRun: true, totalFiles: 3 });
		await expect(
			applyTextDesignerAssetImportPlan({
				dryRun: false,
				generatedManifestPath,
				plan,
			})
		).resolves.toMatchObject({ copiedFiles: 3, dryRun: false, totalFiles: 3 });

		await expect(
			readFile(
				join(publicDir, "text-assets/demo/plain@1/thumbnail.webp"),
				"utf8"
			)
		).resolves.toBe(DESIGNER_THUMBNAIL_TEXT);
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
	});
});
