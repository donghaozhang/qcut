import { describe, expect, it } from "vitest";
import {
	normalizeScreenRecordingQualityPreset,
	resolveContainedCaptureRect,
	resolveScreenRecordingQuality,
} from "../screen-recording-quality";

describe("screen recording quality", () => {
	it("uses a full-HD capture profile for 1080p", () => {
		expect(
			resolveScreenRecordingQuality({
				width: 1920,
				height: 1080,
				frameRate: 30,
			})
		).toEqual({
			sourceWidth: 1920,
			sourceHeight: 1080,
			width: 1920,
			height: 1080,
			frameRate: 30,
			videoBitsPerSecond: 14_000_000,
			meetsFullHd: true,
			isUpscaled: false,
		});
	});

	it("gives a Retina 1440p capture enough bitrate for detailed UI", () => {
		expect(
			resolveScreenRecordingQuality({
				width: 2560,
				height: 1440,
				frameRate: 30,
			})
		).toMatchObject({
			videoBitsPerSecond: 24_000_000,
			meetsFullHd: true,
		});
	});

	it("reports captures below full HD without pretending upscaling adds detail", () => {
		expect(
			resolveScreenRecordingQuality({
				width: 1280,
				height: 720,
				preset: "1080p",
			})
		).toMatchObject({
			width: 1920,
			height: 1080,
			videoBitsPerSecond: 14_000_000,
			meetsFullHd: false,
			isUpscaled: true,
		});
	});

	it("scales bitrate for frame rates above 30 fps", () => {
		expect(
			resolveScreenRecordingQuality({
				width: 1920,
				height: 1080,
				frameRate: 60,
			}).videoBitsPerSecond
		).toBe(28_000_000);
	});

	it("downscales a native 1440p capture to a requested 1080p output", () => {
		expect(
			resolveScreenRecordingQuality({
				width: 2560,
				height: 1440,
				preset: "1080p",
			})
		).toMatchObject({
			sourceWidth: 2560,
			sourceHeight: 1440,
			width: 1920,
			height: 1080,
			isUpscaled: false,
		});
	});

	it("normalizes user-facing 2K and 4K aliases", () => {
		expect(normalizeScreenRecordingQualityPreset({ value: "2K" })).toBe(
			"1440p"
		);
		expect(normalizeScreenRecordingQualityPreset({ value: "4k" })).toBe(
			"2160p"
		);
		expect(normalizeScreenRecordingQualityPreset({ value: "auto" })).toBe(
			"native"
		);
	});

	it("rejects unknown quality values", () => {
		expect(() =>
			normalizeScreenRecordingQualityPreset({ value: "8k" })
		).toThrow('Unsupported recording quality "8k"');
	});

	it("letterboxes a non-16:9 capture without stretching it", () => {
		expect(
			resolveContainedCaptureRect({
				sourceWidth: 2048,
				sourceHeight: 1048,
				outputWidth: 1920,
				outputHeight: 1080,
			})
		).toEqual({
			x: 0,
			y: 48.75,
			width: 1920,
			height: 982.5,
		});
	});
});
