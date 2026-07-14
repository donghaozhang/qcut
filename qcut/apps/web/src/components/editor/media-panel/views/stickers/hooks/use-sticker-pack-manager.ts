import { useCallback } from "react";
import {
	installStickerPackResources,
	removeStickerPackResources,
} from "@/lib/stickers/sticker-pack-resources";
import {
	resolveStickerPackItemAsset,
	type StickerStorePack,
} from "@/lib/stickers/sticker-pack-catalog";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useStickerPackStore } from "@/stores/sticker-pack-store";

export function useStickerPackManager() {
	const beginOperation = useStickerPackStore((state) => state.beginOperation);
	const completeInstall = useStickerPackStore((state) => state.completeInstall);
	const completeRemoval = useStickerPackStore((state) => state.completeRemoval);
	const failOperation = useStickerPackStore((state) => state.failOperation);
	const updateOperation = useStickerPackStore((state) => state.updateOperation);
	const updateRuntimeState = useAssetLibraryStore(
		(state) => state.updateRuntimeState
	);
	const clearRuntimeState = useAssetLibraryStore(
		(state) => state.clearRuntimeState
	);

	const installPack = useCallback(
		async ({ pack }: { pack: StickerStorePack }): Promise<boolean> => {
			const activeOperation =
				useStickerPackStore.getState().operationsByPackId[pack.id];
			if (
				activeOperation?.status === "installing" ||
				activeOperation?.status === "removing"
			) {
				return false;
			}
			beginOperation({
				packId: pack.id,
				status: "installing",
				totalItems: pack.items.length,
			});
			try {
				const result = await installStickerPackResources({
					pack,
					onAssetProgress: ({ asset, cacheKey, error, progress, status }) => {
						const isRemote = asset.delivery === "remote";
						updateRuntimeState({
							asset,
							patch: {
								cacheKey,
								cacheStatus:
									status === "failed"
										? "failed"
										: status === "downloaded"
											? "cached"
											: isRemote
												? "caching"
												: "cached",
								downloadStatus:
									status === "failed"
										? "failed"
										: isRemote
											? status === "downloaded"
												? "downloaded"
												: "downloading"
											: "not-required",
								error,
								progress,
							},
						});
					},
					onProgress: ({ completedItems, progress }) =>
						updateOperation({
							completedItems,
							packId: pack.id,
							progress,
						}),
				});
				completeInstall({
					cachedBytes: result.cachedBytes,
					installedAt: Date.now(),
					packId: pack.id,
					version: pack.version,
				});
				return true;
			} catch (error) {
				failOperation({
					error:
						error instanceof Error
							? error.message
							: "Sticker pack download failed",
					packId: pack.id,
				});
				return false;
			}
		},
		[
			beginOperation,
			completeInstall,
			failOperation,
			updateOperation,
			updateRuntimeState,
		]
	);

	const removePack = useCallback(
		async ({ pack }: { pack: StickerStorePack }): Promise<boolean> => {
			if (pack.builtIn) return false;
			const activeOperation =
				useStickerPackStore.getState().operationsByPackId[pack.id];
			if (
				activeOperation?.status === "installing" ||
				activeOperation?.status === "removing"
			) {
				return false;
			}
			beginOperation({
				packId: pack.id,
				status: "removing",
				totalItems: pack.items.length,
			});
			try {
				await removeStickerPackResources({
					pack,
					onProgress: ({ completedItems, progress }) =>
						updateOperation({
							completedItems,
							packId: pack.id,
							progress,
						}),
				});
				for (const item of pack.items) {
					clearRuntimeState({ asset: resolveStickerPackItemAsset({ item }) });
				}
				completeRemoval({ packId: pack.id });
				return true;
			} catch (error) {
				failOperation({
					error:
						error instanceof Error
							? error.message
							: "Sticker pack removal failed",
					packId: pack.id,
				});
				return false;
			}
		},
		[
			beginOperation,
			clearRuntimeState,
			completeRemoval,
			failOperation,
			updateOperation,
		]
	);

	return { installPack, removePack };
}
