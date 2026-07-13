import {
	assetManifestIdentity,
	assetManifestVersionKey,
	createInitialAssetRuntimeState,
	type AssetCacheStatus,
	type AssetDownloadStatus,
	type AssetKind,
	type AssetManifestEntry,
	type AssetRuntimeState,
} from "@qcut/editor-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const ASSET_LIBRARY_STORAGE_KEY = "qcut-asset-library-v1";
export const LEGACY_FILTER_FAVORITES_STORAGE_KEY = "qcut-filter-favorites";
export const LEGACY_SAVED_SOUNDS_STORAGE_KEY = "qcut-saved-sounds";

const DOWNLOAD_STATUSES = new Set<AssetDownloadStatus>([
	"not-required",
	"not-downloaded",
	"queued",
	"downloading",
	"downloaded",
	"failed",
]);
const CACHE_STATUSES = new Set<AssetCacheStatus>([
	"unavailable",
	"uncached",
	"caching",
	"cached",
	"stale",
	"failed",
]);

type FavoriteIdentities = Record<string, true>;
type RuntimeStates = Record<string, AssetRuntimeState>;

export interface AssetRuntimePatch {
	downloadStatus?: AssetDownloadStatus;
	cacheStatus?: AssetCacheStatus;
	progress?: number;
	cacheKey?: string;
	error?: string;
}

export interface AssetLibraryPersistedState {
	favorites: FavoriteIdentities;
	runtimeByAssetKey: RuntimeStates;
}

interface AssetLibraryStore extends AssetLibraryPersistedState {
	isFavorite: ({ kind, id }: { kind: AssetKind; id: string }) => boolean;
	setFavorite: ({
		kind,
		id,
		favorite,
	}: {
		kind: AssetKind;
		id: string;
		favorite: boolean;
	}) => void;
	toggleFavorite: ({ kind, id }: { kind: AssetKind; id: string }) => void;
	importLegacyFavorites: () => void;
	getRuntimeState: ({
		asset,
	}: {
		asset: AssetManifestEntry;
	}) => AssetRuntimeState;
	updateRuntimeState: ({
		asset,
		patch,
	}: {
		asset: AssetManifestEntry;
		patch: AssetRuntimePatch;
	}) => void;
	clearRuntimeState: ({ asset }: { asset: AssetManifestEntry }) => void;
	resetLibrary: () => void;
}

function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function parseJson({ value }: { value: string | null }): unknown {
	if (!value) return undefined;
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

function readLegacyFavorites(): FavoriteIdentities {
	if (typeof window === "undefined") return {};
	const favorites: FavoriteIdentities = {};
	const filterIds = parseJson({
		value: window.localStorage.getItem(LEGACY_FILTER_FAVORITES_STORAGE_KEY),
	});
	if (Array.isArray(filterIds)) {
		for (const id of filterIds) {
			if (typeof id !== "string" || !id.trim()) continue;
			favorites[assetManifestIdentity({ kind: "filter", id })] = true;
		}
	}

	const savedSounds = parseJson({
		value: window.localStorage.getItem(LEGACY_SAVED_SOUNDS_STORAGE_KEY),
	});
	if (Array.isArray(savedSounds)) {
		for (const sound of savedSounds) {
			const soundRecord = asRecord({ value: sound });
			if (!soundRecord) continue;
			const id = soundRecord.id;
			if (typeof id !== "number" && typeof id !== "string") continue;
			favorites[
				assetManifestIdentity({ kind: "sound-effect", id: String(id) })
			] = true;
		}
	}

	return favorites;
}

function syncLegacyFilterFavorites({
	favorites,
}: {
	favorites: FavoriteIdentities;
}): void {
	if (typeof window === "undefined") return;
	const filterPrefix = "filter:";
	const filterIds = Object.keys(favorites)
		.filter((identity) => identity.startsWith(filterPrefix))
		.map((identity) => identity.slice(filterPrefix.length));
	window.localStorage.setItem(
		LEGACY_FILTER_FAVORITES_STORAGE_KEY,
		JSON.stringify(filterIds)
	);
}

function normalizeFavorites({ value }: { value: unknown }): FavoriteIdentities {
	const record = asRecord({ value });
	if (!record) return {};
	const favorites: FavoriteIdentities = {};
	for (const [identity, favorite] of Object.entries(record)) {
		if (favorite === true && identity.includes(":")) favorites[identity] = true;
	}
	return favorites;
}

function normalizeRuntimeState({
	assetKey,
	value,
}: {
	assetKey: string;
	value: unknown;
}): AssetRuntimeState | undefined {
	const record = asRecord({ value });
	if (!record) return undefined;
	if (
		typeof record.downloadStatus !== "string" ||
		!DOWNLOAD_STATUSES.has(record.downloadStatus as AssetDownloadStatus) ||
		typeof record.cacheStatus !== "string" ||
		!CACHE_STATUSES.has(record.cacheStatus as AssetCacheStatus) ||
		typeof record.progress !== "number" ||
		!Number.isFinite(record.progress)
	) {
		return undefined;
	}
	return {
		assetKey,
		favorite: false,
		downloadStatus: record.downloadStatus as AssetDownloadStatus,
		cacheStatus: record.cacheStatus as AssetCacheStatus,
		progress: Math.max(0, Math.min(1, record.progress)),
		cacheKey: typeof record.cacheKey === "string" ? record.cacheKey : undefined,
		error: typeof record.error === "string" ? record.error : undefined,
	};
}

function normalizeRuntimeStates({ value }: { value: unknown }): RuntimeStates {
	const record = asRecord({ value });
	if (!record) return {};
	const states: RuntimeStates = {};
	for (const [assetKey, runtimeState] of Object.entries(record)) {
		const normalized = normalizeRuntimeState({ assetKey, value: runtimeState });
		if (normalized) states[assetKey] = normalized;
	}
	return states;
}

export function normalizeAssetLibraryPersistedState({
	value,
	legacyFavorites = {},
}: {
	value: unknown;
	legacyFavorites?: FavoriteIdentities;
}): AssetLibraryPersistedState {
	const record = asRecord({ value });
	if (!record) {
		return { favorites: legacyFavorites, runtimeByAssetKey: {} };
	}
	return {
		favorites: {
			...legacyFavorites,
			...normalizeFavorites({ value: record.favorites }),
		},
		runtimeByAssetKey: normalizeRuntimeStates({
			value: record.runtimeByAssetKey,
		}),
	};
}

export const useAssetLibraryStore = create<AssetLibraryStore>()(
	persist(
		(set, get) => ({
			favorites: readLegacyFavorites(),
			runtimeByAssetKey: {},
			isFavorite: ({ kind, id }) =>
				get().favorites[assetManifestIdentity({ kind, id })] === true,
			setFavorite: ({ kind, id, favorite }) => {
				const identity = assetManifestIdentity({ kind, id });
				set(({ favorites }) => {
					const nextFavorites = { ...favorites };
					if (favorite) {
						nextFavorites[identity] = true;
					} else {
						const entries = Object.entries(nextFavorites).filter(
							([candidate]) => candidate !== identity
						);
						const filteredFavorites = Object.fromEntries(
							entries
						) as FavoriteIdentities;
						if (kind === "filter") {
							syncLegacyFilterFavorites({ favorites: filteredFavorites });
						}
						return { favorites: filteredFavorites };
					}
					if (kind === "filter") {
						syncLegacyFilterFavorites({ favorites: nextFavorites });
					}
					return { favorites: nextFavorites };
				});
			},
			toggleFavorite: ({ kind, id }) => {
				get().setFavorite({
					kind,
					id,
					favorite: !get().isFavorite({ kind, id }),
				});
			},
			importLegacyFavorites: () => {
				const legacyFavorites = readLegacyFavorites();
				set(({ favorites }) => ({
					favorites: { ...legacyFavorites, ...favorites },
				}));
			},
			getRuntimeState: ({ asset }) => {
				const assetKey = assetManifestVersionKey({
					kind: asset.kind,
					id: asset.id,
					version: asset.version,
				});
				return (
					get().runtimeByAssetKey[assetKey] ??
					createInitialAssetRuntimeState({ asset })
				);
			},
			updateRuntimeState: ({ asset, patch }) => {
				const assetKey = assetManifestVersionKey({
					kind: asset.kind,
					id: asset.id,
					version: asset.version,
				});
				set(({ runtimeByAssetKey }) => {
					const current =
						runtimeByAssetKey[assetKey] ??
						createInitialAssetRuntimeState({ asset });
					return {
						runtimeByAssetKey: {
							...runtimeByAssetKey,
							[assetKey]: {
								...current,
								...patch,
								assetKey,
								progress:
									patch.progress === undefined
										? current.progress
										: Math.max(0, Math.min(1, patch.progress)),
							},
						},
					};
				});
			},
			clearRuntimeState: ({ asset }) => {
				const assetKey = assetManifestVersionKey({
					kind: asset.kind,
					id: asset.id,
					version: asset.version,
				});
				set(({ runtimeByAssetKey }) => ({
					runtimeByAssetKey: Object.fromEntries(
						Object.entries(runtimeByAssetKey).filter(
							([candidate]) => candidate !== assetKey
						)
					),
				}));
			},
			resetLibrary: () => set({ favorites: {}, runtimeByAssetKey: {} }),
		}),
		{
			name: ASSET_LIBRARY_STORAGE_KEY,
			version: 1,
			storage: createJSONStorage(() => window.localStorage),
			partialize: ({ favorites, runtimeByAssetKey }) => ({
				favorites,
				runtimeByAssetKey,
			}),
			merge: (persistedState, currentState) => ({
				...currentState,
				...normalizeAssetLibraryPersistedState({
					value: persistedState,
					legacyFavorites: readLegacyFavorites(),
				}),
			}),
		}
	)
);
