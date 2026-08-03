import { useEffect, useMemo, useState } from "react";
import { PRIVATE_STICKER_CATALOG_IDS } from "@qcut/editor-core/sticker-lab";
import { debugError } from "@/lib/debug/debug-config";
import { getLocalStickerLabSource } from "@/lib/stickers/local-sticker-lab-config";
import { buildLegacyLocalStickerCatalog } from "@/lib/stickers/local-sticker-legacy-catalog";
import {
	loadLocalStickerManifest,
	loadPrivateStickerManifest,
	loadRemoteStickerManifest,
	type PrivateStickerCatalog,
	type StickerLabCatalog,
} from "@/lib/stickers/local-sticker-manifest";
import { validatePrivateStickerCatalogSet } from "@/lib/stickers/private-sticker-catalog-set";
import {
	createStickerLabAssetFetch,
	stickerLabPrivateManifestUrl,
} from "@/lib/stickers/local-sticker-reference";

export interface LocalStickerCatalogState {
	catalog: StickerLabCatalog | null;
	error: string | null;
	isAvailable: boolean;
	isLoading: boolean;
	/**
	 * Harvested reference catalogues accepted for this user's entitlement.
	 * Everyone else gets an empty list and sees only the public catalogue.
	 */
	privateCatalogs: PrivateStickerCatalog[];
	/**
	 * Reference catalogues that failed to load. Surfaced rather than swallowed:
	 * every failure hides a slice of the catalogue, and dropping them silently
	 * makes a partially-loaded lab indistinguishable from a small one.
	 */
	unavailablePrivateCatalogIds: string[];
}

function initialCatalogState({
	hasSource,
}: {
	hasSource: boolean;
}): LocalStickerCatalogState {
	return {
		catalog: null,
		error: null,
		isAvailable: hasSource,
		isLoading: hasSource,
		privateCatalogs: [],
		unavailablePrivateCatalogIds: [],
	};
}

export function useLocalStickerCatalog(): LocalStickerCatalogState {
	const source = useMemo(() => getLocalStickerLabSource(), []);
	const [state, setState] = useState<LocalStickerCatalogState>(() =>
		initialCatalogState({ hasSource: source !== null })
	);

	useEffect(() => {
		if (!source) return;
		if (source.kind === "legacy") {
			setState((previous) => ({
				...previous,
				catalog: buildLegacyLocalStickerCatalog({
					filePath: source.filePath,
				}),
				error: null,
				isAvailable: true,
				isLoading: false,
			}));
			return;
		}

		let disposed = false;
		const abortController = new AbortController();
		const loadCatalog = async () => {
			try {
				const catalog =
					source.kind === "manifest"
						? await loadLocalStickerManifest({
								manifestPath: source.manifestPath,
							})
						: await loadRemoteStickerManifest({
								manifestUrl: source.manifestUrl,
								signal: abortController.signal,
							});
				if (disposed) return;
				setState((previous) => ({
					...previous,
					catalog,
					error: null,
					isAvailable: true,
					isLoading: false,
				}));
			} catch (error) {
				if (disposed) return;
				setState((previous) => ({
					...previous,
					catalog: null,
					error:
						error instanceof Error
							? error.message
							: "Unable to load sticker lab manifest",
					isAvailable: true,
					isLoading: false,
				}));
			}
		};

		loadCatalog();
		return () => {
			disposed = true;
			abortController.abort();
		};
	}, [source]);

	useEffect(() => {
		if (!source) return;

		let disposed = false;
		const abortController = new AbortController();
		const loadPrivateCatalogs = async () => {
			const fetchImpl = createStickerLabAssetFetch();
			const results = await Promise.allSettled(
				PRIVATE_STICKER_CATALOG_IDS.map((catalogId) =>
					loadPrivateStickerManifest({
						expectedCatalogId: catalogId,
						fetchImpl,
						manifestUrl: stickerLabPrivateManifestUrl({ catalogId }),
						signal: abortController.signal,
					})
				)
			);
			if (disposed) return;

			const availableCatalogs: PrivateStickerCatalog[] = [];
			const unavailableCatalogIds: string[] = [];
			for (const [index, result] of results.entries()) {
				const catalogId = PRIVATE_STICKER_CATALOG_IDS[index];
				if (result.status === "fulfilled") {
					availableCatalogs.push(result.value);
					continue;
				}
				// Happens during rolling deploys, for users outside the allow list,
				// signed-out sessions, and offline runs — but also when the server
				// serves one catalogue for every id, which looks identical from here.
				// Record it so the panel can say a slice is missing.
				unavailableCatalogIds.push(catalogId);
				debugError(
					`[StickerLab] Private reference catalog unavailable: ${catalogId}`,
					result.reason
				);
			}

			try {
				const privateCatalogs = validatePrivateStickerCatalogSet({
					catalogs: availableCatalogs,
				});
				setState((previous) => ({
					...previous,
					privateCatalogs,
					unavailablePrivateCatalogIds: unavailableCatalogIds,
				}));
			} catch (error) {
				debugError(
					"[StickerLab] Private reference catalog set rejected",
					error
				);
				setState((previous) => ({
					...previous,
					privateCatalogs: [],
					unavailablePrivateCatalogIds: [...PRIVATE_STICKER_CATALOG_IDS],
				}));
			}
		};

		loadPrivateCatalogs();
		return () => {
			disposed = true;
			abortController.abort();
		};
	}, [source]);

	return state;
}
