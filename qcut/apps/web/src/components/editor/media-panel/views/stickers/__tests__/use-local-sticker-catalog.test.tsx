import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	PRIVATE_STICKER_CATALOG_IDS,
	type PrivateStickerCatalogId,
} from "@qcut/editor-core/sticker-lab";
import {
	createLocalStickerCatalog,
	createPrivateStickerCatalog,
	createPrivateStickerCatalogs,
	createRemoteStickerCatalog,
} from "@/lib/stickers/__tests__/fixtures/local-sticker-catalog";
import type { LocalStickerLabSource } from "@/lib/stickers/local-sticker-lab-config";
import { useLocalStickerCatalog } from "../hooks/use-local-sticker-catalog";

const catalogMocks = vi.hoisted(() => ({
	getSource: vi.fn<() => LocalStickerLabSource | null>(),
	loadManifest: vi.fn(),
	loadPrivateManifest: vi.fn(),
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
		loadPrivateStickerManifest: catalogMocks.loadPrivateManifest,
		loadRemoteStickerManifest: catalogMocks.loadRemoteManifest,
	};
});

describe("useLocalStickerCatalog", () => {
	beforeEach(() => {
		catalogMocks.getSource.mockReset();
		catalogMocks.loadManifest.mockReset();
		catalogMocks.loadPrivateManifest.mockReset();
		catalogMocks.loadRemoteManifest.mockReset();
		// Default: the viewer is not on the allow list.
		catalogMocks.loadPrivateManifest.mockRejectedValue(
			new Error("Unable to fetch sticker lab manifest (403)")
		);
	});

	it("stays unavailable when the local lab is not configured", () => {
		catalogMocks.getSource.mockReturnValue(null);

		const { result } = renderHook(() => useLocalStickerCatalog());

		expect(result.current).toEqual({
			catalog: null,
			error: null,
			isAvailable: false,
			isLoading: false,
			privateCatalogs: [],
		});
		expect(catalogMocks.loadPrivateManifest).not.toHaveBeenCalled();
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
			privateCatalogs: [],
		});
	});

	it("loads the private reference catalog for entitled users", async () => {
		const catalog = createLocalStickerCatalog();
		const privateCatalogs = createPrivateStickerCatalogs();
		catalogMocks.getSource.mockReturnValue({
			kind: "manifest",
			manifestPath: "/tmp/sticker-manifest.json",
		});
		catalogMocks.loadManifest.mockResolvedValue(catalog);
		catalogMocks.loadPrivateManifest.mockImplementation(
			({ expectedCatalogId }: { expectedCatalogId: PrivateStickerCatalogId }) =>
				Promise.resolve(
					createPrivateStickerCatalog({ catalogId: expectedCatalogId })
				)
		);

		const { result } = renderHook(() => useLocalStickerCatalog());

		await waitFor(() =>
			expect(result.current.privateCatalogs).toEqual(privateCatalogs)
		);
		expect(result.current.catalog).toEqual(catalog);
		expect(catalogMocks.loadPrivateManifest).toHaveBeenCalledTimes(3);
		for (const catalogId of PRIVATE_STICKER_CATALOG_IDS) {
			expect(catalogMocks.loadPrivateManifest).toHaveBeenCalledWith(
				expect.objectContaining({
					expectedCatalogId: catalogId,
					manifestUrl: expect.stringContaining(
						`/api/sticker-lab/private-manifest?catalogId=${catalogId}`
					),
					signal: expect.any(AbortSignal),
				})
			);
		}
	});

	it("keeps private catalogs empty when the server denies access", async () => {
		const catalog = createLocalStickerCatalog();
		catalogMocks.getSource.mockReturnValue({
			kind: "manifest",
			manifestPath: "/tmp/sticker-manifest.json",
		});
		catalogMocks.loadManifest.mockResolvedValue(catalog);

		const { result } = renderHook(() => useLocalStickerCatalog());

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.privateCatalogs).toEqual([]);
		// A 403 on the private tier is not an error state for the lab.
		expect(result.current.error).toBeNull();
	});

	it("keeps successful private catalogs when another batch is unavailable", async () => {
		const catalog = createLocalStickerCatalog();
		catalogMocks.getSource.mockReturnValue({
			kind: "manifest",
			manifestPath: "/tmp/sticker-manifest.json",
		});
		catalogMocks.loadManifest.mockResolvedValue(catalog);
		catalogMocks.loadPrivateManifest.mockImplementation(
			({
				expectedCatalogId,
			}: {
				expectedCatalogId: PrivateStickerCatalogId;
			}) => {
				if (expectedCatalogId === "jianying-2026-08-01-batch-2") {
					return Promise.reject(new Error("Private manifest unavailable"));
				}
				return Promise.resolve(
					createPrivateStickerCatalog({ catalogId: expectedCatalogId })
				);
			}
		);

		const { result } = renderHook(() => useLocalStickerCatalog());

		await waitFor(() => expect(result.current.privateCatalogs).toHaveLength(2));
		expect(
			result.current.privateCatalogs.map(({ catalogId }) => catalogId)
		).toEqual(["jianying-2026-07-31", "jianying-2026-08-01-batch-3"]);
	});

	it("starts all private catalog requests in parallel and publishes after all settle", async () => {
		const catalog = createLocalStickerCatalog();
		const resolvers = new Map<
			PrivateStickerCatalogId,
			(value: ReturnType<typeof createPrivateStickerCatalog>) => void
		>();
		catalogMocks.getSource.mockReturnValue({
			kind: "manifest",
			manifestPath: "/tmp/sticker-manifest.json",
		});
		catalogMocks.loadManifest.mockResolvedValue(catalog);
		catalogMocks.loadPrivateManifest.mockImplementation(
			({ expectedCatalogId }: { expectedCatalogId: PrivateStickerCatalogId }) =>
				new Promise((resolve) => {
					resolvers.set(expectedCatalogId, resolve);
				})
		);

		const { result } = renderHook(() => useLocalStickerCatalog());

		expect(catalogMocks.loadPrivateManifest).toHaveBeenCalledTimes(3);
		expect(resolvers.size).toBe(3);
		await act(async () => {
			const catalogId = PRIVATE_STICKER_CATALOG_IDS[0];
			resolvers.get(catalogId)?.(createPrivateStickerCatalog({ catalogId }));
			await Promise.resolve();
		});
		expect(result.current.privateCatalogs).toEqual([]);

		await act(async () => {
			for (const catalogId of PRIVATE_STICKER_CATALOG_IDS.slice(1)) {
				resolvers.get(catalogId)?.(createPrivateStickerCatalog({ catalogId }));
			}
		});
		await waitFor(() => expect(result.current.privateCatalogs).toHaveLength(3));
	});

	it("aborts all private catalog requests when the panel unmounts", () => {
		catalogMocks.getSource.mockReturnValue({
			kind: "manifest",
			manifestPath: "/tmp/sticker-manifest.json",
		});
		catalogMocks.loadManifest.mockResolvedValue(createLocalStickerCatalog());
		catalogMocks.loadPrivateManifest.mockReturnValue(new Promise(() => {}));

		const { unmount } = renderHook(() => useLocalStickerCatalog());
		const signals = catalogMocks.loadPrivateManifest.mock.calls.map(
			([options]) => options.signal as AbortSignal
		);
		expect(signals).toHaveLength(3);

		unmount();
		expect(signals.every((signal) => signal.aborted)).toBe(true);
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
