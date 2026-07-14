import { describe, expect, it } from "vitest";
import {
	buildTextAssetUploadPlan,
	parseTextAssetUploadArgs,
	uploadTextAssetPlan,
	type TextAssetUploadPlanItem,
} from "../upload-text-assets-cdn";
import type { TextAssetPublishManifest } from "../verify-text-asset-cdn-manifest";

function createPublishManifest(): TextAssetPublishManifest {
	return {
		assets: [
			{
				assetId: "text-demo",
				cacheKey: "text-assets/demo/plain@1",
				files: [
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
				packageId: "text-demo",
				version: 1,
			},
		],
		baseUrl: "https://cdn.example.com",
		generatedAt: "2026-07-15T00:00:00.000Z",
		schemaVersion: 1,
		totalAssets: 1,
		totalBytes: 12,
		totalFiles: 2,
	};
}

describe("text asset CDN upload script", () => {
	it("parses upload options from env and CLI overrides", () => {
		expect(
			parseTextAssetUploadArgs({
				argv: [
					"--bucket",
					"cli-bucket",
					"--cache-control",
					"public, max-age=60",
					"--concurrency",
					"3",
					"--dry-run",
					"--manifest",
					"/tmp/manifest.json",
					"--prefix",
					"assets",
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
			prefix: "assets",
		});
	});

	it("builds upload keys with optional CDN prefixes", () => {
		const items = buildTextAssetUploadPlan({
			bucket: "qcut-assets",
			cacheControl: "public, max-age=31536000, immutable",
			manifest: createPublishManifest(),
			prefix: "/prod/",
		});

		expect(items).toEqual([
			expect.objectContaining({
				bucket: "qcut-assets",
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
		]);
	});

	it("summarizes dry runs without calling upload", async () => {
		const items = buildTextAssetUploadPlan({
			bucket: "qcut-assets",
			cacheControl: "public, max-age=31536000, immutable",
			manifest: createPublishManifest(),
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
			totalBytes: 12,
			totalFiles: 2,
			uploadedFiles: 0,
		});
		expect(uploaded).toEqual([]);
	});

	it("uploads plan items when not dry-running", async () => {
		const items = buildTextAssetUploadPlan({
			bucket: "qcut-assets",
			cacheControl: "public, max-age=31536000, immutable",
			manifest: createPublishManifest(),
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

		expect(summary.uploadedFiles).toBe(2);
		expect(uploadedKeys).toEqual([
			"text-assets/demo/plain@1/thumbnail.webp",
			"text-assets/demo/plain@1/template.qctext",
		]);
	});
});
