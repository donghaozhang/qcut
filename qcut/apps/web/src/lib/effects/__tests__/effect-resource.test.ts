import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	assetManifestVersionKey,
	buildAssetCatalog,
	type AssetManifestEntry,
	type AssetManifestPack,
} from "@qcut/editor-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import type { EffectAssetMetadata } from "../effect-catalog-types";
import {
	downloadEffectResources,
	getEffectResourceState,
	resolveEffectResourceGraph,
} from "../effect-resource";

const LICENSE = {
	name: "QCut built-in",
	commercialUse: "allowed",
	attributionRequired: false,
} as const;

function remoteSticker({ version = 1 }: { version?: number } = {}) {
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: "remote:sparkle",
		kind: "sticker",
		version,
		name: "Sparkle",
		category: "motion",
		tags: ["sparkle"],
		delivery: "remote",
		files: [
			{
				role: "source",
				url: `https://assets.example.test/sparkle-v${version}.svg`,
				mimeType: "image/svg+xml",
			},
		],
		license: LICENSE,
	} as const satisfies AssetManifestEntry;
}

function effectAsset({ dependencyId = "remote:sparkle", version = 2 } = {}) {
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: "sparkle-effect",
		kind: "effect",
		version,
		name: "Sparkle Effect",
		category: "light",
		tags: ["light"],
		delivery: "generated",
		files: [],
		license: LICENSE,
		metadata: {
			effectPresetId: "sparkle-effect",
			family: "visual",
			publication: "published",
			renderKind: "overlay",
			renderProgramVersion: 1,
			dependencies: [{ kind: "sticker", id: dependencyId, roles: ["source"] }],
		} satisfies EffectAssetMetadata,
	} as const satisfies AssetManifestEntry<EffectAssetMetadata>;
}

function catalog({ assets }: { assets: readonly AssetManifestEntry[] }) {
	const manifest: AssetManifestPack = {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: "effect-resource-test",
		version: 1,
		assets,
	};
	return buildAssetCatalog({ manifests: [manifest] });
}

describe("effect resources", () => {
	beforeEach(() => {
		useAssetLibraryStore.getState().resetLibrary();
	});

	it("resolves shared asset dependencies without copying their files", () => {
		const effect = effectAsset();
		const sticker = remoteSticker();
		const graph = resolveEffectResourceGraph({
			asset: effect,
			catalog: catalog({ assets: [effect, sticker] }),
		});

		expect(graph.missing).toEqual([]);
		expect(graph.dependencies).toEqual([
			{
				asset: sticker,
				reference: {
					kind: "sticker",
					id: "remote:sparkle",
					roles: ["source"],
				},
			},
		]);
		expect(effect.files).toEqual([]);
	});

	it("distinguishes download, offline, missing, and version update states", () => {
		const effect = effectAsset();
		const sticker = remoteSticker({ version: 2 });
		const resourceCatalog = catalog({ assets: [effect, sticker] });

		expect(
			getEffectResourceState({
				asset: effect,
				catalog: resourceCatalog,
				online: true,
				runtimeByAssetKey: {},
			})
		).toMatchObject({ available: false, status: "download" });
		expect(
			getEffectResourceState({
				asset: effect,
				catalog: resourceCatalog,
				online: false,
				runtimeByAssetKey: {},
			})
		).toMatchObject({ available: false, status: "offline" });

		const priorStickerKey = assetManifestVersionKey({
			kind: "sticker",
			id: sticker.id,
			version: 1,
		});
		expect(
			getEffectResourceState({
				asset: effect,
				catalog: resourceCatalog,
				online: true,
				runtimeByAssetKey: {
					[priorStickerKey]: {
						assetKey: priorStickerKey,
						favorite: false,
						downloadStatus: "downloaded",
						cacheStatus: "cached",
						progress: 1,
					},
				},
			})
		).toMatchObject({
			available: false,
			status: "update",
			updateAvailable: true,
		});

		const missingEffect = effectAsset({ dependencyId: "missing:asset" });
		expect(
			getEffectResourceState({
				asset: missingEffect,
				catalog: catalog({ assets: [missingEffect] }),
				online: true,
				runtimeByAssetKey: {},
			})
		).toMatchObject({ available: false, status: "failed" });
	});

	it("downloads dependencies through the shared cache and records both states", async () => {
		const effect = effectAsset();
		const sticker = remoteSticker();
		const ensureResources = vi.fn(
			async ({
				asset,
				onProgress,
			}: {
				asset: AssetManifestEntry;
				onProgress?: ({ progress }: { progress: number }) => void;
			}) => {
				onProgress?.({ progress: 0.5 });
				onProgress?.({ progress: 1 });
				return [
					{
						blob: new Blob(["sparkle"], { type: "image/svg+xml" }),
						byteSize: 7,
						cacheKey: `${asset.kind}:${asset.id}@${asset.version}:source:0`,
						checksumSha256: "a".repeat(64),
						fromCache: false,
						mimeType: "image/svg+xml",
						role: "source" as const,
						sourceUrl: asset.files[0]?.url ?? "",
						url: asset.files[0]?.url ?? "",
					},
				];
			}
		);

		await downloadEffectResources({
			asset: effect,
			catalog: catalog({ assets: [effect, sticker] }),
			ensureResources,
		});

		expect(ensureResources).toHaveBeenCalledTimes(1);
		expect(ensureResources).toHaveBeenCalledWith(
			expect.objectContaining({
				asset: sticker,
				roles: ["source"],
				cacheBundledResources: true,
			})
		);
		const state = useAssetLibraryStore.getState();
		expect(state.getRuntimeState({ asset: sticker })).toMatchObject({
			downloadStatus: "downloaded",
			cacheStatus: "cached",
			cachedBytes: 7,
			cachedFileCount: 1,
		});
		expect(state.getRuntimeState({ asset: effect })).toMatchObject({
			downloadStatus: "downloaded",
			cacheStatus: "cached",
			cachedBytes: 7,
			progress: 1,
		});
	});

	it("marks dependency and effect state failed when shared caching fails", async () => {
		const effect = effectAsset();
		const sticker = remoteSticker();
		const ensureResources = vi.fn(async () => {
			throw new Error("checksum mismatch");
		});

		await expect(
			downloadEffectResources({
				asset: effect,
				catalog: catalog({ assets: [effect, sticker] }),
				ensureResources,
			})
		).rejects.toThrow("checksum mismatch");

		const state = useAssetLibraryStore.getState();
		expect(state.getRuntimeState({ asset: sticker })).toMatchObject({
			downloadStatus: "failed",
			cacheStatus: "failed",
			error: "checksum mismatch",
		});
		expect(state.getRuntimeState({ asset: effect })).toMatchObject({
			downloadStatus: "failed",
			cacheStatus: "failed",
			error: "checksum mismatch",
		});
	});
});
