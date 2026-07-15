import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	resolveStickerPackItemAsset,
	STICKER_STORE_PACKS,
} from "@/lib/stickers/sticker-pack-catalog";
import { useAssetLibraryStore } from "@/stores/asset-library-store";
import { useStickerPackStore } from "@/stores/sticker-pack-store";
import { useStickerPackManager } from "../hooks/use-sticker-pack-manager";

const resourceMocks = vi.hoisted(() => ({
	installStickerPackResources:
		vi.fn<
			typeof import("@/lib/stickers/sticker-pack-resources").installStickerPackResources
		>(),
	removeStickerPackResources:
		vi.fn<
			typeof import("@/lib/stickers/sticker-pack-resources").removeStickerPackResources
		>(),
}));

vi.mock("@/lib/stickers/sticker-pack-resources", () => resourceMocks);

describe("useStickerPackManager", () => {
	const remotePack = STICKER_STORE_PACKS.find(
		(pack) => pack.id === "fluent-creator-essentials"
	);

	beforeEach(() => {
		if (!remotePack) throw new Error("Remote sticker pack fixture is missing");
		resourceMocks.installStickerPackResources.mockReset();
		resourceMocks.removeStickerPackResources.mockReset();
		useAssetLibraryStore.getState().resetLibrary();
		useStickerPackStore.getState().resetPacks();
	});

	it("synchronizes pack progress with per-asset runtime state", async () => {
		if (!remotePack) throw new Error("Remote sticker pack fixture is missing");
		const firstItem = remotePack.items[0];
		if (!firstItem) throw new Error("Remote sticker fixture is empty");
		const asset = resolveStickerPackItemAsset({ item: firstItem });
		resourceMocks.installStickerPackResources.mockImplementation(
			async ({ onAssetProgress, onProgress, pack }) => {
				onProgress?.({
					completedItems: pack.items.length,
					progress: 1,
					totalItems: pack.items.length,
				});
				onAssetProgress?.({
					asset,
					cacheKey: "remote-cache-key",
					progress: 1,
					status: "downloaded",
				});
				return { cachedBytes: 2048, resourceCount: pack.items.length };
			}
		);
		resourceMocks.removeStickerPackResources.mockImplementation(
			async ({ onProgress, pack }) => {
				onProgress?.({
					completedItems: pack.items.length,
					progress: 1,
					totalItems: pack.items.length,
				});
				return { removedResourceCount: pack.items.length };
			}
		);

		const { result } = renderHook(() => useStickerPackManager());
		await act(async () => {
			expect(await result.current.installPack({ pack: remotePack })).toBe(true);
		});
		expect(
			useStickerPackStore.getState().installedPacks[remotePack.id]
		).toMatchObject({ cachedBytes: 2048, version: remotePack.version });
		expect(
			useAssetLibraryStore.getState().getRuntimeState({ asset })
		).toMatchObject({
			cacheKey: "remote-cache-key",
			cacheStatus: "cached",
			downloadStatus: "downloaded",
			progress: 1,
		});

		await act(async () => {
			expect(await result.current.removePack({ pack: remotePack })).toBe(true);
		});
		expect(
			useStickerPackStore.getState().isInstalled({ packId: remotePack.id })
		).toBe(false);
		expect(
			useAssetLibraryStore.getState().getRuntimeState({ asset })
		).toMatchObject({
			cacheStatus: "uncached",
			downloadStatus: "not-downloaded",
			progress: 0,
		});
	});
});
