import { describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../../apps/web/src/lib/color/color-properties";
import { transformColorPixel } from "../../apps/web/src/lib/color/color-pixel-processor";
import type { ColorCubeLut } from "../../apps/web/src/types/timeline";
import { __buildAdjustedCubeForParity } from "../ffmpeg/color-lut-file";
import { sampleCube } from "../native-pipeline/filters/filter-lab-lut";

function buildCube({
	size,
	transform,
}: {
	size: number;
	transform: ({
		red,
		green,
		blue,
	}: {
		red: number;
		green: number;
		blue: number;
	}) => [number, number, number];
}): ColorCubeLut {
	const values: number[] = [];
	for (let blue = 0; blue < size; blue += 1) {
		for (let green = 0; green < size; green += 1) {
			for (let red = 0; red < size; red += 1) {
				values.push(
					...transform({
						red: red / (size - 1),
						green: green / (size - 1),
						blue: blue / (size - 1),
					})
				);
			}
		}
	}
	return {
		size,
		domainMin: [0, 0, 0],
		domainMax: [1, 1, 1],
		values,
	};
}

describe("dual LUT browser/native parity", () => {
	// The real FFmpeg bake can exceed the 5s default on loaded CI runners.
	it(
		"keeps the FFmpeg bake aligned with browser skin-mask blending",
		{ timeout: 30_000 },
		() => {
			const background = buildCube({
				size: 5,
				transform: ({ red, green, blue }) => [
					Math.min(1, red * 0.88 + 0.04),
					Math.min(1, green * 1.04),
					Math.min(1, blue * 1.08),
				],
			});
			const skin = buildCube({
				size: 7,
				transform: ({ red, green, blue }) => [
					Math.min(1, red * 1.06 + 0.02),
					Math.min(1, green * 1.01 + 0.01),
					blue * 0.94,
				],
			});
			const settings = structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS);
			settings.basic.enabled = false;
			settings.lut = {
				enabled: true,
				presetId: "custom",
				name: "Dual parity",
				intensity: 78,
				skinProtection: 0,
				cube: background,
				dual: { skinCube: skin, maskKind: "skin-tone-v1" },
			};
			const nativeCube = __buildAdjustedCubeForParity({
				cube: background,
				dual: settings.lut.dual,
				intensity: settings.lut.intensity,
				skinProtection: 0,
			});
			let worst = 0;
			for (let red = 0; red < 9; red += 1) {
				for (let green = 0; green < 9; green += 1) {
					for (let blue = 0; blue < 9; blue += 1) {
						const color = {
							r: red / 8,
							g: green / 8,
							b: blue / 8,
						};
						const browser = transformColorPixel({ color, settings });
						const native = sampleCube({
							cube: {
								size: nativeCube.size,
								values: Float64Array.from(nativeCube.values),
							},
							red: color.r,
							green: color.g,
							blue: color.b,
						});
						worst = Math.max(
							worst,
							Math.abs(browser.r - (native[0] ?? 0)),
							Math.abs(browser.g - (native[1] ?? 0)),
							Math.abs(browser.b - (native[2] ?? 0))
						);
					}
				}
			}
			expect(worst).toBeLessThan(0.004);
		}
	);
});
