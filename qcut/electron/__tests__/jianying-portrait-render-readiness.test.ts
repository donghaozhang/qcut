// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
	isUnexpectedlyBlankPortraitFrame,
	renderUntilOutputChanges,
} from "../jianying-portrait-adjustment-runtime/render-readiness.js";

function rgbaFrame({
	color,
	pixels = 100,
}: {
	color: [number, number, number, number];
	pixels?: number;
}): Uint8Array {
	const rgba = new Uint8Array(pixels * 4);
	for (let pixel = 0; pixel < pixels; pixel += 1) {
		rgba.set(color, pixel * 4);
	}
	return rgba;
}

describe("Jianying portrait render readiness", () => {
	it("rejects a blank native result for a visible source frame", () => {
		expect(
			isUnexpectedlyBlankPortraitFrame({
				input: rgbaFrame({ color: [120, 80, 60, 255] }),
				output: rgbaFrame({ color: [0, 0, 0, 255] }),
			})
		).toBe(true);
	});

	it("allows intentional black source frames and visible native results", () => {
		const black = rgbaFrame({ color: [0, 0, 0, 255] });
		const visible = rgbaFrame({ color: [120, 80, 60, 255] });
		expect(
			isUnexpectedlyBlankPortraitFrame({ input: black, output: black })
		).toBe(false);
		expect(
			isUnexpectedlyBlankPortraitFrame({ input: visible, output: visible })
		).toBe(false);
	});

	it("rejects a native result with the wrong byte length", () => {
		expect(
			isUnexpectedlyBlankPortraitFrame({
				input: rgbaFrame({ color: [120, 80, 60, 255] }),
				output: new Uint8Array(),
			})
		).toBe(true);
	});

	it("returns immediately when the first render produces pixels", async () => {
		const renderAttempt = vi.fn(async () => undefined);
		const isOutputChanged = vi.fn(async () => true);

		const attempts = await renderUntilOutputChanges({
			renderAttempt,
			isOutputChanged,
			maxAttempts: 8,
		});

		expect(attempts).toBe(1);
		expect(renderAttempt).toHaveBeenCalledTimes(1);
	});

	it("pumps passthrough frames until asynchronous output is ready", async () => {
		const renderAttempt = vi.fn(async () => undefined);
		const isOutputChanged = vi
			.fn<() => Promise<boolean>>()
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);

		const attempts = await renderUntilOutputChanges({
			renderAttempt,
			isOutputChanged,
			maxAttempts: 8,
		});

		expect(attempts).toBe(3);
		expect(renderAttempt).toHaveBeenNthCalledWith(1, { attempt: 1 });
		expect(renderAttempt).toHaveBeenNthCalledWith(3, { attempt: 3 });
	});

	it("stops at the cap when a source legitimately needs no correction", async () => {
		const renderAttempt = vi.fn(async () => undefined);
		const isOutputChanged = vi.fn(async () => false);

		const attempts = await renderUntilOutputChanges({
			renderAttempt,
			isOutputChanged,
			maxAttempts: 4,
		});

		expect(attempts).toBe(4);
		expect(renderAttempt).toHaveBeenCalledTimes(4);
		expect(isOutputChanged).toHaveBeenCalledTimes(4);
	});
});
