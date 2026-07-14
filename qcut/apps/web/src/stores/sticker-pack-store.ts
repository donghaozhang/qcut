import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_INSTALLED_STICKER_PACK_IDS } from "@/lib/stickers/sticker-pack-catalog";

export const STICKER_PACK_STORAGE_KEY = "qcut-sticker-packs-v1";

type InstalledStickerPackIds = Record<string, true>;

interface StickerPackStore {
	installedPackIds: InstalledStickerPackIds;
	installPack: ({ packId }: { packId: string }) => void;
	isInstalled: ({ packId }: { packId: string }) => boolean;
	resetPacks: () => void;
}

function defaultInstalledPacks(): InstalledStickerPackIds {
	return Object.fromEntries(
		DEFAULT_INSTALLED_STICKER_PACK_IDS.map((packId) => [packId, true])
	) as InstalledStickerPackIds;
}

export const useStickerPackStore = create<StickerPackStore>()(
	persist(
		(set, get) => ({
			installedPackIds: defaultInstalledPacks(),
			installPack: ({ packId }) => {
				if (!packId.trim()) return;
				set(({ installedPackIds }) => ({
					installedPackIds: { ...installedPackIds, [packId]: true },
				}));
			},
			isInstalled: ({ packId }) => get().installedPackIds[packId] === true,
			resetPacks: () => set({ installedPackIds: defaultInstalledPacks() }),
		}),
		{
			name: STICKER_PACK_STORAGE_KEY,
			storage: createJSONStorage(() => localStorage),
			partialize: ({ installedPackIds }) => ({ installedPackIds }),
		}
	)
);
