import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	html2canvas: vi.fn(),
}));

vi.mock("html2canvas", () => ({
	default: mocks.html2canvas,
}));

import { captureFrameToCanvas, captureWithFallback } from "../canvas-utils";

describe("canvas frame capture", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		{ width: 0, height: 100 },
		{ width: 100, height: 0 },
		{ width: -1, height: 100 },
		{ width: Number.NaN, height: 100 },
		{ width: 100, height: Number.POSITIVE_INFINITY },
	])("skips invalid capture dimensions: $width x $height", async (options) => {
		const element = document.createElement("div");

		await expect(captureFrameToCanvas(element, options)).resolves.toBeNull();
		await expect(captureWithFallback(element, options)).resolves.toBeNull();
		expect(mocks.html2canvas).not.toHaveBeenCalled();
	});

	it("captures image data for a drawable area", async () => {
		const imageData = {
			data: new Uint8ClampedArray(100 * 50 * 4),
			width: 100,
			height: 50,
			colorSpace: "srgb",
		} as ImageData;
		const getImageData = vi.fn(() => imageData);
		mocks.html2canvas.mockResolvedValue({
			getContext: vi.fn(() => ({ getImageData })),
		});

		const result = await captureFrameToCanvas(document.createElement("div"), {
			width: 100,
			height: 50,
		});

		expect(result).toBe(imageData);
		expect(mocks.html2canvas).toHaveBeenCalledOnce();
		expect(getImageData).toHaveBeenCalledWith(0, 0, 100, 50);
	});
});
