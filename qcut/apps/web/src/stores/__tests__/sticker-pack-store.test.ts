import { beforeEach, describe, expect, it } from "vitest";
import { useStickerPackStore } from "../sticker-pack-store";

describe("sticker pack store", () => {
	beforeEach(() => useStickerPackStore.getState().resetPacks());

	it("keeps free packs installed and persists explicit pack installs", () => {
		expect(
			useStickerPackStore.getState().isInstalled({
				packId: "qcut-original-characters",
			})
		).toBe(true);
		expect(
			useStickerPackStore.getState().isInstalled({
				packId: "material-line-motion",
			})
		).toBe(false);

		useStickerPackStore.getState().installPack({
			packId: "material-line-motion",
		});

		expect(
			useStickerPackStore.getState().isInstalled({
				packId: "material-line-motion",
			})
		).toBe(true);
	});
});
