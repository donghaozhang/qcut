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

function createGeneratedEntry(): TextAssetGeneratedEntry {
	return {
		assetId: "text-demo",
		cacheKey: "text-assets/demo/plain@1",
		packageId: "text-demo",
		version: 1,
		thumbnail: {
			byteSize: 5,
			checksumSha256: checksum({ value: "thumb" }),
			mimeType: "image/webp",
			url: "/text-assets/demo/plain@1/thumbnail.webp",
		},
		source: {
			byteSize: 6,
			checksumSha256: checksum({ value: "source" }),
			mimeType: "application/json",
			url: "/text-assets/demo/plain@1/template.json",
		},
		qcutPackage: {
			byteSize: 7,
			checksumSha256: checksum({ value: "package" }),
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
			{ content: "thumb", file: entry.thumbnail },
			{ content: "source", file: entry.source },
			{ content: "package", file: entry.qcutPackage },
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
			prefix: "prod",
			publicDir,
			publishManifestPath,
			remoteConcurrency: 2,
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
			prefix: "prod",
			publicDir: "/tmp/public",
			publishManifestPath: "/tmp/publish.json",
			remoteConcurrency: 4,
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
			localIssues: [],
			manifestPath: publishManifestPath,
			remoteIssues: [],
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
		expect(summary.upload.uploadedFiles).toBe(0);
		expect(uploadedKeys).toEqual([]);
	});
});
