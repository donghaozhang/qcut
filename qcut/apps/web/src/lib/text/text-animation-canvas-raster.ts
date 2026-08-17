import type { CanvasTextContext } from "./text-canvas-primitives";

type TextAnimationRasterChannel =
	| "projection"
	| "projection-unit"
	| "shatter"
	| "post"
	| "post-scratch"
	// Ping-pong buffers for chained passes; kept distinct from "post-scratch"
	// because individual passes use that one internally.
	| "post-chain-a"
	| "post-chain-b";

interface TextAnimationRaster {
	canvas: OffscreenCanvas | HTMLCanvasElement;
	ctx: CanvasTextContext;
	height: number;
	width: number;
}

const rasters = new Map<TextAnimationRasterChannel, TextAnimationRaster>();

export function canRasterizeTextAnimation() {
	return (
		typeof OffscreenCanvas !== "undefined" || typeof document !== "undefined"
	);
}

function createRasterCanvas({
	height,
	width,
}: {
	height: number;
	width: number;
}) {
	if (typeof OffscreenCanvas !== "undefined") {
		return new OffscreenCanvas(width, height);
	}
	if (typeof document === "undefined") return null;
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

export function acquireTextAnimationRaster({
	channel,
	height,
	width,
}: {
	channel: TextAnimationRasterChannel;
	height: number;
	width: number;
}): TextAnimationRaster | null {
	const cached = rasters.get(channel);
	if (cached?.width === width && cached.height === height) {
		cached.ctx.clearRect(0, 0, width, height);
		return cached;
	}
	const canvas = createRasterCanvas({ height, width });
	if (!canvas) return null;
	const ctx = canvas.getContext("2d") as CanvasTextContext | null;
	if (!ctx) return null;
	const raster = { canvas, ctx, height, width };
	rasters.set(channel, raster);
	return raster;
}

export function resetTextAnimationRasters(): void {
	rasters.clear();
}
