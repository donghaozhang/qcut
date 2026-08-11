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
});
