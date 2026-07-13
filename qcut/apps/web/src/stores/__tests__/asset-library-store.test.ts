import { beforeEach, describe, expect, it } from "vitest";
import {
	ASSET_MANIFEST_SCHEMA_VERSION,
	assetManifestVersionKey,
	type AssetManifestEntry,
} from "@qcut/editor-core";
import {
	LEGACY_FILTER_FAVORITES_STORAGE_KEY,
	LEGACY_SAVED_SOUNDS_STORAGE_KEY,
	normalizeAssetLibraryPersistedState,
	useAssetLibraryStore,
} from "../asset-library-store";

function remoteSticker(): AssetManifestEntry {
	return {
		schemaVersion: ASSET_MANIFEST_SCHEMA_VERSION,
		id: "line-md:heart-filled",
		kind: "sticker",
		version: 2,
		name: "Heart",
		category: "motion",
		tags: ["heart"],
		delivery: "remote",
		files: [{ role: "source", url: "https://example.test/heart.svg" }],
		license: {
			name: "MIT",
			commercialUse: "allowed",
			attributionRequired: true,
			attributionText: "Material Line Icons (MIT)",
		},
	};
}

function createMemoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, String(value)),
		removeItem: (key) => values.delete(key),
		clear: () => values.clear(),
		key: (index) => [...values.keys()][index] ?? null,
		get length() {
			return values.size;
		},
	};
}

describe("asset library store", () => {
	beforeEach(() => {
		Object.defineProperty(window, "localStorage", {
			value: createMemoryStorage(),
			configurable: true,
		});
		useAssetLibraryStore.getState().resetLibrary();
	});

	it("migrates valid legacy filter and sound favorites", () => {
		localStorage.setItem(
			LEGACY_FILTER_FAVORITES_STORAGE_KEY,
			JSON.stringify(["vivid", "warm-film", 4])
		);
		localStorage.setItem(
			LEGACY_SAVED_SOUNDS_STORAGE_KEY,
			JSON.stringify([{ id: 42 }, { id: "84" }, { nope: true }])
		);

		useAssetLibraryStore.getState().importLegacyFavorites();

		expect(useAssetLibraryStore.getState().favorites).toEqual({
			"filter:vivid": true,
			"filter:warm-film": true,
			"sound-effect:42": true,
			"sound-effect:84": true,
		});
	});

	it("toggles stable favorites and keeps the legacy filter bridge current", () => {
		const store = useAssetLibraryStore.getState();
		store.toggleFavorite({ kind: "filter", id: "vivid" });
		expect(store.isFavorite({ kind: "filter", id: "vivid" })).toBe(true);
		expect(
			JSON.parse(
				localStorage.getItem(LEGACY_FILTER_FAVORITES_STORAGE_KEY) ?? "[]"
			)
		).toEqual(["vivid"]);

		store.toggleFavorite({ kind: "filter", id: "vivid" });
		expect(store.isFavorite({ kind: "filter", id: "vivid" })).toBe(false);
		expect(
			JSON.parse(
				localStorage.getItem(LEGACY_FILTER_FAVORITES_STORAGE_KEY) ?? "[]"
			)
		).toEqual([]);
	});

	it("tracks download and cache state per asset version", () => {
		const asset = remoteSticker();
		const store = useAssetLibraryStore.getState();
		expect(store.getRuntimeState({ asset })).toMatchObject({
			downloadStatus: "not-downloaded",
			cacheStatus: "uncached",
			progress: 0,
		});

		store.updateRuntimeState({
			asset,
			patch: {
				downloadStatus: "downloaded",
				cacheStatus: "cached",
				progress: 4,
				cacheKey: "stickers/heart-v2.svg",
			},
		});
		const assetKey = assetManifestVersionKey({
			kind: asset.kind,
			id: asset.id,
			version: asset.version,
		});
		expect(
			useAssetLibraryStore.getState().runtimeByAssetKey[assetKey]
		).toMatchObject({
			downloadStatus: "downloaded",
			cacheStatus: "cached",
			progress: 1,
			cacheKey: "stickers/heart-v2.svg",
		});
	});

	it("drops malformed persisted states and clamps progress", () => {
		expect(
			normalizeAssetLibraryPersistedState({
				value: {
					favorites: { "filter:vivid": true, invalid: "yes" },
					runtimeByAssetKey: {
						"sticker:heart@1": {
							downloadStatus: "downloaded",
							cacheStatus: "cached",
							progress: 3,
						},
						broken: { downloadStatus: "wat" },
					},
				},
			})
		).toEqual({
			favorites: { "filter:vivid": true },
			runtimeByAssetKey: {
				"sticker:heart@1": {
					assetKey: "sticker:heart@1",
					favorite: false,
					downloadStatus: "downloaded",
					cacheStatus: "cached",
					progress: 1,
				},
			},
		});
	});
});
