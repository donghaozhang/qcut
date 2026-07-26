import { describe, expect, it, vi } from "vitest";
import { drawColorScope } from "../color-scopes";

function createStubCanvas() {
	const context = {
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 0,
		font: "",
		fillRect: vi.fn(),
		beginPath: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		stroke: vi.fn(),
		arc: vi.fn(),
		fillText: vi.fn(),
	};
	const canvas = {
		width: 0,
		height: 0,
		getContext: vi.fn(() => context),
	};
	return { canvas: canvas as unknown as HTMLCanvasElement, context };
}

function createImageData(width: number, height: number): ImageData {
	return {
		width,
		height,
		data: new Uint8ClampedArray(width * height * 4),
		colorSpace: "srgb",
	} as ImageData;
}

describe("drawColorScope", () => {
	it("keeps the legacy 360x210 backing store by default", () => {
		const { canvas } = createStubCanvas();
		drawColorScope({
			canvas,
			imageData: createImageData(8, 8),
			mode: "parade",
		});
		expect(canvas.width).toBe(360);
		expect(canvas.height).toBe(210);
	});

	it("accepts caller-provided dimensions for dock tiles", () => {
		const { canvas } = createStubCanvas();
		drawColorScope({
			canvas,
			imageData: createImageData(8, 8),
			mode: "waveform",
			width: 480,
			height: 160,
		});
		expect(canvas.width).toBe(480);
		expect(canvas.height).toBe(160);
	});

	it("renders every scope mode without touching the DOM", () => {
		for (const mode of [
			"histogram",
			"waveform",
			"vectorscope",
			"parade",
		] as const) {
			const { canvas, context } = createStubCanvas();
			drawColorScope({
				canvas,
				imageData: createImageData(4, 4),
				mode,
			});
			expect(context.fillRect).toHaveBeenCalled();
		}
	});
});
