import { describe, expect, it } from "vitest";
import type { ColorMultiPassSettings } from "@/types/timeline";
import { applyColorMultiPass } from "../multi-pass-pixel-processor";

function settings({
	passes,
}: {
	passes: ColorMultiPassSettings["passes"];
}): ColorMultiPassSettings {
	return {
		enabled: true,
		presetId: "jianying:test:v1",
		name: "Test",
		intensity: 100,
		fidelity: "structural",
		passes,
	};
}

function grayGrid() {
	const pixels = new Uint8ClampedArray(3 * 3 * 4);
	for (let pixel = 0; pixel < 9; pixel += 1) {
		const value = pixel === 4 ? 160 : 80;
		const index = pixel * 4;
		pixels[index] = value;
		pixels[index + 1] = value;
		pixels[index + 2] = value;
		pixels[index + 3] = 255;
	}
	return pixels;
}

function colorGrid({
	width = 7,
	height = 7,
}: {
	width?: number;
	height?: number;
} = {}) {
	const pixels = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = (y * width + x) * 4;
			pixels[index] = x * 30;
			pixels[index + 1] = y * 30;
			pixels[index + 2] = (x + y) * 15;
			pixels[index + 3] = 255;
		}
	}
	const center = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
	pixels[center] = 255;
	pixels[center + 1] = 255;
	pixels[center + 2] = 255;
	return pixels;
}

describe("browser multi-pass renderer", () => {
	it("runs spatial passes rather than treating sharpen as LUT metadata", () => {
		const input = grayGrid();
		const output = applyColorMultiPass({
			data: input,
			width: 3,
			height: 3,
			settings: settings({ passes: [{ kind: "sharpen", amount: 1 }] }),
		});

		expect(output[4 * 4]).toBeGreaterThan(input[4 * 4]);
		expect(output[3]).toBe(255);
	});

	it("blends a blurred branch for fog", () => {
		const input = grayGrid();
		const output = applyColorMultiPass({
			data: input,
			width: 3,
			height: 3,
			settings: settings({
				passes: [{ kind: "fog-blend", radius: 1, amount: 50 }],
			}),
		});

		expect(output[4 * 4]).toBeLessThan(input[4 * 4]);
		expect(output[0]).toBeGreaterThan(input[0]);
	});

	it("returns the original buffer for a disabled recipe", () => {
		const input = grayGrid();
		const disabled = settings({ passes: [{ kind: "sharpen", amount: 1 }] });
		disabled.enabled = false;
		expect(
			applyColorMultiPass({
				data: input,
				width: 3,
				height: 3,
				settings: disabled,
			})
		).toBe(input);
	});

	it("keeps animated grain deterministic per frame and changes across frames", () => {
		const input = colorGrid();
		const recipe = settings({
			passes: [
				{
					kind: "grain-noise",
					amount: 35,
					size: 2,
					seed: 17,
					timeVarying: true,
				},
			],
		});
		const first = applyColorMultiPass({
			data: input,
			width: 7,
			height: 7,
			settings: recipe,
			frameSeed: 12,
		});
		const repeated = applyColorMultiPass({
			data: input,
			width: 7,
			height: 7,
			settings: recipe,
			frameSeed: 12,
		});
		const next = applyColorMultiPass({
			data: input,
			width: 7,
			height: 7,
			settings: recipe,
			frameSeed: 13,
		});

		expect(first).toEqual(repeated);
		expect(first).not.toEqual(next);
		expect(first[3]).toBe(255);
	});

	it("animates a procedural light leak without external package assets", () => {
		const input = colorGrid();
		const recipe = settings({
			passes: [
				{
					kind: "light-leak",
					amount: 60,
					color: [1, 0.25, 0.05],
					centerX: 0.2,
					centerY: 0.4,
					radius: 0.3,
					speed: 0.5,
					timeVarying: true,
				},
			],
		});
		const start = applyColorMultiPass({
			data: input,
			width: 7,
			height: 7,
			settings: recipe,
			timestampSeconds: 0,
		});
		const later = applyColorMultiPass({
			data: input,
			width: 7,
			height: 7,
			settings: recipe,
			timestampSeconds: 0.75,
		});

		expect(start[0]).toBeGreaterThan(input[0]);
		expect(start).not.toEqual(later);
	});

	it("runs bloom through half-resolution float intermediates and mip blur", () => {
		const input = colorGrid({ width: 9, height: 9 });
		const output = applyColorMultiPass({
			data: input,
			width: 9,
			height: 9,
			settings: settings({
				passes: [
					{
						kind: "bloom",
						threshold: 0.7,
						radius: 1,
						amount: 80,
						scale: 0.5,
						pixelFormat: "float16",
						mipLevels: 2,
					},
				],
			}),
		});
		const neighbor = (4 * 9 + 3) * 4;

		expect(output[neighbor]).toBeGreaterThan(input[neighbor]);
		expect(output[neighbor + 1]).toBeGreaterThan(input[neighbor + 1]);
		expect(output[3]).toBe(255);
	});

	it("separates channels and remaps lens coordinates", () => {
		const input = colorGrid();
		const aberrated = applyColorMultiPass({
			data: input,
			width: 7,
			height: 7,
			settings: settings({
				passes: [{ kind: "chromatic-aberration", offset: 2, angle: 0 }],
			}),
		});
		const distorted = applyColorMultiPass({
			data: input,
			width: 7,
			height: 7,
			settings: settings({
				passes: [
					{
						kind: "lens-distortion",
						distortion: 0.6,
						centerX: 0.5,
						centerY: 0.5,
						edgeMode: "mirror",
					},
				],
			}),
		});

		expect(aberrated).not.toEqual(input);
		expect(distorted).not.toEqual(input);
		expect(distorted[3]).toBe(255);
	});
});
