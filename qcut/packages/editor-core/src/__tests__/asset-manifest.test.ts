import { describe, expect, it } from "vitest";
import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	assetManifestIdentity,
	assetManifestVersionKey,
	buildAssetCatalog,
	createInitialAssetRuntimeState,
	queryAssetCatalog,
	resolveAssetManifestEntry,
	validateAssetManifestPack,
	type AssetManifestEntry,
	type AssetManifestPack,
} from "../assets/index.js";

function asset({
	id = "warm-film",
	kind = "filter",
	version = 1,
	name = "Warm Film",
	category = "cinematic",
	tags = ["warm", "film"],
	delivery = "bundled",
	commercialUse = "allowed",
	attributionRequired = false,
	attributionText,
}: {
	id?: string;
	kind?: AssetManifestEntry["kind"];
	version?: number;
	name?: string;
	category?: string;
	tags?: readonly string[];
	delivery?: AssetManifestEntry["delivery"];
	commercialUse?: AssetManifestEntry["license"]["commercialUse"];
	attributionRequired?: boolean;
	attributionText?: string;
} = {}): AssetManifestEntry {
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id,
		kind,
		version,
		name,
		localizedNames: { "zh-CN": "暖调胶片" },
		category,
		tags,
		delivery,
		files: [
			{ role: "thumbnail", url: `/assets/${id}.webp` },
			{ role: "source", url: `/assets/${id}.cube` },
		],
		license: {
			name: "QCut bundled asset license",
			commercialUse,
			attributionRequired,
			attributionText,
		},
	};
}

function manifest({
	id = "qcut-core",
	version = 1,
	assets = [asset()],
}: {
	id?: string;
	version?: number;
	assets?: readonly AssetManifestEntry[];
} = {}): AssetManifestPack {
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id,
		version,
		assets,
	};
}

describe("asset manifest", () => {
	it("creates stable identity and version keys", () => {
		expect(assetManifestIdentity({ kind: "filter", id: "warm-film" })).toBe(
			"filter:warm-film"
		);
		expect(
			assetManifestVersionKey({
				kind: "filter",
				id: "warm-film",
				version: 3,
			})
		).toBe("filter:warm-film@3");
	});

	it("accepts multiple versions and resolves the latest one", () => {
		const catalog = buildAssetCatalog({
			manifests: [
				manifest({
					assets: [
						asset({ version: 1 }),
						asset({ version: 3, name: "Warm Film 3" }),
						asset({ version: 2, name: "Warm Film 2" }),
					],
				}),
			],
		});

		expect(
			resolveAssetManifestEntry({
				catalog,
				kind: "filter",
				id: "warm-film",
			})?.version
		).toBe(3);
		expect(
			resolveAssetManifestEntry({
				catalog,
				kind: "filter",
				id: "warm-film",
				version: 1,
			})?.name
		).toBe("Warm Film");
	});

	it("reports duplicate versions, duplicate tags, files, and missing attribution", () => {
		const invalidAsset = asset({
			tags: ["Warm", "warm"],
			attributionRequired: true,
		});
		const result = validateAssetManifestPack({
			manifest: manifest({
				assets: [
					{
						...invalidAsset,
						files: [invalidAsset.files[0], invalidAsset.files[0]],
					},
					invalidAsset,
				],
			}),
		});

		expect(result.valid).toBe(false);
		expect(result.issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining([
				"duplicate-tag",
				"duplicate-file",
				"missing-attribution",
				"duplicate-asset-version",
			])
		);
	});

	it("rejects the same asset version across separate packs", () => {
		expect(() =>
			buildAssetCatalog({
				manifests: [manifest(), manifest({ id: "partner-pack" })],
			})
		).toThrow("Duplicate asset version across manifests: filter:warm-film@1");
	});

	it("queries latest assets by type, category, tags, license, and localized text", () => {
		const catalog = buildAssetCatalog({
			manifests: [
				manifest({
					assets: [
						asset({ version: 1 }),
						asset({ version: 2, name: "Warm Film 2" }),
						asset({
							id: "licensed-song",
							kind: "music",
							name: "Licensed Song",
							category: "ambient",
							tags: ["calm"],
							delivery: "remote",
							commercialUse: "restricted",
						}),
					],
				}),
			],
		});

		expect(
			queryAssetCatalog({
				catalog,
				query: {
					kinds: ["filter"],
					categories: ["CINEMATIC"],
					tags: ["film"],
					commercialOnly: true,
					search: "暖调",
				},
			}).map((entry) => `${entry.id}@${entry.version}`)
		).toEqual(["warm-film@2"]);
	});

	it("initializes bundled, generated, and remote runtime states", () => {
		expect(createInitialAssetRuntimeState({ asset: asset() })).toMatchObject({
			downloadStatus: "not-required",
			cacheStatus: "cached",
			progress: 1,
		});
		expect(
			createInitialAssetRuntimeState({
				asset: asset({ delivery: "generated" }),
			})
		).toMatchObject({
			downloadStatus: "not-required",
			cacheStatus: "cached",
			progress: 1,
		});
		expect(
			createInitialAssetRuntimeState({
				asset: asset({ delivery: "remote" }),
			})
		).toMatchObject({
			downloadStatus: "not-downloaded",
			cacheStatus: "uncached",
			progress: 0,
		});
	});
});
