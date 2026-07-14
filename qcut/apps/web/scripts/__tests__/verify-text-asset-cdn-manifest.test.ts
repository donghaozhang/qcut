import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
	buildTextAssetPublishManifest,
	buildTextMarketplacePublishEntry,
	parseTextAssetCdnArgs,
	summarizeTextAssetProvenance,
	verifyDesignerAssetCoverage,
	verifyLocalFiles,
	verifyRemoteFiles,
	type TextAssetGeneratedEntry,
} from "../verify-text-asset-cdn-manifest";

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

describe("text asset CDN manifest verifier", () => {
	it("parses CLI options with explicit paths and remote checks", () => {
		expect(
			parseTextAssetCdnArgs({
				argv: [
					"--base-url",
					"https://cdn.example.com/assets/",
					"--check-remote",
					"--manifest",
					"/tmp/generated.json",
					"--min-designer-assets",
					"12",
					"--public-dir",
					"/tmp/public",
					"--remote-concurrency",
					"4",
					"--write",
					"/tmp/publish.json",
				],
			})
		).toMatchObject({
			baseUrl: "https://cdn.example.com/assets/",
			checkRemote: true,
			manifestPath: "/tmp/generated.json",
			minDesignerAssets: 12,
			publicDir: "/tmp/public",
			remoteConcurrency: 4,
			writePath: "/tmp/publish.json",
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

	it("builds publish manifests with CDN URLs and local paths", () => {
		const { issues, manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com/assets/",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": createGeneratedEntry() },
			publicDir: "/tmp/public",
		});

		expect(issues).toEqual([]);
		expect(manifest.totalAssets).toBe(1);
		expect(manifest.totalFiles).toBe(3);
		expect(manifest.totalBytes).toBe(18);
		expect(manifest.assets[0]?.files.map((file) => file.cdnUrl)).toEqual([
			"https://cdn.example.com/assets/text-assets/demo/plain@1/thumbnail.webp",
			"https://cdn.example.com/assets/text-assets/demo/plain@1/template.json",
			"https://cdn.example.com/assets/text-assets/demo/plain@1/template.qctext",
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

	it("verifies local file byte sizes and checksums", async () => {
		const publicDir = join(tmpdir(), `qcut-text-assets-${randomUUID()}`);
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

		const { manifest } = buildTextAssetPublishManifest({
			baseUrl: "https://cdn.example.com",
			generatedAt: "2026-07-15T00:00:00.000Z",
			generatedManifest: { "text-demo": entry },
			publicDir,
		});

		await expect(verifyLocalFiles({ manifest })).resolves.toEqual([]);
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
