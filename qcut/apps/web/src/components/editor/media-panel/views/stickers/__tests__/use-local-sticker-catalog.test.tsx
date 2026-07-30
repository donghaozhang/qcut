import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalStickerCatalog } from "@/lib/stickers/__tests__/fixtures/local-sticker-catalog";
import type { LocalStickerLabSource } from "@/lib/stickers/local-sticker-lab-config";
import { useLocalStickerCatalog } from "../hooks/use-local-sticker-catalog";

const catalogMocks = vi.hoisted(() => ({
	getSource: vi.fn<() => LocalStickerLabSource | null>(),
	loadManifest: vi.fn(),
}));

vi.mock("@/lib/stickers/local-sticker-lab-config", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/lib/stickers/local-sticker-lab-config")
		>();
	return {
		...actual,
		getLocalStickerLabSource: catalogMocks.getSource,
	};
});

vi.mock("@/lib/stickers/local-sticker-manifest", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/lib/stickers/local-sticker-manifest")
		>();
	return {
		...actual,
		loadLocalStickerManifest: catalogMocks.loadManifest,
	};
});

describe("useLocalStickerCatalog", () => {
	beforeEach(() => {
		catalogMocks.getSource.mockReset();
		catalogMocks.loadManifest.mockReset();
	});

	it("stays unavailable when the local lab is not configured", () => {
		catalogMocks.getSource.mockReturnValue(null);

		const { result } = renderHook(() => useLocalStickerCatalog());

		expect(result.current).toEqual({
			catalog: null,
			error: null,
			isAvailable: false,
			isLoading: false,
		});
		expect(catalogMocks.loadManifest).not.toHaveBeenCalled();
	});

	it("loads a configured v1 manifest asynchronously", async () => {
		const catalog = createLocalStickerCatalog();
		catalogMocks.getSource.mockReturnValue({
			kind: "manifest",
			manifestPath: "/tmp/sticker-manifest.json",
		});
		catalogMocks.loadManifest.mockResolvedValue(catalog);

		const { result } = renderHook(() => useLocalStickerCatalog());

		expect(result.current).toMatchObject({
			catalog: null,
			isAvailable: true,
			isLoading: true,
		});
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.catalog).toEqual(catalog);
		expect(catalogMocks.loadManifest).toHaveBeenCalledWith({
			manifestPath: "/tmp/sticker-manifest.json",
		});
	});

	it("keeps the lab visible when its manifest is invalid", async () => {
		catalogMocks.getSource.mockReturnValue({
			kind: "manifest",
			manifestPath: "/tmp/broken.json",
		});
		catalogMocks.loadManifest.mockRejectedValue(
			new Error("Invalid local sticker manifest")
		);

		const { result } = renderHook(() => useLocalStickerCatalog());

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current).toEqual({
			catalog: null,
			error: "Invalid local sticker manifest",
			isAvailable: true,
			isLoading: false,
		});
	});

	it("hydrates the legacy single-file source without reading a manifest", async () => {
		catalogMocks.getSource.mockReturnValue({
			kind: "legacy",
			filePath: "/tmp/arrow.png",
		});

		const { result } = renderHook(() => useLocalStickerCatalog());

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.catalog?.categories[0]?.items).toHaveLength(1);
		expect(result.current.catalog?.categories[0]?.items[0]?.filePath).toBe(
			"/tmp/arrow.png"
		);
		expect(catalogMocks.loadManifest).not.toHaveBeenCalled();
	});
});
