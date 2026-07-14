import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	buildTextAssetUploadPlan,
	buildTextAssetUploadPlanReport,
	parseTextAssetUploadArgs,
	uploadTextAssetPlan,
	verifyUploadDesignerAssetCoverage,
	verifyUploadDesignerCategoryCoverage,
	writeTextAssetUploadPlanReport,
	type TextAssetUploadPlanItem,
} from "../upload-text-assets-cdn";
import {
	TEXT_DESIGNER_READY_CATEGORY_IDS,
	TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
	type TextAssetPublishManifest,
} from "../verify-text-asset-cdn-manifest";

const PACKAGE_JSON_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../package.json"
);

function createPublishManifest(): TextAssetPublishManifest {
	return {
		assets: [
			{
				assetId: "text-demo",
				cacheKey: "text-assets/text-fancy-red/plain@1",
				files: [
					{
						byteSize: 3,
						cdnUrl:
							"https://cdn.example.com/text-assets/demo/plain@1/template.json",
						checksumSha256: "source-sha",
						localPath: "/tmp/public/text-assets/demo/plain@1/template.json",
						mimeType: "application/json",
						role: "source",
						url: "/text-assets/demo/plain@1/template.json",
					},
					{
						byteSize: 5,
						cdnUrl:
							"https://cdn.example.com/text-assets/demo/plain@1/thumbnail.webp",
						checksumSha256: "thumb-sha",
						localPath: "/tmp/public/text-assets/demo/plain@1/thumbnail.webp",
						mimeType: "image/webp",
						role: "thumbnail",
						url: "/text-assets/demo/plain@1/thumbnail.webp",
					},
					{
						byteSize: 7,
						cdnUrl:
							"https://cdn.example.com/text-assets/demo/plain@1/template.qctext",
						checksumSha256: "package-sha",
						localPath: "/tmp/public/text-assets/demo/plain@1/template.qctext",
						mimeType: "application/vnd.qcut.text-template+json",
						role: "package",
						url: "/text-assets/demo/plain@1/template.qctext",
					},
				],
				packageId: "text-fancy-red",
				provenance: {
					pipeline: "designer-pack-v1",
					source: "designer-imported",
				},
				version: 1,
			},
			{
				assetId: "text-marketplace-config",
				cacheKey: "text-assets",
				files: [
					{
						byteSize: 4,
						cdnUrl: "https://cdn.example.com/text-assets/marketplace.json",
						checksumSha256: "marketplace-sha",
						localPath: "/tmp/public/text-assets/marketplace.json",
						mimeType: "application/json",
						role: "metadata",
						url: "/text-assets/marketplace.json",
					},
				],
				packageId: "text-marketplace-config",
				version: 1,
			},
		],
		baseUrl: "https://cdn.example.com",
		generatedAt: "2026-07-15T00:00:00.000Z",
		provenance: {
			designerImported: 1,
			generated: 0,
			missingProvenance: 0,
			pipelines: { "designer-pack-v1": 1 },
			total: 1,
		},
		schemaVersion: 1,
		totalAssets: 2,
		totalBytes: 19,
		totalFiles: 4,
	};
}

describe("text asset CDN upload script", () => {
	it("keeps designer-ready upload and release scripts aligned with the verification gate", () => {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
			scripts: Record<string, string>;
		};
		for (const scriptName of [
			"assets:text:create-designer-ready-pack",
			"assets:text:import-designer-ready",
			"assets:text:verify-designer-ready",
			"assets:text:upload-designer-ready",
			"assets:text:release-designer-ready",
		]) {
			expect(packageJson.scripts[scriptName]).toContain("--designer-ready");
			expect(packageJson.scripts[scriptName]).not.toContain(
				"--require-designer-categories"
			);
		}
	});

	it("parses upload options from env and CLI overrides", () => {
		expect(
			parseTextAssetUploadArgs({
				argv: [
					"--bucket",
					"cli-bucket",
					"--cache-control",
					"public, max-age=60",
					"--metadata-cache-control",
					"public, max-age=30",
					"--concurrency",
					"3",
					"--dry-run",
					"--manifest",
					"/tmp/manifest.json",
					"--min-designer-assets",
					"1",
					"--min-designer-assets-per-category",
					"5",
					"--prefix",
					"assets",
					"--require-designer-categories",
					"red, texture",
					"--write-plan",
					"/tmp/upload-plan.json",
				],
				env: {
					QCUT_TEXT_ASSET_BUCKET: "env-bucket",
					QCUT_TEXT_ASSET_CDN_PREFIX: "env-prefix",
				},
			})
		).toMatchObject({
			bucket: "cli-bucket",
			cacheControl: "public, max-age=60",
			concurrency: 3,
			dryRun: true,
			manifestPath: "/tmp/manifest.json",
			metadataCacheControl: "public, max-age=30",
			minDesignerAssets: 1,
			minDesignerAssetsPerCategory: 5,
			prefix: "assets",
			requiredDesignerCategories: ["red", "texture"],
			writePlanPath: "/tmp/upload-plan.json",
		});
	});

	it("expands designer-ready upload coverage from the shared preset", () => {
		expect(
			parseTextAssetUploadArgs({
				argv: ["--bucket", "qcut-assets", "--designer-ready"],
				env: {},
			})
		).toMatchObject({
			minDesignerAssetsPerCategory: TEXT_DESIGNER_READY_MIN_ASSETS_PER_CATEGORY,
			requiredDesignerCategories: [...TEXT_DESIGNER_READY_CATEGORY_IDS],
		});
	});

	it("verifies designer asset coverage from publish manifest provenance", () => {
		expect(
			verifyUploadDesignerAssetCoverage({
				manifest: createPublishManifest(),
				minDesignerAssets: 2,
			})
		).toEqual([
			{
				assetId: "text-designer-assets",
				code: "designer-import-threshold",
				detail: "Expected at least 2 designer-imported text assets, received 1",
			},
		]);
	});

	it("requires regenerated publish manifests before enforcing designer coverage", () => {
		const manifest = createPublishManifest();
		const legacyManifest = { ...manifest, provenance: undefined };

		expect(
			verifyUploadDesignerAssetCoverage({
				manifest: legacyManifest,
				minDesignerAssets: 1,
			})
		).toEqual([
			{
				assetId: "text-designer-assets",
				code: "designer-import-threshold",
				detail:
					"Publish manifest is missing text asset provenance; regenerate it before enforcing designer asset coverage",
			},
		]);
	});

	it("verifies designer category coverage from publish manifest entries", () => {
		expect(
			verifyUploadDesignerCategoryCoverage({
				manifest: createPublishManifest(),
				minDesignerAssetsPerCategory: 2,
				requiredDesignerCategories: ["red", "texture"],
			})
		).toEqual([
			{
				assetId: "text-designer-assets",
				code: "designer-category-coverage",
				detail:
					"Expected at least 2 designer-imported text assets for each category, missing: red (1), texture (0)",
			},
		]);
	});

	it("builds upload keys and cache headers with optional CDN prefixes", () => {
		const items = buildTextAssetUploadPlan({
			bucket: "qcut-assets",
			cacheControl: "public, max-age=31536000, immutable",
			manifest: createPublishManifest(),
			metadataCacheControl: "public, max-age=300",
			prefix: "/prod/",
		});

		expect(items).toEqual([
			expect.objectContaining({
				assetId: "text-demo",
				bucket: "qcut-assets",
				cacheControl: "public, max-age=31536000, immutable",
				cacheKey: "text-assets/text-fancy-red/plain@1",
				contentType: "application/json",
				key: "prod/text-assets/demo/plain@1/template.json",
				packageId: "text-fancy-red",
				provenance: {
					pipeline: "designer-pack-v1",
					source: "designer-imported",
				},
				role: "source",
				sha256: "source-sha",
				size: 3,
				version: 1,
			}),
			expect.objectContaining({
				bucket: "qcut-assets",
				cacheControl: "public, max-age=31536000, immutable",
				contentType: "image/webp",
				key: "prod/text-assets/demo/plain@1/thumbnail.webp",
				role: "thumbnail",
				sha256: "thumb-sha",
				size: 5,
			}),
			expect.objectContaining({
				contentType: "application/vnd.qcut.text-template+json",
				key: "prod/text-assets/demo/plain@1/template.qctext",
				role: "package",
				sha256: "package-sha",
				size: 7,
			}),
			expect.objectContaining({
				assetId: "text-marketplace-config",
				cacheControl: "public, max-age=300",
				cacheKey: "text-assets",
				contentType: "application/json",
				key: "prod/text-assets/marketplace.json",
				packageId: "text-marketplace-config",
				role: "metadata",
				sha256: "marketplace-sha",
				size: 4,
				version: 1,
			}),
		]);
	});

	it("writes a reviewable upload plan report", async () => {
		const items = buildTextAssetUploadPlan({
			bucket: "qcut-assets",
			cacheControl: "public, max-age=31536000, immutable",
			manifest: createPublishManifest(),
			metadataCacheControl: "public, max-age=300",
			prefix: "prod",
		});
		const writePath = join(
			tmpdir(),
			`qcut-text-upload-plan-${randomUUID()}.json`
		);

		await writeTextAssetUploadPlanReport({
			report: buildTextAssetUploadPlanReport({
				generatedAt: "2026-07-15T00:00:00.000Z",
				items,
				prefix: "prod",
			}),
			writePath,
		});

		await expect(readFile(writePath, "utf8").then(JSON.parse)).resolves.toEqual(
			{
				bucket: "qcut-assets",
				generatedAt: "2026-07-15T00:00:00.000Z",
				items: expect.arrayContaining([
					expect.objectContaining({
						assetId: "text-demo",
						cacheKey: "text-assets/text-fancy-red/plain@1",
						cacheControl: "public, max-age=31536000, immutable",
						contentType: "image/webp",
						key: "prod/text-assets/demo/plain@1/thumbnail.webp",
						packageId: "text-fancy-red",
						provenance: {
							pipeline: "designer-pack-v1",
							source: "designer-imported",
						},
						sha256: "thumb-sha",
						version: 1,
					}),
					expect.objectContaining({
						assetId: "text-marketplace-config",
						cacheControl: "public, max-age=300",
						key: "prod/text-assets/marketplace.json",
						packageId: "text-marketplace-config",
						role: "metadata",
					}),
				]),
				prefix: "prod",
				schemaVersion: 1,
				totalBytes: 19,
				totalFiles: 4,
			}
		);
	});

	it("summarizes dry runs without calling upload", async () => {
		const items = buildTextAssetUploadPlan({
			bucket: "qcut-assets",
			cacheControl: "public, max-age=31536000, immutable",
			manifest: createPublishManifest(),
			metadataCacheControl: "public, max-age=300",
			prefix: "",
		});
		const uploaded: TextAssetUploadPlanItem[] = [];

		await expect(
			uploadTextAssetPlan({
				concurrency: 2,
				dryRun: true,
				items,
				uploadFile: async ({ item }) => {
					uploaded.push(item);
				},
			})
		).resolves.toMatchObject({
			bucket: "qcut-assets",
			dryRun: true,
			totalBytes: 19,
			totalFiles: 4,
			uploadedFiles: 0,
		});
		expect(uploaded).toEqual([]);
	});

	it("uploads plan items when not dry-running", async () => {
		const items = buildTextAssetUploadPlan({
			bucket: "qcut-assets",
			cacheControl: "public, max-age=31536000, immutable",
			manifest: createPublishManifest(),
			metadataCacheControl: "public, max-age=300",
			prefix: "",
		});
		const uploadedKeys: string[] = [];

		const summary = await uploadTextAssetPlan({
			concurrency: 1,
			dryRun: false,
			items,
			uploadFile: async ({ item }) => {
				uploadedKeys.push(item.key);
			},
		});

		expect(summary.uploadedFiles).toBe(4);
		expect(uploadedKeys).toEqual([
			"text-assets/demo/plain@1/template.json",
			"text-assets/demo/plain@1/thumbnail.webp",
			"text-assets/demo/plain@1/template.qctext",
			"text-assets/marketplace.json",
		]);
	});
});
