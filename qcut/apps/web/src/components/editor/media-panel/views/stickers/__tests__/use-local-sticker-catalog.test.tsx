import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createLocalStickerCatalog,
	createRemoteStickerCatalog,
} from "@/lib/stickers/__tests__/fixtures/local-sticker-catalog";
import type { LocalStickerLabSource } from "@/lib/stickers/local-sticker-lab-config";
import { useLocalStickerCatalog } from "../hooks/use-local-sticker-catalog";

const catalogMocks = vi.hoisted(() => ({
	getSource: vi.fn<() => LocalStickerLabSource | null>(),
	loadManifest: vi.fn(),
	loadRemoteManifest: vi.fn(),
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
		loadRemoteStickerManifest: catalogMocks.loadRemoteManifest,
	};
});

describe("useLocalStickerCatalog", () => {
	beforeEach(() => {
		catalogMocks.getSource.mockReset();
		catalogMocks.loadManifest.mockReset();
		catalogMocks.loadRemoteManifest.mockReset();
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

	it("fetches a configured remote v2 manifest", async () => {
		const catalog = createRemoteStickerCatalog();
		catalogMocks.getSource.mockReturnValue({
			kind: "remote-manifest",
			manifestUrl: "/sticker-lab/catalog.json",
		});
		catalogMocks.loadRemoteManifest.mockResolvedValue(catalog);

		const { result } = renderHook(() => useLocalStickerCatalog());

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.catalog).toEqual(catalog);
		expect(catalogMocks.loadRemoteManifest).toHaveBeenCalledWith({
			manifestUrl: "/sticker-lab/catalog.json",
			signal: expect.any(AbortSignal),
		});
		expect(catalogMocks.loadManifest).not.toHaveBeenCalled();
	});

	it("aborts a remote manifest request when the panel unmounts", () => {
		catalogMocks.getSource.mockReturnValue({
			kind: "remote-manifest",
			manifestUrl: "/sticker-lab/catalog.json",
		});
		catalogMocks.loadRemoteManifest.mockReturnValue(new Promise(() => {}));

		const { unmount } = renderHook(() => useLocalStickerCatalog());
		const signal = catalogMocks.loadRemoteManifest.mock.calls[0]?.[0]
			.signal as AbortSignal;

		unmount();
		expect(signal.aborted).toBe(true);
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
		const reference = result.current.catalog?.categories[0]?.items[0];
		expect(
			reference && "filePath" in reference ? reference.filePath : null
		).toBe("/tmp/arrow.png");
		expect(catalogMocks.loadManifest).not.toHaveBeenCalled();
		expect(catalogMocks.loadRemoteManifest).not.toHaveBeenCalled();
	});
});
