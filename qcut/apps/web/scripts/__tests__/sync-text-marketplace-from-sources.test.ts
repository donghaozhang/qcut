import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	buildTextMarketplaceConfigFromSources,
	parseTextMarketplaceSourceSyncArgs,
	writeTextMarketplaceConfigFromSources,
} from "../sync-text-marketplace-from-sources";
import type { TextAssetGeneratedEntry } from "../verify-text-asset-cdn-manifest";

const PACKAGE_JSON_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	"../../package.json"
);

function createGeneratedEntry({
	assetId,
	packageId,
	sourceUrl,
	source = "generated",
}: {
	assetId: string;
	packageId: string;
	sourceUrl: string;
	source?: "designer-imported" | "generated";
}): TextAssetGeneratedEntry {
	return {
		assetId,
		cacheKey: `/text-assets/${packageId}/plain@1`,
		packageId,
		provenance: {
			pipeline: "test",
			source,
		},
		source: {
			byteSize: 2,
			checksumSha256: "source-sha",
			mimeType: "application/json",
			url: sourceUrl,
		},
		thumbnail: {
			byteSize: 2,
			checksumSha256: "thumbnail-sha",
			mimeType: "image/webp",
			url: `/text-assets/${packageId}/plain@1/thumbnail.webp`,
		},
		version: 1,
	};
}

async function writeSourcePayload({
	marketplace,
	publicDir,
	sourceUrl,
	templateId,
}: {
	marketplace?: Record<string, unknown>;
	publicDir: string;
	sourceUrl: string;
	templateId: string;
}) {
	const sourcePath = join(publicDir, sourceUrl.replace(/^\/+/, ""));
	await mkdir(dirname(sourcePath), { recursive: true });
	await writeFile(
		sourcePath,
		JSON.stringify({
			definition: {
				id: templateId,
			},
			marketplace,
		}),
		"utf8"
	);
}

describe("text marketplace source sync", () => {
	it("is exposed through the package scripts", () => {
		const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
			scripts: Record<string, string>;
		};

		expect(packageJson.scripts["assets:text:sync-marketplace"]).toBe(
			"bun scripts/sync-text-marketplace-from-sources.ts"
		);
	});

	it("parses source sync options", () => {
		expect(
			parseTextMarketplaceSourceSyncArgs({
				argv: [
					"--generated-manifest",
					"/tmp/generated.json",
					"--out",
					"/tmp/marketplace.json",
					"--public-dir",
					"/tmp/public",
				],
			})
		).toMatchObject({
			generatedManifestPath: "/tmp/generated.json",
			outPath: "/tmp/marketplace.json",
			publicDir: "/tmp/public",
		});
		expect(() =>
			parseTextMarketplaceSourceSyncArgs({ argv: ["--unknown"] })
		).toThrow(/Unknown argument/);
	});

	it("builds marketplace config from generated source payloads", async () => {
		const publicDir = join(tmpdir(), `qcut-marketplace-sync-${randomUUID()}`);
		const generatedManifest = {
			popular: createGeneratedEntry({
				assetId: "text-popular",
				packageId: "text-fancy-red",
				sourceUrl: "/text-assets/text-fancy-red/plain@1/template.json",
			}),
			designer: createGeneratedEntry({
				assetId: "text-designer",
				packageId: "text-templates-headline-template",
				source: "designer-imported",
				sourceUrl:
					"/text-assets/text-templates-headline-template/plain@1/template.json",
			}),
			cover: createGeneratedEntry({
				assetId: "text-cover",
				packageId: "text-smart-text-cover",
				sourceUrl: "/text-assets/text-smart-text-cover/plain@1/template.json",
			}),
		};
		await writeSourcePayload({
			marketplace: {
				editorialRank: 2,
				heatScore: 96,
				remoteTags: ["market:recommended", "scene:commerce"],
				searchAliases: ["直播", "价格"],
			},
			publicDir,
			sourceUrl: generatedManifest.popular.source.url,
			templateId: "popular-template",
		});
		await writeSourcePayload({
			marketplace: {
				editorialRank: 1,
				remoteTags: ["market:hero"],
				searchAliases: ["封面"],
			},
			publicDir,
			sourceUrl: generatedManifest.designer.source.url,
			templateId: "designer-template",
		});
		await writeSourcePayload({
			marketplace: {
				heatScore: 88,
				remoteTags: ["market:hero"],
			},
			publicDir,
			sourceUrl: generatedManifest.cover.source.url,
			templateId: "cover-template",
		});

		const config = await buildTextMarketplaceConfigFromSources({
			generatedManifest,
			publicDir,
		});

		expect(config.assets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					assetId: "text-popular",
					remoteTags: expect.arrayContaining([
						"category:red",
						"market:recommended",
						"scene:commerce",
					]),
					searchAliases: expect.arrayContaining(["直播", "价格"]),
					templateId: "popular-template",
				}),
				expect.objectContaining({
					assetId: "text-designer",
					remoteTags: expect.arrayContaining([
						"category:headline-template",
						"source:designer-imported",
					]),
					templateId: "designer-template",
				}),
			])
		);
		expect(config.sections).toEqual([
			expect.objectContaining({
				id: "recommended",
				templateIds: ["designer-template", "popular-template"],
			}),
			expect.objectContaining({
				id: "designer-imported",
				templateIds: ["designer-template"],
			}),
			expect.objectContaining({
				id: "commerce",
				templateIds: ["popular-template"],
			}),
			expect.objectContaining({
				id: "cover",
				templateIds: ["designer-template", "cover-template"],
			}),
		]);
	});

	it("writes synced marketplace config to disk", async () => {
		const rootDir = join(tmpdir(), `qcut-marketplace-write-${randomUUID()}`);
		const publicDir = join(rootDir, "public");
		const generatedManifestPath = join(rootDir, "generated.json");
		const outPath = join(rootDir, "marketplace.json");
		const generatedManifest = {
			basic: createGeneratedEntry({
				assetId: "text-basic",
				packageId: "text-smart-text-basic",
				sourceUrl: "/text-assets/text-smart-text-basic/plain@1/template.json",
			}),
		};
		await mkdir(rootDir, { recursive: true });
		await writeFile(generatedManifestPath, JSON.stringify(generatedManifest));
		await writeSourcePayload({
			publicDir,
			sourceUrl: generatedManifest.basic.source.url,
			templateId: "basic-template",
		});

		await expect(
			writeTextMarketplaceConfigFromSources({
				generatedManifestPath,
				outPath,
				publicDir,
			})
		).resolves.toMatchObject({
			assets: [expect.objectContaining({ templateId: "basic-template" })],
		});
		await expect(readFile(outPath, "utf8")).resolves.toContain(
			'"templateId": "basic-template"'
		);
	});
});
