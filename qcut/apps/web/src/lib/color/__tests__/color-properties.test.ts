import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import {
	DEFAULT_MEDIA_COLOR_SETTINGS,
	buildLegacyColorAdjustments,
	normalizeMediaColorSettings,
	resolveMediaColorAtTime,
} from "../color-properties";

function mediaElement(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "media-1",
		name: "Media",
		type: "media",
		mediaId: "source-1",
		startTime: 2,
		duration: 4,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

describe("color properties", () => {
	it("migrates legacy adjustments into the canonical basic module", () => {
		const settings = normalizeMediaColorSettings({
			element: mediaElement({
				adjustments: {
					brightness: 14,
					contrast: -8,
					saturation: 20,
					temperature: 9,
					tint: -4,
					sharpness: 12,
					fade: 6,
					vignette: 18,
				},
			}),
		});
		expect(settings.basic).toMatchObject({
			brightness: 14,
			contrast: -8,
			saturation: 20,
			temperature: 9,
			tint: -4,
			sharpness: 12,
			fade: 6,
			vignette: 18,
			vibrance: 0,
		});
		expect(buildLegacyColorAdjustments({ settings })).toEqual({
			brightness: 14,
			contrast: -8,
			saturation: 20,
			temperature: 9,
			tint: -4,
			sharpness: 12,
			fade: 6,
			vignette: 18,
		});
	});

	it("deep-normalizes partial advanced modules", () => {
		const settings = normalizeMediaColorSettings({
			element: mediaElement({
				color: {
					...DEFAULT_MEDIA_COLOR_SETTINGS,
					hsl: {
						enabled: true,
						ranges: {
							...DEFAULT_MEDIA_COLOR_SETTINGS.hsl.ranges,
							red: { hue: 15, saturation: 0, luminance: 0 },
						},
					},
				},
			}),
		});
		expect(settings.hsl.ranges.red.hue).toBe(15);
		expect(settings.hsl.ranges.cyan).toEqual({
			hue: 0,
			saturation: 0,
			luminance: 0,
		});
		expect(settings.curves.master).not.toBe(
			DEFAULT_MEDIA_COLOR_SETTINGS.curves.master
		);
		expect(settings.wheels).toMatchObject({
			strength: 100,
			offset: { x: 0, y: 0, luminance: 0 },
		});
	});

	it("interpolates canonical color keyframes at the local timeline frame", () => {
		const settings = resolveMediaColorAtTime({
			element: mediaElement({
				color: {
					...structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
					keyframes: {
						"basic.exposure": [
							{ id: "a", frame: 0, value: 0, easing: "linear" },
							{ id: "b", frame: 30, value: 2, easing: "linear" },
						],
						"hsl.red.saturation": [
							{ id: "c", frame: 0, value: -20, easing: "linear" },
							{ id: "d", frame: 30, value: 20, easing: "linear" },
						],
						"wheels.strength": [
							{ id: "e", frame: 0, value: 0, easing: "linear" },
							{ id: "f", frame: 30, value: 100, easing: "linear" },
						],
						"wheels.offset.x": [
							{ id: "g", frame: 0, value: 0, easing: "linear" },
							{ id: "h", frame: 30, value: 0.2, easing: "linear" },
						],
					},
				},
			}),
			currentTime: 2.5,
			fps: 30,
		});
		expect(settings.basic.exposure).toBeCloseTo(1);
		expect(settings.hsl.ranges.red.saturation).toBeCloseTo(0);
		expect(settings.wheels.strength).toBeCloseTo(50);
		expect(settings.wheels.offset.x).toBeCloseTo(0.1);
	});
});
