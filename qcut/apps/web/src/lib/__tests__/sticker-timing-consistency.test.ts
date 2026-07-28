import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { StickerElement } from "@/types/timeline";

// Mock sticker-timeline-query before importing sticker-sources
// This controls what timing values the export pipeline sees
const mockTimingMap = new Map<
	string,
	{ startTime: number; endTime: number; element?: StickerElement }
>();

vi.mock("@/lib/stickers/sticker-timeline-query", () => ({
	getStickerTimingMap: () => mockTimingMap,
	getStickerTiming: (id: string) => mockTimingMap.get(id) ?? null,
}));

import { extractStickerSources } from "../export-cli/sources/sticker-sources";

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

describe("Sticker Timing Consistency", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		silentLogger.mockClear();
		mockTimingMap.clear();
	});

	// -----------------------------------------------------------------------
	// Timing defaults
	// -----------------------------------------------------------------------

	describe("extractStickerSources timing defaults", () => {
		const TOTAL_DURATION = 30;

		it("should default startTime to 0 when timing is undefined", async () => {
			const stickers = [createStickerData({ timing: undefined })];
			const mediaItems = [createMediaItem()];

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				TOTAL_DURATION,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			expect(result).toHaveLength(1);
			expect(result[0].startTime).toBe(0);
		});

		it("should default endTime to totalDuration when timing is undefined", async () => {
			const stickers = [createStickerData({ timing: undefined })];
			const mediaItems = [createMediaItem()];

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				TOTAL_DURATION,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			expect(result).toHaveLength(1);
			expect(result[0].endTime).toBe(TOTAL_DURATION);
		});

		it("should use timeline timing when sticker has a timeline entry (startTime only)", async () => {
			const stickers = [createStickerData()];
			const mediaItems = [createMediaItem()];
			// Timeline provides timing — startTime=0, endTime=15
			mockTimingMap.set("sticker-1", { startTime: 0, endTime: 15 });

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				TOTAL_DURATION,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			expect(result[0].startTime).toBe(0);
			expect(result[0].endTime).toBe(15);
		});

		it("should use timeline timing with custom startTime", async () => {
			const stickers = [createStickerData()];
			const mediaItems = [createMediaItem()];
			// Timeline provides timing — startTime=5, endTime=totalDuration
			mockTimingMap.set("sticker-1", { startTime: 5, endTime: TOTAL_DURATION });

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				TOTAL_DURATION,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			expect(result[0].startTime).toBe(5);
			expect(result[0].endTime).toBe(TOTAL_DURATION);
		});

		it("should preserve explicit timeline startTime and endTime values", async () => {
			const stickers = [createStickerData()];
			const mediaItems = [createMediaItem()];
			// Timeline provides explicit timing
			mockTimingMap.set("sticker-1", { startTime: 3, endTime: 12 });

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				TOTAL_DURATION,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			expect(result[0].startTime).toBe(3);
			expect(result[0].endTime).toBe(12);
		});

		it("should handle timeline timing with only startTime offset", async () => {
			const stickers = [createStickerData()];
			const mediaItems = [createMediaItem()];
			// Timeline provides timing starting at 10
			mockTimingMap.set("sticker-1", {
				startTime: 10,
				endTime: TOTAL_DURATION,
			});

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				1920,
				1080,
				TOTAL_DURATION,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			expect(result[0].startTime).toBe(10);
			expect(result[0].endTime).toBe(TOTAL_DURATION);
		});

		it("passes canonical timeline keyframes with the project frame rate", async () => {
			const keyframes: NonNullable<StickerElement["keyframes"]> = {
				x: [
					{
						id: "x-0",
						frame: 0,
						value: 25,
						easing: "linear",
					},
					{
						id: "x-60",
						frame: 60,
						value: 75,
						easing: "linear",
					},
				],
				topLeftX: [
					{
						id: "perspective-0",
						frame: 0,
						value: 0.1,
						easing: "linear",
					},
				],
			};
			mockTimingMap.set("sticker-1", {
				startTime: 5,
				endTime: 7,
				element: {
					id: "element-1",
					name: "Sticker",
					type: "sticker",
					stickerId: "sticker-1",
					mediaId: "media-1",
					startTime: 5,
					duration: 2,
					trimStart: 0,
					trimEnd: 0,
					keyframes,
				},
			});

			const result = await extractStickerSources(
				[createMediaItem()],
				"session-1",
				1920,
				1080,
				TOTAL_DURATION,
				createStoreGetter([createStickerData()]),
				createMockAPI(),
				silentLogger,
				60
			);

			expect(result[0].keyframes).toEqual(keyframes);
			expect(result[0].keyframes?.x?.[0].value).toBe(25);
			expect(result[0].keyframeFps).toBe(60);
		});
	});

	// -----------------------------------------------------------------------
	// Coordinate transformation
	// -----------------------------------------------------------------------

	describe("coordinate transformation", () => {
		it("should convert center-based percentage to top-left pixel coordinates", async () => {
			// Sticker at center (50%, 50%), size 20% x 20%
			// On 1920x1080 canvas:
			//   baseSize = min(1920, 1080) = 1080
			//   pixelW = 20/100 * 1080 = 216
			//   pixelH = 20/100 * 1080 = 216
			//   centerX = 50/100 * 1920 = 960
			//   centerY = 50/100 * 1080 = 540
			//   topLeftX = 960 - 108 = 852
			//   topLeftY = 540 - 108 = 432
			const stickers = [
				createStickerData({
					position: { x: 50, y: 50 },
					size: { width: 20, height: 20 },
				}),
			];
			const mediaItems = [createMediaItem()];

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

			expect(result[0].x).toBe(852);
			expect(result[0].y).toBe(432);
			expect(result[0].width).toBe(216);
			expect(result[0].height).toBe(216);
		});

		it("should use Math.min(canvasW, canvasH) as baseSize for sticker dimensions", async () => {
			// Wide canvas: 3840x1080 → baseSize = 1080
			const stickers = [
				createStickerData({
					size: { width: 10, height: 10 },
				}),
			];
			const mediaItems = [createMediaItem()];

			const result = await extractStickerSources(
				mediaItems,
				"session-1",
				3840,
				1080,
				10,
				createStoreGetter(stickers),
				createMockAPI(),
				silentLogger
			);

			// baseSize = min(3840, 1080) = 1080
			// pixelW = 10/100 * 1080 = 108
			expect(result[0].width).toBe(108);
			expect(result[0].height).toBe(108);
		});

		it("should round pixel coordinates to integers", async () => {
			// Position at 33.33% → fractional pixels
			const stickers = [
				createStickerData({
					position: { x: 33.33, y: 66.67 },
					size: { width: 15, height: 15 },
				}),
			];
			const mediaItems = [createMediaItem()];

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

			// All coordinates should be integers
			expect(Number.isInteger(result[0].x)).toBe(true);
			expect(Number.isInteger(result[0].y)).toBe(true);
			expect(Number.isInteger(result[0].width)).toBe(true);
			expect(Number.isInteger(result[0].height)).toBe(true);
		});
	});
});
