import { beforeEach, describe, expect, it } from "vitest";
import {
	normalizeStickerPackPersistedState,
	useStickerPackStore,
} from "../sticker-pack-store";

describe("sticker pack store", () => {
	beforeEach(() => useStickerPackStore.getState().resetPacks());

	it("keeps bundled packs installed but leaves remote packs downloadable", () => {
		expect(
			useStickerPackStore.getState().isInstalled({
				packId: "qcut-original-characters",
			})
		).toBe(true);
		expect(
			useStickerPackStore.getState().isInstalled({
				packId: "fluent-creator-essentials",
			})
		).toBe(false);
	});

	it("tracks progress and persists versioned installation metadata", () => {
		const store = useStickerPackStore.getState();
		store.beginOperation({
			packId: "fluent-creator-essentials",
			status: "installing",
			totalItems: 160,
		});
		store.updateOperation({
			completedItems: 80,
			packId: "fluent-creator-essentials",
			progress: 0.5,
		});
		expect(
			useStickerPackStore.getState().operationsByPackId[
				"fluent-creator-essentials"
			]
		).toMatchObject({ completedItems: 80, progress: 0.5 });

		store.completeInstall({
			cachedBytes: 4096,
			installedAt: 123,
			packId: "fluent-creator-essentials",
			version: 2,
		});
		expect(
			useStickerPackStore.getState().installedPacks["fluent-creator-essentials"]
		).toEqual({ cachedBytes: 4096, installedAt: 123, version: 2 });
		expect(
			useStickerPackStore.getState().operationsByPackId[
				"fluent-creator-essentials"
			]
		).toBeUndefined();
	});

	it("keeps a failed operation retryable and removes installed records", () => {
		const store = useStickerPackStore.getState();
		store.beginOperation({
			packId: "qcut-motion-emphasis",
			status: "installing",
			totalItems: 12,
		});
		store.failOperation({
			error: "network unavailable",
			packId: "qcut-motion-emphasis",
		});
		expect(
			useStickerPackStore.getState().operationsByPackId["qcut-motion-emphasis"]
		).toMatchObject({ error: "network unavailable", status: "failed" });

		store.completeInstall({
			cachedBytes: 0,
			installedAt: 200,
			packId: "qcut-motion-emphasis",
			version: 1,
		});
		store.completeRemoval({ packId: "qcut-motion-emphasis" });
		expect(
			useStickerPackStore.getState().isInstalled({
				packId: "qcut-motion-emphasis",
			})
		).toBe(false);
	});

	it("migrates legacy installed ID maps into versioned records", () => {
		expect(
			normalizeStickerPackPersistedState({
				value: {
					installedPackIds: {
						"qcut-motion-emphasis": true,
						ignored: false,
					},
				},
			}).installedPacks["qcut-motion-emphasis"]
		).toEqual({ cachedBytes: 0, installedAt: 0, version: 1 });
	});
});
