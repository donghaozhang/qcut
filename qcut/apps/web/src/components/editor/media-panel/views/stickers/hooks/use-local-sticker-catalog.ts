import { useEffect, useMemo, useState } from "react";
import { getLocalStickerLabSource } from "@/lib/stickers/local-sticker-lab-config";
import { buildLegacyLocalStickerCatalog } from "@/lib/stickers/local-sticker-legacy-catalog";
import {
	loadLocalStickerManifest,
	type LocalStickerCatalog,
} from "@/lib/stickers/local-sticker-manifest";

export interface LocalStickerCatalogState {
	catalog: LocalStickerCatalog | null;
	error: string | null;
	isAvailable: boolean;
	isLoading: boolean;
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
			setState({
				catalog: buildLegacyLocalStickerCatalog({
					filePath: source.filePath,
				}),
				error: null,
				isAvailable: true,
				isLoading: false,
			});
			return;
		}

		let disposed = false;
		const loadCatalog = async () => {
			try {
				const catalog = await loadLocalStickerManifest({
					manifestPath: source.manifestPath,
				});
				if (disposed) return;
				setState({
					catalog,
					error: null,
					isAvailable: true,
					isLoading: false,
				});
			} catch (error) {
				if (disposed) return;
				setState({
					catalog: null,
					error:
						error instanceof Error
							? error.message
							: "Unable to load local sticker manifest",
					isAvailable: true,
					isLoading: false,
				});
			}
		};

		loadCatalog();
		return () => {
			disposed = true;
		};
	}, [source]);

	return state;
}
