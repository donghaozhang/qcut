import { describe, it, expect } from "vitest";
import {
	ExportFormat,
	isValidGifFrameRate,
	calculateGifDimensions,
	GIF_SIZE_PRESETS,
	GIF_FRAME_RATES,
	DEFAULT_GIF_CONFIG,
} from "../export";

describe("GIF export types", () => {
	describe("ExportFormat", () => {
		it("includes GIF format", () => {
			expect(ExportFormat.GIF).toBe("gif");
		});

		it("preserves existing formats", () => {
			expect(ExportFormat.MP4).toBe("mp4");
			expect(ExportFormat.WEBM).toBe("webm");
			expect(ExportFormat.MOV).toBe("mov");
		});
	});

	describe("isValidGifFrameRate", () => {
		it("accepts valid frame rates", () => {
			expect(isValidGifFrameRate(15)).toBe(true);
			expect(isValidGifFrameRate(20)).toBe(true);
			expect(isValidGifFrameRate(25)).toBe(true);
			expect(isValidGifFrameRate(30)).toBe(true);
		});

		it("rejects invalid frame rates", () => {
			expect(isValidGifFrameRate(10)).toBe(false);
			expect(isValidGifFrameRate(24)).toBe(false);
			expect(isValidGifFrameRate(60)).toBe(false);
		});
	});

	describe("calculateGifDimensions", () => {
		it("returns original dimensions when within preset", () => {
			const dims = calculateGifDimensions(640, 480, "medium");
			expect(dims).toEqual({ width: 640, height: 480 });
		});

		it("scales down to medium preset (720p)", () => {
			const dims = calculateGifDimensions(1920, 1080, "medium");
			expect(dims.height).toBe(720);
			// Width should preserve 16:9 aspect ratio
			expect(dims.width).toBeCloseTo(1280, -1);
		});

		it("returns original for original preset regardless of size", () => {
			const dims = calculateGifDimensions(3840, 2160, "original");
			expect(dims).toEqual({ width: 3840, height: 2160 });
		});

		it("ensures even pixel counts", () => {
			// 1001x1001 source at medium should produce even dimensions
			const dims = calculateGifDimensions(1001, 1001, "medium");
			expect(dims.width % 2).toBe(0);
			expect(dims.height % 2).toBe(0);
		});

		it("preserves aspect ratio", () => {
			const dims = calculateGifDimensions(1920, 1080, "medium");
			const originalRatio = 1920 / 1080;
			const newRatio = dims.width / dims.height;
			expect(Math.abs(originalRatio - newRatio)).toBeLessThan(0.02);
		});
	});

	describe("constants", () => {
		it("has correct GIF size presets", () => {
			expect(GIF_SIZE_PRESETS.medium.maxHeight).toBe(720);
			expect(GIF_SIZE_PRESETS.large.maxHeight).toBe(1080);
			expect(GIF_SIZE_PRESETS.original.maxHeight).toBe(Infinity);
		});

		it("has 4 frame rate options", () => {
			expect(GIF_FRAME_RATES).toHaveLength(4);
		});

		it("has sensible defaults", () => {
			expect(DEFAULT_GIF_CONFIG.frameRate).toBe(20);
			expect(DEFAULT_GIF_CONFIG.loop).toBe(true);
			expect(DEFAULT_GIF_CONFIG.sizePreset).toBe("medium");
			expect(DEFAULT_GIF_CONFIG.quality).toBe(10);
		});
	});
});
