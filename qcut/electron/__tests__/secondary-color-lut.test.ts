import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_VIDEO_COLOR_SETTINGS } from "../ffmpeg/color-settings";
import {
	applySecondaryColorCurves,
	materializeSecondaryColorLut,
} from "../ffmpeg/secondary-color-lut";
import {
	applySecondaryCurves,
	buildSecondaryCurve,
} from "../../apps/web/src/lib/color/color-secondary-curves";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../../apps/web/src/lib/color/color-properties";

function peakedSamples(): number[] {
	return Array.from({ length: 257 }, (_, index) => {
		const distance = Math.abs(index / 256 - 0.5);
		return 0.5 + Math.max(0, 1 - distance / 0.1) * 0.25;
	});
}

describe("secondary color LUT", () => {
	it("uses the renderer-provided samples for the exported transform", () => {
		const settings = structuredClone(
			DEFAULT_VIDEO_COLOR_SETTINGS.secondaryCurves
		);
		settings.hueVsSaturation.samples = peakedSamples();
		const result = applySecondaryColorCurves({
			color: { r: 0.3, g: 0.7, b: 0.7 },
			settings,
			mix: 100,
		});
		expect(result).not.toEqual({ r: 0.3, g: 0.7, b: 0.7 });
	});

	it("materializes and reuses a tetrahedral-compatible cube file", () => {
		const settings = structuredClone(
			DEFAULT_VIDEO_COLOR_SETTINGS.secondaryCurves
		);
		settings.hueVsHue.samples = peakedSamples();
		const first = materializeSecondaryColorLut({ settings });
		const second = materializeSecondaryColorLut({ settings });
		expect(first).toBe(second);
		expect(existsSync(first)).toBe(true);
		const content = readFileSync(first, "utf8");
		expect(content).toContain("LUT_3D_SIZE 33");
		expect(content.split("\n")).toHaveLength(33 ** 3 + 5);
	});

	it("matches the browser transform before LUT interpolation", () => {
		const browserSettings = structuredClone(
			DEFAULT_MEDIA_COLOR_SETTINGS.secondaryCurves
		);
		browserSettings.enabled = true;
		browserSettings.mix = 63;
		browserSettings.hueVsHue = buildSecondaryCurve({
			points: [
				{ id: "start", x: 0, y: 0.5 },
				{ id: "cyan", x: 0.5, y: 0.68 },
				{ id: "end", x: 1, y: 0.5 },
			],
		});
		browserSettings.luminanceVsSaturation = buildSecondaryCurve({
			points: [
				{ id: "black", x: 0, y: 0.5 },
				{ id: "middle", x: 0.5, y: 0.72 },
				{ id: "white", x: 1, y: 0.5 },
			],
		});
		const nativeSettings = structuredClone(
			DEFAULT_VIDEO_COLOR_SETTINGS.secondaryCurves
		);
		Object.assign(nativeSettings, browserSettings);
		for (const color of [
			{ r: 0.12, g: 0.44, b: 0.81 },
			{ r: 0.74, g: 0.31, b: 0.22 },
			{ r: 0.48, g: 0.52, b: 0.16 },
		]) {
			const browser = applySecondaryCurves({
				color,
				settings: browserSettings,
			});
			const native = applySecondaryColorCurves({
				color,
				settings: nativeSettings,
				mix: browserSettings.mix,
			});
			expect(native.r).toBeCloseTo(browser.r, 10);
			expect(native.g).toBeCloseTo(browser.g, 10);
			expect(native.b).toBeCloseTo(browser.b, 10);
		}
	});
});
