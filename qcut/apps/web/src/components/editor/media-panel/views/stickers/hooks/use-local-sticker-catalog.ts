import { useEffect, useMemo, useState } from "react";
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
	 * The harvested reference catalogue, present only when the license server
	 * accepts this user's entitlement. Everyone else silently gets null and
	 * sees just the public catalogue.
	 */
	privateCatalog: PrivateStickerCatalog | null;
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
		privateCatalog: null,
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
		const loadPrivateCatalog = async () => {
			try {
				const privateCatalog = await loadPrivateStickerManifest({
					fetchImpl: createStickerLabAssetFetch(),
					manifestUrl: stickerLabPrivateManifestUrl(),
					signal: abortController.signal,
				});
				if (disposed) return;
				setState((previous) => ({ ...previous, privateCatalog }));
			} catch (error) {
				// Expected for everyone outside the allow list (403), signed-out
				// sessions, and offline runs — the lab is fully usable without it.
				if (disposed) return;
				debugError("[StickerLab] Private reference catalog unavailable", error);
			}
		};

		loadPrivateCatalog();
		return () => {
			disposed = true;
			abortController.abort();
		};
	}, [source]);

	return state;
}
