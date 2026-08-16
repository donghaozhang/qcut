import type { TextAnimationRasterEffectState } from "@qcut/editor-core";
import { acquireTextAnimationRaster } from "./text-animation-canvas-raster";
import type { CanvasTextContext } from "./text-canvas-primitives";

/**
 * Raster post-passes: the portable stand-in for Jianying's fragment-shader
 * stages that work on the rendered text image rather than on per-unit
 * transforms. Each takes the block's offscreen raster and redraws it into the
 * destination context, so they compose with whatever transform the caller has
 * already applied.
 *
 * All three are block-scale sampling operations built from `drawImage`, which
 * keeps them portable across the preview canvas and the export bake without a
 * second (WebGL) pipeline.
 */

/** Deterministic value noise in [-1, 1]; smooth in x, y and evolution. */
function valueNoise({
	x,
	y,
	evolution,
}: {
	x: number;
	y: number;
	evolution: number;
}): number {
	const hash = (i: number, j: number, k: number) => {
		let state =
			(Math.imul(i, 0x9e37_79b1) ^
				Math.imul(j, 0x85eb_ca77) ^
				Math.imul(k, 0xc2b2_ae3d)) >>>
			0;
		state ^= state >>> 15;
		state = Math.imul(state, 0x2c1b_3c6d);
		state ^= state >>> 12;
		return (state >>> 0) / 0xffff_ffff;
	};
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const k0 = Math.floor(evolution);
	const fx = x - x0;
	const fy = y - y0;
	const smooth = (t: number) => t * t * (3 - 2 * t);
	const sx = smooth(fx);
	const sy = smooth(fy);
	const mix = (a: number, b: number, t: number) => a + (b - a) * t;
	const top = mix(hash(x0, y0, k0), hash(x0 + 1, y0, k0), sx);
	const bottom = mix(hash(x0, y0 + 1, k0), hash(x0 + 1, y0 + 1, k0), sx);
	return mix(top, bottom, sy) * 2 - 1;
}

function drawPixelated({
	ctx,
	source,
	width,
	height,
	dx,
	dy,
	cell,
}: {
	ctx: CanvasTextContext;
	source: CanvasImageSource;
	width: number;
	height: number;
	dx: number;
	dy: number;
	cell: number;
}): void {
	// Downscale then upscale with smoothing off — the cheapest exact mosaic.
	const small = acquireTextAnimationRaster({
		channel: "post-scratch",
		width: Math.max(1, Math.ceil(width / cell)),
		height: Math.max(1, Math.ceil(height / cell)),
	});
	if (!small) {
		ctx.drawImage(source, dx, dy, width, height);
		return;
	}
	small.ctx.clearRect(0, 0, small.width, small.height);
	small.ctx.imageSmoothingEnabled = true;
	small.ctx.drawImage(source, 0, 0, small.width, small.height);
	const previous = ctx.imageSmoothingEnabled;
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(
		small.canvas as CanvasImageSource,
		0,
		0,
		small.width,
		small.height,
		dx,
		dy,
		width,
		height
	);
	ctx.imageSmoothingEnabled = previous;
}

function drawRgbSplit({
	ctx,
	source,
	width,
	height,
	dx,
	dy,
	offsetPx,
	angleDeg,
}: {
	ctx: CanvasTextContext;
	source: CanvasImageSource;
	width: number;
	height: number;
	dx: number;
	dy: number;
	offsetPx: number;
	angleDeg: number;
}): void {
	const radians = (angleDeg * Math.PI) / 180;
	const ox = Math.cos(radians) * offsetPx;
	const oy = Math.sin(radians) * offsetPx;
	// Additive channel isolation: tint a copy to pure red / cyan and screen
	// them back together, which reads as chromatic aberration without needing
	// per-channel pixel access.
	const tinted = ({
		color,
		shiftX,
		shiftY,
	}: {
		color: string;
		shiftX: number;
		shiftY: number;
	}) => {
		const scratch = acquireTextAnimationRaster({
			channel: "post-scratch",
			width,
			height,
		});
		if (!scratch) return;
		scratch.ctx.clearRect(0, 0, width, height);
		scratch.ctx.globalCompositeOperation = "source-over";
		scratch.ctx.drawImage(source, 0, 0, width, height);
		scratch.ctx.globalCompositeOperation = "multiply";
		scratch.ctx.fillStyle = color;
		scratch.ctx.fillRect(0, 0, width, height);
		// Keep the glyph silhouette after the flat multiply fill.
		scratch.ctx.globalCompositeOperation = "destination-in";
		scratch.ctx.drawImage(source, 0, 0, width, height);
		scratch.ctx.globalCompositeOperation = "source-over";
		ctx.drawImage(
			scratch.canvas as CanvasImageSource,
			dx + shiftX,
			dy + shiftY
		);
	};
	const previousOp = ctx.globalCompositeOperation;
	ctx.globalCompositeOperation = "lighter";
	tinted({ color: "#ff0000", shiftX: -ox, shiftY: -oy });
	tinted({ color: "#00ffff", shiftX: ox, shiftY: oy });
	ctx.globalCompositeOperation = previousOp;
}

function drawDisplaced({
	ctx,
	source,
	width,
	height,
	dx,
	dy,
	amplitudePx,
	scale,
	evolution,
}: {
	ctx: CanvasTextContext;
	source: CanvasImageSource;
	width: number;
	height: number;
	dx: number;
	dy: number;
	amplitudePx: number;
	scale: number;
	evolution: number;
}): void {
	// Slice the raster into bands and offset each by the noise field. Bands
	// rather than pixels keeps this a drawImage loop (fast, and identical in
	// the export bake) while still reading as a boil or ripple.
	const band = Math.max(2, Math.min(24, Math.round(scale / 2)));
	const columns = Math.ceil(width / band);
	const rows = Math.ceil(height / band);
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const sx = column * band;
			const sy = row * band;
			const sw = Math.min(band, width - sx);
			const sh = Math.min(band, height - sy);
			if (sw <= 0 || sh <= 0) continue;
			const offsetX =
				valueNoise({ x: sx / scale, y: sy / scale, evolution }) * amplitudePx;
			const offsetY =
				valueNoise({
					x: sx / scale + 37.1,
					y: sy / scale + 11.7,
					evolution,
				}) * amplitudePx;
			ctx.drawImage(
				source,
				sx,
				sy,
				sw,
				sh,
				dx + sx + offsetX,
				dy + sy + offsetY,
				sw,
				sh
			);
		}
	}
}

/**
 * Apply a raster post-pass. `source` is the block already drawn to an
 * offscreen canvas of `width` × `height`; the result lands at (`dx`, `dy`) in
 * `ctx`. Returns false when the pass could not run, so callers fall back to
 * drawing the raster untouched.
 */
export function applyTextAnimationRasterPass({
	ctx,
	source,
	width,
	height,
	dx,
	dy,
	raster,
}: {
	ctx: CanvasTextContext;
	source: CanvasImageSource;
	width: number;
	height: number;
	dx: number;
	dy: number;
	raster: TextAnimationRasterEffectState;
}): boolean {
	if (raster.kind === "pixelate") {
		const cell = Math.max(1, raster.cell ?? 1);
		if (cell <= 1) return false;
		drawPixelated({ ctx, source, width, height, dx, dy, cell });
		return true;
	}
	if (raster.kind === "rgbSplit") {
		const offsetPx = raster.offsetPx ?? 0;
		if (Math.abs(offsetPx) < 0.01) return false;
		drawRgbSplit({
			ctx,
			source,
			width,
			height,
			dx,
			dy,
			offsetPx,
			angleDeg: raster.angleDeg ?? 0,
		});
		return true;
	}
	const amplitudePx = raster.amplitudePx ?? 0;
	if (Math.abs(amplitudePx) < 0.01) return false;
	drawDisplaced({
		ctx,
		source,
		width,
		height,
		dx,
		dy,
		amplitudePx,
		scale: Math.max(1, raster.scale ?? 24),
		evolution: raster.evolution ?? 0,
	});
	return true;
}
