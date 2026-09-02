import { describe, expect, it } from "vitest";
import {
	CANVAS_PRESET_MATCH_TOLERANCE,
	DEFAULT_CANVAS_PRESETS,
	findBestCanvasPreset,
	findCanvasPresetByName,
} from "../canvas-presets.js";

describe("findBestCanvasPreset", () => {
	it("keeps the snap tolerance tight enough to tell 4:5 from 3:4", () => {
		expect(CANVAS_PRESET_MATCH_TOLERANCE).toBe(0.02);
	});

	it.each([
		["16:9 source", 1920 / 1080, { width: 1920, height: 1080 }],
		["9:16 source", 1080 / 1920, { width: 1080, height: 1920 }],
		["3:4 portrait", 1080 / 1440, { width: 1080, height: 1440 }],
		["1:2 tall", 1080 / 2160, { width: 1080, height: 2160 }],
		["2:1 univisium", 2000 / 1000, { width: 1920, height: 960 }],
		["1.85:1 flat", 1998 / 1080, { width: 1920, height: 1038 }],
		["iPhone 9:19.5 panel", 1170 / 2532, { width: 1080, height: 2340 }],
		["21:9 ultrawide", 21 / 9, { width: 1920, height: 816 }],
	])("snaps %s to the catalog", (_label, ratio, expected) => {
		expect(findBestCanvasPreset({ aspectRatio: ratio })).toEqual(expected);
	});

	it.each([
		["Instagram 4:5", 1080 / 1350, { width: 864, height: 1080 }],
		["DCI 2.39:1", 2048 / 858, { width: 1920, height: 804 }],
		["academy 1.375:1", 1.375, { width: 1920, height: 1396 }],
	])("keeps %s at its exact custom size", (_label, ratio, expected) => {
		expect(findBestCanvasPreset({ aspectRatio: ratio })).toEqual(expected);
	});

	it.each([
		["DCI 4K 4096×2160", 4096 / 2160, { width: 1920, height: 1012 }],
		["link image 1200×628", 1200 / 628, { width: 1920, height: 1004 }],
		["tall 571×1080", 571 / 1080, { width: 572, height: 1080 }],
	])("rounds the custom size for %s to even dimensions", (_label, ratio, expected) => {
		const size = findBestCanvasPreset({ aspectRatio: ratio });
		expect(size).toEqual(expected);
		expect(size.width % 2).toBe(0);
		expect(size.height % 2).toBe(0);
	});

	it("honours a caller-supplied catalog", () => {
		const square = [{ name: "1:1", width: 720, height: 720 }];
		expect(findBestCanvasPreset({ aspectRatio: 1, presets: square })).toEqual({
			width: 720,
			height: 720,
		});
	});

	it("treats an empty catalog as no match instead of throwing", () => {
		expect(findBestCanvasPreset({ aspectRatio: 16 / 9, presets: [] })).toEqual({
			width: 1920,
			height: 1080,
		});
		expect(findBestCanvasPreset({ aspectRatio: 0.5, presets: [] })).toEqual({
			width: 540,
			height: 1080,
		});
	});
});

describe("findCanvasPresetByName", () => {
	it("resolves every catalog name to itself", () => {
		for (const preset of DEFAULT_CANVAS_PRESETS) {
			expect(findCanvasPresetByName({ name: preset.name })).toBe(preset);
		}
	});

	it("accepts aliases, fullwidth colons and stray whitespace", () => {
		const phone = findCanvasPresetByName({ name: "9:19.5" });
		expect(findCanvasPresetByName({ name: "5.8寸" })).toBe(phone);
		expect(findCanvasPresetByName({ name: "5.8-inch" })).toBe(phone);
		expect(findCanvasPresetByName({ name: " 9：16 " })?.name).toBe("9:16");
		expect(findCanvasPresetByName({ name: "16 : 9" })?.name).toBe("16:9");
	});

	it("rejects unknown names and empty input", () => {
		expect(findCanvasPresetByName({ name: "4:5" })).toBeUndefined();
		expect(findCanvasPresetByName({ name: "1080x1920" })).toBeUndefined();
		expect(findCanvasPresetByName({ name: "" })).toBeUndefined();
	});
});
