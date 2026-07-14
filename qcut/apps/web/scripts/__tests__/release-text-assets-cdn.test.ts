import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
	parseTextAssetReleaseArgs,
	releaseTextAssetsToCdn,
	type TextAssetReleaseOptions,
} from "../release-text-assets-cdn";
import type { TextAssetGeneratedEntry } from "../verify-text-asset-cdn-manifest";

function checksum({ value }: { value: string }): string {
	return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

const THUMBNAIL_TEXT = "RIFF0000WEBP";
const SOURCE_TEXT = JSON.stringify({
	assetId: "text-demo",
	packageId: "text-demo",
	schemaVersion: 1,
	template: {},
	version: 1,
});
const PACKAGE_TEXT = JSON.stringify({
	assetId: "text-demo",
	cacheKey: "text-assets/demo/plain@1",
	files: {
		source: "template.json",
		thumbnail: "thumbnail.webp",
	},
	kind: "qcut-text-template-package",
	packageId: "text-demo",
	schemaVersion: 1,
	source: JSON.parse(SOURCE_TEXT) as Record<string, unknown>,
	version: 1,
});

function createGeneratedEntry(): TextAssetGeneratedEntry {
	return {
		assetId: "text-demo",
		cacheKey: "text-assets/demo/plain@1",
		packageId: "text-demo",
		version: 1,
		thumbnail: {
			byteSize: THUMBNAIL_TEXT.length,
			checksumSha256: checksum({ value: THUMBNAIL_TEXT }),
			mimeType: "image/webp",
			url: "/text-assets/demo/plain@1/thumbnail.webp",
		},
		source: {
			byteSize: SOURCE_TEXT.length,
			checksumSha256: checksum({ value: SOURCE_TEXT }),
			mimeType: "application/json",
			url: "/text-assets/demo/plain@1/template.json",
		},
		qcutPackage: {
			byteSize: PACKAGE_TEXT.length,
			checksumSha256: checksum({ value: PACKAGE_TEXT }),
			mimeType: "application/vnd.qcut.text-template+json",
			url: "/text-assets/demo/plain@1/template.qctext",
		},
	};
}

async function createReleaseFixture(): Promise<{
	generatedManifestPath: string;
	options: TextAssetReleaseOptions;
	publicDir: string;
	publishManifestPath: string;
}> {
	const root = join(tmpdir(), `qcut-text-release-${randomUUID()}`);
	const publicDir = join(root, "public");
	const generatedManifestPath = join(root, "generated.json");
	const publishManifestPath = join(root, "publish.json");
	const entry = createGeneratedEntry();
	await Promise.all(
		[
			{ content: THUMBNAIL_TEXT, file: entry.thumbnail },
			{ content: SOURCE_TEXT, file: entry.source },
			{ content: PACKAGE_TEXT, file: entry.qcutPackage },
		].map(async ({ content, file }) => {
			const path = join(publicDir, file.url.replace(/^\/+/, ""));
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, content);
		})
	);
	const marketplacePath = join(publicDir, "text-assets/marketplace.json");
	await mkdir(dirname(marketplacePath), { recursive: true });
	await writeFile(
		marketplacePath,
		JSON.stringify({ assets: [], schemaVersion: 1 })
	);
	await mkdir(dirname(generatedManifestPath), { recursive: true });
	await writeFile(
		generatedManifestPath,
		`${JSON.stringify({ [entry.assetId]: entry }, null, "\t")}\n`
	);
	return {
		generatedManifestPath,
		options: {
			baseUrl: "https://cdn.example.com",
			bucket: "qcut-assets",
			cacheControl: "public, max-age=31536000, immutable",
			dryRun: true,
			generatedManifestPath,
			metadataCacheControl: "public, max-age=300",
			minDesignerAssets: 0,
			prefix: "prod",
			publicDir,
			publishManifestPath,
			remoteConcurrency: 2,
			requiredDesignerCategories: [],
			skipRemoteCheck: true,
			uploadConcurrency: 2,
		},
		publicDir,
		publishManifestPath,
	};
}

describe("text asset CDN release script", () => {
	it("parses release options from CLI and env", () => {
		expect(
			parseTextAssetReleaseArgs({
				argv: [
					"--base-url",
					"https://cdn.example.com",
					"--bucket",
					"cli-bucket",
					"--dry-run",
					"--metadata-cache-control",
					"public, max-age=30",
					"--min-designer-assets",
					"7",
					"--require-designer-categories",
					"red,texture",
					"--generated-manifest",
					"/tmp/generated.json",
					"--prefix",
					"prod",
					"--publish-manifest",
					"/tmp/publish.json",
					"--public-dir",
					"/tmp/public",
					"--remote-concurrency",
					"4",
					"--upload-concurrency",
					"3",
				],
				env: { QCUT_TEXT_ASSET_BUCKET: "env-bucket" },
			})
		).toMatchObject({
			baseUrl: "https://cdn.example.com",
			bucket: "cli-bucket",
			dryRun: true,
			generatedManifestPath: "/tmp/generated.json",
			metadataCacheControl: "public, max-age=30",
			minDesignerAssets: 7,
			prefix: "prod",
			publicDir: "/tmp/public",
			publishManifestPath: "/tmp/publish.json",
			remoteConcurrency: 4,
			requiredDesignerCategories: ["red", "texture"],
			skipRemoteCheck: true,
			uploadConcurrency: 3,
		});
	});

	it("writes a publish manifest and summarizes dry-run releases", async () => {
		const { options, publishManifestPath } = await createReleaseFixture();
		const uploadedKeys: string[] = [];

		const summary = await releaseTextAssetsToCdn({
			options,
			uploadFile: async ({ item }) => {
				uploadedKeys.push(item.key);
			},
		});

		expect(summary).toMatchObject({
			dryRun: true,
			localIssueSummary: {
				byCode: {},
				count: 0,
				truncated: 0,
			},
			localIssues: [],
			manifestPath: publishManifestPath,
			minDesignerAssets: 0,
			provenance: {
				designerImported: 0,
				generated: 0,
				missingProvenance: 1,
				pipelines: { missing: 1 },
				total: 1,
			},
			remoteIssueSummary: {
				byCode: {},
				count: 0,
				truncated: 0,
			},
			remoteIssues: [],
			requiredDesignerCategories: [],
			totalAssets: 2,
			totalBytes: expect.any(Number),
			totalFiles: 4,
			upload: {
				bucket: "qcut-assets",
				dryRun: true,
				uploadedFiles: 0,
			},
		});
		expect(uploadedKeys).toEqual([]);
	});

	it("returns local issues without uploading", async () => {
		const { options } = await createReleaseFixture();
		const brokenOptions = {
			...options,
			publicDir: join(tmpdir(), `missing-public-${randomUUID()}`),
		};
		const uploadedKeys: string[] = [];

		const summary = await releaseTextAssetsToCdn({
			options: brokenOptions,
			uploadFile: async ({ item }) => {
				uploadedKeys.push(item.key);
			},
		});

		expect(summary.localIssues).toHaveLength(4);
		expect(summary.localIssueSummary.count).toBe(4);
		expect(summary.localIssueSummary.byCode["missing-file"]).toBe(4);
		expect(summary.upload.uploadedFiles).toBe(0);
		expect(uploadedKeys).toEqual([]);
	});

	it("blocks release when required designer categories are missing", async () => {
		const { options } = await createReleaseFixture();
		const summary = await releaseTextAssetsToCdn({
			options: {
				...options,
				requiredDesignerCategories: ["red"],
			},
			uploadFile: async () => {
				throw new Error("Should not upload when designer coverage fails");
			},
		});

		expect(summary.localIssues).toEqual([
			expect.objectContaining({
				code: "designer-category-coverage",
				detail: "Missing designer-imported text assets for categories: red",
			}),
		]);
		expect(summary.requiredDesignerCategories).toEqual(["red"]);
		expect(summary.upload.uploadedFiles).toBe(0);
	});

	it("summarizes remote issues after release uploads", async () => {
		const { options } = await createReleaseFixture();
		const uploadedKeys: string[] = [];

		const summary = await releaseTextAssetsToCdn({
			options: {
				...options,
				dryRun: false,
				skipRemoteCheck: false,
			},
			uploadFile: async ({ item }) => {
				uploadedKeys.push(item.key);
			},
			verifyRemote: async () => [
				{
					assetId: "text-demo",
					code: "remote-unavailable",
					detail: "HEAD failed",
				},
			],
		});

		expect(summary.remoteIssues).toEqual([
			{
				assetId: "text-demo",
				code: "remote-unavailable",
				detail: "HEAD failed",
			},
		]);
		expect(summary.remoteIssueSummary).toEqual({
			byCode: {
				"remote-unavailable": 1,
			},
			count: 1,
			truncated: 0,
		});
		expect(summary.upload.uploadedFiles).toBe(4);
		expect(uploadedKeys).toHaveLength(4);
	});

	it("blocks release uploads when designer asset coverage is below threshold", async () => {
		const { options } = await createReleaseFixture();
		const uploadedKeys: string[] = [];

		const summary = await releaseTextAssetsToCdn({
			options: {
				...options,
				minDesignerAssets: 1,
			},
			uploadFile: async ({ item }) => {
				uploadedKeys.push(item.key);
			},
		});

		expect(summary.localIssues).toEqual([
			{
				assetId: "text-designer-assets",
				code: "designer-import-threshold",
				detail: "Expected at least 1 designer-imported text assets, received 0",
			},
		]);
		expect(summary.provenance).toMatchObject({
			designerImported: 0,
			total: 1,
		});
		expect(summary.upload.uploadedFiles).toBe(0);
		expect(uploadedKeys).toEqual([]);
	});

	it("runs remote verification after non-dry release uploads", async () => {
		const { options } = await createReleaseFixture();
		const uploadedKeys: string[] = [];

		const summary = await releaseTextAssetsToCdn({
			options: {
				...options,
				dryRun: false,
				skipRemoteCheck: false,
			},
			uploadFile: async ({ item }) => {
				uploadedKeys.push(item.key);
			},
			verifyRemote: async ({ concurrency }) => [
				{
					assetId: "text-demo",
					code: "remote-unavailable",
					detail: `checked with concurrency ${concurrency}`,
					url: "/text-assets/demo/plain@1/thumbnail.webp",
				},
			],
		});

		expect(uploadedKeys).toHaveLength(4);
		expect(summary.remoteIssueSummary).toEqual({
			byCode: { "remote-unavailable": 1 },
			count: 1,
			truncated: 0,
		});
		expect(summary.remoteIssues).toEqual([
			{
				assetId: "text-demo",
				code: "remote-unavailable",
				detail: "checked with concurrency 2",
				url: "/text-assets/demo/plain@1/thumbnail.webp",
			},
		]);
	});
});
