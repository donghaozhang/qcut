import { describe, expect, it, vi } from "vitest";
import { drawStickerWithPerspective } from "../sticker-canvas-perspective";
import { DEFAULT_STICKER_PERSPECTIVE } from "../sticker-clip-animation";

function canvasContext() {
	return {
		save: vi.fn(),
		restore: vi.fn(),
		beginPath: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		closePath: vi.fn(),
		clip: vi.fn(),
		transform: vi.fn(),
		drawImage: vi.fn(),
	} as unknown as CanvasRenderingContext2D;
}

describe("sticker canvas perspective", () => {
	it("draws the default rectangle without tessellation", () => {
		const ctx = canvasContext();
		const image = {} as CanvasImageSource;
		drawStickerWithPerspective({
			ctx,
			image,
			sourceWidth: 400,
			sourceHeight: 200,
			width: 200,
			height: 100,
			perspective: DEFAULT_STICKER_PERSPECTIVE,
		});

		expect(ctx.drawImage).toHaveBeenCalledWith(image, -100, -50, 200, 100);
		expect(ctx.transform).not.toHaveBeenCalled();
	});

	it("letterboxes a non-square source when aspect ratio is locked", () => {
		const ctx = canvasContext();
		const image = {} as CanvasImageSource;
		drawStickerWithPerspective({
			ctx,
			image,
			sourceWidth: 400,
			sourceHeight: 200,
			width: 200,
			height: 200,
			perspective: DEFAULT_STICKER_PERSPECTIVE,
			maintainAspectRatio: true,
		});

		expect(ctx.drawImage).toHaveBeenCalledWith(image, -100, -50, 200, 100);
	});

	it("warps a non-default quadrilateral through clipped triangles", () => {
		const ctx = canvasContext();
		drawStickerWithPerspective({
			ctx,
			image: {} as CanvasImageSource,
			sourceWidth: 200,
			sourceHeight: 100,
			width: 100,
			height: 50,
			gridSize: 1,
			perspective: {
				topLeftX: 0.1,
				topLeftY: 0.2,
				topRightX: 0.9,
				topRightY: 0,
				bottomRightX: 1,
				bottomRightY: 0.9,
				bottomLeftX: 0,
				bottomLeftY: 1,
			},
		});

		expect(ctx.transform).toHaveBeenCalledTimes(2);
		expect(ctx.clip).toHaveBeenCalledTimes(2);
		expect(ctx.drawImage).toHaveBeenCalledTimes(2);

		const moveTo = ctx.moveTo as ReturnType<typeof vi.fn>;
		const lineTo = ctx.lineTo as ReturnType<typeof vi.fn>;
		expect(moveTo.mock.calls[0][0]).toBeCloseTo(-40);
		expect(moveTo.mock.calls[0][1]).toBeCloseTo(-15);
		expect(lineTo.mock.calls[0][0]).toBeCloseTo(40);
		expect(lineTo.mock.calls[0][1]).toBeCloseTo(-25);
		expect(lineTo.mock.calls[1][0]).toBeCloseTo(50);
		expect(lineTo.mock.calls[1][1]).toBeCloseTo(20);
		expect(lineTo.mock.calls[3][0]).toBeCloseTo(-50);
		expect(lineTo.mock.calls[3][1]).toBeCloseTo(25);
	});

	it("does not draw invalid dimensions", () => {
		const ctx = canvasContext();
		drawStickerWithPerspective({
			ctx,
			image: {} as CanvasImageSource,
			sourceWidth: 0,
			sourceHeight: 100,
			width: 200,
			height: 100,
			perspective: DEFAULT_STICKER_PERSPECTIVE,
		});

		expect(ctx.drawImage).not.toHaveBeenCalled();
	});
});
