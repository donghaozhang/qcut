import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractStickerSources } from "../export-cli/sources/sticker-sources";
import type { MediaItem } from "@/stores/media/media-store-types";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

interface StickerOverlayData {
	id: string;
	mediaItemId: string;
	position: { x: number; y: number };
	size: { width: number; height: number };
	zIndex: number;
	opacity?: number;
	rotation?: number;
	timing?: { startTime?: number; endTime?: number };
}

function createStickerData(
	overrides?: Partial<StickerOverlayData>
): StickerOverlayData {
	return {
		id: "sticker-1",
		mediaItemId: "media-1",
		position: { x: 50, y: 50 },
		size: { width: 20, height: 20 },
		zIndex: 1,
		opacity: 1,
		rotation: 0,
		...overrides,
	};
}

function createMediaItem(overrides?: Partial<MediaItem>): MediaItem {
	return {
		id: "media-1",
		name: "sticker.png",
		type: "image",
		file: new File([], "sticker.png"),
		url: "blob:http://localhost/sticker-1",
		localPath: "/tmp/sticker.png",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function createStoreGetter(stickers: StickerOverlayData[]) {
	return async () => ({
		getStickersForExport: () => stickers,
	});
}

function createMockAPI(path = "/tmp/exported-sticker.png") {
	return {
		saveStickerForExport: vi.fn().mockResolvedValue({
			success: true,
			path,
		}),
	};
}

const silentLogger = vi.fn();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractStickerSources", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		silentLogger.mockClear();
	});

	// -----------------------------------------------------------------------
	// Happy path
	// -----------------------------------------------------------------------

	describe("happy path", () => {
		it("should return sticker sources sorted by zIndex", async () => {
			const stickers = [
				createStickerData({
					id: "s-high",
					mediaItemId: "m-high",
					zIndex: 100,
				}),
				createStickerData({
					id: "s-low",
					mediaItemId: "m-low",
					zIndex: 1,
				}),
				createStickerData({
					id: "s-mid",
					mediaItemId: "m-mid",
					zIndex: 50,
				}),
			];
			const mediaItems = [
				createMediaItem({ id: "m-high" }),
				createMediaItem({ id: "m-low" }),
				createMediaItem({ id: "m-mid" }),
			];

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				10,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			expect(result).toHaveLength(3);
			expect(result[0].id).toBe("s-low");
			expect(result[1].id).toBe("s-mid");
			expect(result[2].id).toBe("s-high");
		});

		it("should use localPath when available instead of downloading", async () => {
			const fetchSpy = vi.spyOn(globalThis, "fetch");
			const stickers = [createStickerData()];
			const mediaItems = [
				createMediaItem({ localPath: "/existing/sticker.png" }),
			];

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				10,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			expect(result).toHaveLength(1);
			expect(result[0].path).toBe("/existing/sticker.png");
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it("should preserve animated sticker metadata for FFmpeg", async () => {
			const result = await extractStickerSources(
				[createMediaItem({ metadata: { animatedSticker: true } })],
				"session-1",
				1920,
				1080,
				10,
				createStoreGetter([createStickerData()]),
				createMockAPI(),
				silentLogger
			);

			expect(result).toHaveLength(1);
			expect(result[0].animated).toBe(true);
		});

		it("should download blob URL via fetch when no localPath", async () => {
			const mockBlob = {
				arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
				type: "image/png",
			};
			const mockResponse = {
				ok: true,
				blob: vi.fn().mockResolvedValue(mockBlob),
			};
			vi.spyOn(globalThis, "fetch").mockResolvedValue(
				mockResponse as unknown as Response
			);

			const mockAPI = createMockAPI("/tmp/downloaded.png");
			const stickers = [createStickerData()];
			const mediaItems = [
				createMediaItem({
					localPath: undefined,
					url: "blob:http://localhost/sticker-blob",
				}),
			];

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				10,
				createStoreGetter(stickers),
				mockAPI,
				silentLogger
			);

			expect(result).toHaveLength(1);
			expect(result[0].path).toBe("/tmp/downloaded.png");
			expect(globalThis.fetch).toHaveBeenCalledWith(
				"blob:http://localhost/sticker-blob"
			);
			expect(mockAPI.saveStickerForExport).toHaveBeenCalledWith(
				expect.objectContaining({
					sessionId: "session-1",
					stickerId: "sticker-1",
					format: "png",
				})
			);
		});
	});

	// -----------------------------------------------------------------------
	// Error handling
	// -----------------------------------------------------------------------

	describe("error handling", () => {
		it("should return empty array when sessionId is null", async () => {
			const stickers = [createStickerData()];

			const result = await extractStickerSources(
				[createMediaItem()],
				null,
				1920,
				1080,
				10,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			expect(result).toEqual([]);
		});

		it("should return empty array when no stickers exist", async () => {
			const result = await extractStickerSources(
				[createMediaItem()],
				"session-1",
				1920,
				1080,
				10,
				createStoreGetter([]),
				createMockAPI(),
				silentLogger
			);

			expect(result).toEqual([]);
		});

		it("should return empty array when sticker API is unavailable", async () => {
			const stickers = [createStickerData()];

			const result = await extractStickerSources(
				[createMediaItem()],
				"session-1",
				1920,
				1080,
				10,
				createStoreGetter(stickers),
				undefined, // no API
				silentLogger
			);

			expect(result).toEqual([]);
		});

		it("should skip sticker when media item is not found", async () => {
			const stickers = [createStickerData({ mediaItemId: "nonexistent" })];

			const result = await extractStickerSources(
				[createMediaItem({ id: "other-media" })],
				"session-1",
				1920,
				1080,
				10,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			expect(result).toEqual([]);
			expect(silentLogger).toHaveBeenCalledWith(
				expect.stringContaining("Media item not found")
			);
		});

		it("should skip sticker when download fails and continue with rest", async () => {
			const mockAPI = {
				saveStickerForExport: vi
					.fn()
					.mockRejectedValueOnce(new Error("download failed"))
					.mockResolvedValueOnce({
						success: true,
						path: "/tmp/s2.png",
					}),
			};

			const stickers = [
				createStickerData({
					id: "s1",
					mediaItemId: "m1",
					zIndex: 1,
				}),
				createStickerData({
					id: "s2",
					mediaItemId: "m2",
					zIndex: 2,
				}),
			];
			const mediaItems = [
				createMediaItem({
					id: "m1",
					localPath: undefined,
					url: "blob:http://localhost/1",
				}),
				createMediaItem({
					id: "m2",
					localPath: undefined,
					url: "blob:http://localhost/2",
				}),
			];

			// Mock fetch for both downloads
			const mockBlob = {
				arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
				type: "image/png",
			};
			vi.spyOn(globalThis, "fetch").mockResolvedValue({
				ok: true,
				blob: vi.fn().mockResolvedValue(mockBlob),
			} as unknown as Response);

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				10,
				createStoreGetter(stickers),
				mockAPI,
				silentLogger
			);

			// s1 failed, s2 succeeded
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("s2");
		});

		it("should return empty array when store getter throws", async () => {
			const failingGetter = async () => {
				throw new Error("store unavailable");
			};

			const result = await extractStickerSources(
				[createMediaItem()],
				"session-1",
				1920,
				1080,
				10,
				failingGetter as any,
				createMockAPI(),
				silentLogger
			);

			expect(result).toEqual([]);
			expect(silentLogger).toHaveBeenCalledWith(
				expect.stringContaining("Failed to extract sticker sources"),
				expect.any(Error)
			);
		});
	});

	// -----------------------------------------------------------------------
	// downloadStickerToTemp (tested via extractStickerSources)
	// -----------------------------------------------------------------------

	describe("downloadStickerToTemp", () => {
		it("should call saveStickerForExport with correct params", async () => {
			const mockBlob = {
				arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(16)),
				type: "image/webp",
			};
			vi.spyOn(globalThis, "fetch").mockResolvedValue({
				ok: true,
				blob: vi.fn().mockResolvedValue(mockBlob),
			} as unknown as Response);

			const mockAPI = createMockAPI("/tmp/result.webp");
			const stickers = [createStickerData({ id: "s-test" })];
			const mediaItems = [
				createMediaItem({
					localPath: undefined,
					url: "blob:http://localhost/test",
				}),
			];

			await extractStickerSources(
				mediaItems,
				"session-abc",
				1920,
				1080,
				10,
				createStoreGetter(stickers),
				mockAPI,
				silentLogger
			);

			expect(mockAPI.saveStickerForExport).toHaveBeenCalledWith({
				sessionId: "session-abc",
				stickerId: "s-test",
				imageData: expect.any(Uint8Array),
				format: "webp",
			});
		});

		it("should throw when fetch returns non-ok response", async () => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue({
				ok: false,
				status: 404,
			} as unknown as Response);

			const stickers = [createStickerData()];
			const mediaItems = [
				createMediaItem({
					localPath: undefined,
					url: "blob:http://localhost/missing",
				}),
			];

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				10,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			// Sticker is skipped due to download failure
			expect(result).toEqual([]);
			expect(silentLogger).toHaveBeenCalledWith(
				expect.stringContaining("Failed to process sticker"),
				expect.any(Error)
			);
		});

		it("should throw when saveStickerForExport returns no path", async () => {
			const mockBlob = {
				arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
				type: "image/png",
			};
			vi.spyOn(globalThis, "fetch").mockResolvedValue({
				ok: true,
				blob: vi.fn().mockResolvedValue(mockBlob),
			} as unknown as Response);

			const mockAPI = {
				saveStickerForExport: vi.fn().mockResolvedValue({
					success: true,
					path: undefined, // no path returned
				}),
			};

			const stickers = [createStickerData()];
			const mediaItems = [
				createMediaItem({
					localPath: undefined,
					url: "blob:http://localhost/test",
				}),
			];

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				10,
				createStoreGetter(stickers),
				mockAPI,
				silentLogger
			);

			expect(result).toEqual([]);
		});
	});
});
