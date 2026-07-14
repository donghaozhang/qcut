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

const THUMBNAIL_TEXT = "RIFF0000WEBP";
const DEFAULT_ASSET_ID = "text-demo";
const DEFAULT_CACHE_KEY = "text-assets/demo/plain@1";
const DEFAULT_PACKAGE_ID = "text-demo";
const DEFAULT_VERSION = 1;

function createSourcePayload({
	assetId = DEFAULT_ASSET_ID,
	packageId = DEFAULT_PACKAGE_ID,
	version = DEFAULT_VERSION,
}: {
	assetId?: string;
	packageId?: string;
	version?: number;
} = {}): Record<string, unknown> {
	return {
		assetId,
		packageId,
		schemaVersion: 1,
		template: {},
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
	version = DEFAULT_VERSION,
	source = createSourcePayload({ assetId, packageId, version }),
}: {
	assetId?: string;
	cacheKey?: string;
	files?: Record<string, unknown>;
	packageId?: string;
	source?: Record<string, unknown>;
	version?: number;
} = {}): Record<string, unknown> {
	return {
		assetId,
		cacheKey,
		files,
		kind: "qcut-text-template-package",
		packageId,
		schemaVersion: 1,
		source,
		version,
	};
}

const SOURCE_TEXT = JSON.stringify(createSourcePayload());
const PACKAGE_TEXT = JSON.stringify(createPackagePayload());

function createGeneratedEntry({
	packageText = PACKAGE_TEXT,
	sourceText = SOURCE_TEXT,
	thumbnailText = THUMBNAIL_TEXT,
}: {
	packageText?: string;
	sourceText?: string;
	thumbnailText?: string;
} = {}): TextAssetGeneratedEntry {
	return {
		assetId: DEFAULT_ASSET_ID,
		cacheKey: DEFAULT_CACHE_KEY,
		packageId: DEFAULT_PACKAGE_ID,
		version: DEFAULT_VERSION,
		thumbnail: {
			byteSize: thumbnailText.length,
			checksumSha256: checksum({ value: thumbnailText }),
			mimeType: "image/webp",
			url: "/text-assets/demo/plain@1/thumbnail.webp",
		},
		source: {
			byteSize: sourceText.length,
			checksumSha256: checksum({ value: sourceText }),
			mimeType: "application/json",
			url: "/text-assets/demo/plain@1/template.json",
		},
		qcutPackage: {
			byteSize: packageText.length,
			checksumSha256: checksum({ value: packageText }),
			mimeType: "application/vnd.qcut.text-template+json",
			url: "/text-assets/demo/plain@1/template.qctext",
		},
	};
}

async function writeGeneratedEntryFiles({
	entry,
	packageText = PACKAGE_TEXT,
	publicDir,
	sourceText = SOURCE_TEXT,
	thumbnailText = THUMBNAIL_TEXT,
}: {
	entry: TextAssetGeneratedEntry;
	packageText?: string;
	publicDir: string;
	sourceText?: string;
	thumbnailText?: string;
}): Promise<void> {
	await Promise.all(
		[
			{ content: thumbnailText, file: entry.thumbnail },
			{ content: sourceText, file: entry.source },
			{ content: packageText, file: entry.qcutPackage },
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
			THUMBNAIL_TEXT.length + SOURCE_TEXT.length + PACKAGE_TEXT.length
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
