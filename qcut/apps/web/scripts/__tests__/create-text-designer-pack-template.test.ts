import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	buildTextDesignerPackTemplate,
	parseTextDesignerPackTemplateArgs,
	selectTextDesignerPackAssetIds,
	writeTextDesignerPackTemplate,
} from "../create-text-designer-pack-template";
import type { TextAssetGeneratedEntry } from "../verify-text-asset-cdn-manifest";

function createGeneratedEntry({
	assetId = "text-demo",
	packageId = assetId,
}: {
	assetId?: string;
	packageId?: string;
} = {}): TextAssetGeneratedEntry {
	return {
		assetId,
		cacheKey: `text-assets/${assetId}/plain@1`,
		packageId,
		version: 1,
		thumbnail: {
			byteSize: 5,
			checksumSha256: "thumb-sha",
			mimeType: "image/webp",
			url: `/text-assets/${assetId}/plain@1/thumbnail.webp`,
		},
		source: {
			byteSize: 7,
			checksumSha256: "source-sha",
			mimeType: "application/json",
			url: `/text-assets/${assetId}/plain@1/template.json`,
		},
		qcutPackage: {
			byteSize: 9,
			checksumSha256: "package-sha",
			mimeType: "application/vnd.qcut.text-template+json",
			url: `/text-assets/${assetId}/plain@1/template.qctext`,
		},
	};
}

describe("text designer pack template script", () => {
	it("parses options and deduplicates asset ids", () => {
		expect(
			parseTextDesignerPackTemplateArgs({
				argv: [
					"--all",
					"--include-current-files",
					"--asset-id",
					"text-demo",
					"--asset-id",
					"text-demo",
					"--package-id",
					"text-basic",
					"--category",
					"red",
					"--per-category-limit",
					"5",
					"--only-generated",
					"--limit",
					"25",
					"--generated-manifest",
					"/tmp/generated.json",
					"--out-dir",
					"/tmp/designer-template",
					"--public-dir",
					"/tmp/public",
				],
			})
		).toMatchObject({
			assetIds: ["text-demo"],
			categoryIds: ["red"],
			generatedManifestPath: "/tmp/generated.json",
			includeCurrentFiles: true,
			includeAll: true,
			limit: 25,
			outDir: "/tmp/designer-template",
			packageIds: ["text-basic"],
			perCategoryLimit: 5,
			provenance: "generated",
			publicDir: "/tmp/public",
		});
	});

	it("requires an explicit asset selector", () => {
		expect(() =>
			parseTextDesignerPackTemplateArgs({
				argv: ["--only-generated"],
			})
		).toThrow("Pass --asset-id, --package-id, --category, or --all");
	});

	it("selects asset ids by package, provenance, and limit", () => {
		const generatedManifest = {
			"text-alpha": createGeneratedEntry({ assetId: "text-alpha" }),
			"text-beta": {
				...createGeneratedEntry({ assetId: "text-beta" }),
				packageId: "text-alpha",
				provenance: {
					pipeline: "designer-pack-v1",
					source: "designer-imported" as const,
				},
			},
			"text-gamma": createGeneratedEntry({ assetId: "text-gamma" }),
		};

		expect(
			selectTextDesignerPackAssetIds({
				assetIds: [],
				categoryIds: [],
				generatedManifest,
				includeAll: false,
				limit: 1,
				packageIds: ["text-alpha"],
				perCategoryLimit: 5,
				provenance: "generated",
			})
		).toEqual(["text-alpha"]);
	});

	it("selects asset ids by category with a per-category limit", () => {
		const generatedManifest = {
			"text-red-1": createGeneratedEntry({
				assetId: "text-red-1",
				packageId: "text-fancy-red",
			}),
			"text-red-2": createGeneratedEntry({
				assetId: "text-red-2",
				packageId: "text-fancy-red",
			}),
			"text-red-3": createGeneratedEntry({
				assetId: "text-red-3",
				packageId: "text-fancy-red",
			}),
			"text-texture-1": createGeneratedEntry({
				assetId: "text-texture-1",
				packageId: "text-fancy-texture",
			}),
			"text-blue-1": createGeneratedEntry({
				assetId: "text-blue-1",
				packageId: "text-fancy-blue",
			}),
		};

		expect(
			selectTextDesignerPackAssetIds({
				assetIds: [],
				categoryIds: ["red", "texture"],
				generatedManifest,
				includeAll: false,
				packageIds: [],
				perCategoryLimit: 2,
				provenance: "generated",
			})
		).toEqual(["text-red-1", "text-red-2", "text-texture-1"]);
	});

	it("builds designer pack manifests and file contracts", () => {
		const template = buildTextDesignerPackTemplate({
			assetIds: ["text-demo"],
			generatedManifest: { "text-demo": createGeneratedEntry() },
		});

		expect(template.manifest).toEqual({
			assets: [
				{
					assetId: "text-demo",
					qcutPackage: "assets/text-demo/template.qctext",
					source: "assets/text-demo/template.json",
					thumbnail: "assets/text-demo/thumbnail.webp",
				},
			],
			schemaVersion: 1,
		});
		expect(template.contracts[0]).toMatchObject({
			assetId: "text-demo",
			cacheKey: "text-assets/text-demo/plain@1",
			category: undefined,
			files: {
				qcutPackage: {
					currentChecksumSha256: "package-sha",
					designerPath: "assets/text-demo/template.qctext",
				},
				source: {
					currentChecksumSha256: "source-sha",
					designerPath: "assets/text-demo/template.json",
				},
				thumbnail: {
					currentChecksumSha256: "thumb-sha",
					designerPath: "assets/text-demo/thumbnail.webp",
				},
			},
		});
	});

	it("rejects unknown assets", () => {
		expect(() =>
			buildTextDesignerPackTemplate({
				assetIds: ["missing"],
				generatedManifest: { "text-demo": createGeneratedEntry() },
			})
		).toThrow("Unknown text asset id: missing");
	});

	it("writes a designer pack template folder", async () => {
		const outDir = join(tmpdir(), `qcut-designer-template-${randomUUID()}`);
		await mkdir(outDir, { recursive: true });
		const template = buildTextDesignerPackTemplate({
			assetIds: ["text-red-demo"],
			generatedManifest: {
				"text-red-demo": createGeneratedEntry({
					assetId: "text-red-demo",
					packageId: "text-fancy-red",
				}),
			},
		});

		await writeTextDesignerPackTemplate({ outDir, template });

		await expect(
			readFile(join(outDir, "manifest.json"), "utf8")
		).resolves.toContain("assets/text-red-demo/template.qctext");
		await expect(
			readFile(join(outDir, "assets/text-red-demo/asset-contract.json"), "utf8")
		).resolves.toContain('"category": "red"');
		const readme = await readFile(join(outDir, "README.md"), "utf8");
		expect(readme).toContain("assets:text:import-designer");
		expect(readme).toContain("assets:text:import-designer-ready");
		expect(readme).toContain("assets:text:verify-designer-ready");
		expect(readme).toContain("assets:text:release-stage");
		expect(readme).toContain("assets:text:verify-archive");
		expect(readme).toContain("dist/text-designer-import-plan.json");
		expect(readme).toContain("Must be a non-empty WebP payload");
		expect(readme).toContain('kind: "qcut-text-template-package"');
		expect(readme).toContain("--include-current-files");
		expect(readme).toContain("| red | 1 |");
	});

	it("can include current generated files as editable designer references", async () => {
		const rootDir = join(tmpdir(), `qcut-designer-template-${randomUUID()}`);
		const outDir = join(rootDir, "pack");
		const publicDir = join(rootDir, "public");
		const entry = createGeneratedEntry({
			assetId: "text-red-demo",
			packageId: "text-fancy-red",
		});
		const template = buildTextDesignerPackTemplate({
			assetIds: ["text-red-demo"],
			generatedManifest: {
				"text-red-demo": entry,
			},
		});

		await Promise.all(
			[
				{ content: "RIFF0000WEBP", file: entry.thumbnail },
				{ content: '{"assetId":"text-red-demo"}', file: entry.source },
				{
					content: '{"kind":"qcut-text-template-package"}',
					file: entry.qcutPackage,
				},
			].map(async ({ content, file }) => {
				if (!file) return;
				const path = join(publicDir, file.url.replace(/^\/+/, ""));
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, content);
			})
		);

		await writeTextDesignerPackTemplate({
			includeCurrentFiles: true,
			outDir,
			publicDir,
			template,
		});

		await expect(
			readFile(join(outDir, "assets/text-red-demo/thumbnail.webp"), "utf8")
		).resolves.toBe("RIFF0000WEBP");
		await expect(
			readFile(join(outDir, "assets/text-red-demo/template.json"), "utf8")
		).resolves.toContain("text-red-demo");
		await expect(
			readFile(join(outDir, "assets/text-red-demo/template.qctext"), "utf8")
		).resolves.toContain("qcut-text-template-package");
	});
});
