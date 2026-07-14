import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	buildTextDesignerPackTemplate,
	parseTextDesignerPackTemplateArgs,
	writeTextDesignerPackTemplate,
} from "../create-text-designer-pack-template";
import type { TextAssetGeneratedEntry } from "../verify-text-asset-cdn-manifest";

function createGeneratedEntry({
	assetId = "text-demo",
}: {
	assetId?: string;
} = {}): TextAssetGeneratedEntry {
	return {
		assetId,
		cacheKey: `text-assets/${assetId}/plain@1`,
		packageId: assetId,
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
					"--asset-id",
					"text-demo",
					"--asset-id",
					"text-demo",
					"--generated-manifest",
					"/tmp/generated.json",
					"--out-dir",
					"/tmp/designer-template",
				],
			})
		).toMatchObject({
			assetIds: ["text-demo"],
			generatedManifestPath: "/tmp/generated.json",
			outDir: "/tmp/designer-template",
		});
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
			assetIds: ["text-demo"],
			generatedManifest: { "text-demo": createGeneratedEntry() },
		});

		await writeTextDesignerPackTemplate({ outDir, template });

		await expect(
			readFile(join(outDir, "manifest.json"), "utf8")
		).resolves.toContain("assets/text-demo/template.qctext");
		await expect(
			readFile(join(outDir, "assets/text-demo/asset-contract.json"), "utf8")
		).resolves.toContain("package-sha");
		await expect(
			readFile(join(outDir, "README.md"), "utf8")
		).resolves.toContain("assets:text:import-designer");
	});
});
