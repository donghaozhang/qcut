import type { TextAnimationShatterState } from "./model.js";

export interface ShatterTile {
	/** Source rect in the rendered text raster, px. */
	sx: number;
	sy: number;
	size: number;
	/** Displacement to apply when drawing, px. */
	dx: number;
	dy: number;
	/** Residual opacity of the tile. */
	alpha: number;
}

/**
 * Deterministic 2D hash in [0, 1), stable across platforms. Plays the role
 * of Jianying's noiseTex sample for a tile.
 */
export function shatterNoise({
	x,
	y,
	seed,
	channel,
}: {
	x: number;
	y: number;
	seed: number;
	channel: number;
}): number {
	let state =
		(seed ^
			Math.imul(x + 1, 0x9e37_79b1) ^
			Math.imul(y + 1, 0x85eb_ca77) ^
			Math.imul(channel + 1, 0xc2b2_ae3d)) >>>
		0;
	state ^= state >>> 16;
	state = Math.imul(state, 0x7feb_352d);
	state ^= state >>> 15;
	state = Math.imul(state, 0x846c_a68b);
	state ^= state >>> 16;
	return (state >>> 0) / 0x1_0000_0000;
}

function smoothstep({
	edge0,
	edge1,
	value,
}: {
	edge0: number;
	edge1: number;
	value: number;
}): number {
	if (edge0 === edge1) return value < edge0 ? 0 : 1;
	const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/**
 * Spatially smooth value noise (bilinear over a hashed lattice). Jianying's
 * dissolve front samples a smooth noise texture, so neighbouring tiles share
 * similar sites and the front advances as coherent blobs — white noise would
 * read as salt-and-pepper instead (verified against the captured 25% frame).
 */
function shatterValueNoise({
	x,
	y,
	seed,
	channel,
}: {
	x: number;
	y: number;
	seed: number;
	channel: number;
}): number {
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const fx = x - x0;
	const fy = y - y0;
	const sx = fx * fx * (3 - 2 * fx);
	const sy = fy * fy * (3 - 2 * fy);
	const n00 = shatterNoise({ x: x0, y: y0, seed, channel });
	const n10 = shatterNoise({ x: x0 + 1, y: y0, seed, channel });
	const n01 = shatterNoise({ x: x0, y: y0 + 1, seed, channel });
	const n11 = shatterNoise({ x: x0 + 1, y: y0 + 1, seed, channel });
	const top = n00 + (n10 - n00) * sx;
	const bottom = n01 + (n11 - n01) * sx;
	return top + (bottom - top) * sy;
}

/**
 * Upper bound on tiles per frame. Each tile is one drawImage call, so a small
 * tilePx on a large raster would otherwise cost tens of thousands of draws per
 * frame; past this budget the effective tile grows so cost stays flat.
 */
const MAX_SHATTER_TILES = 8000;

function shatterGridDimensions({
	width,
	height,
	size,
}: {
	width: number;
	height: number;
	size: number;
}): { columns: number; rows: number } {
	return {
		columns: Math.max(1, Math.ceil(width / size)),
		rows: Math.max(1, Math.ceil(height / size)),
	};
}

function boundedShatterTileSize({
	width,
	height,
	requestedSize,
}: {
	width: number;
	height: number;
	requestedSize: number;
}): number {
	const requestedGrid = shatterGridDimensions({
		width,
		height,
		size: requestedSize,
	});
	if (requestedGrid.columns * requestedGrid.rows <= MAX_SHATTER_TILES) {
		return requestedSize;
	}

	let lower = requestedSize + 1;
	let upper = Math.max(requestedSize, Math.ceil(width), Math.ceil(height));
	while (lower < upper) {
		const candidate = Math.floor((lower + upper) / 2);
		const { columns, rows } = shatterGridDimensions({
			width,
			height,
			size: candidate,
		});
		if (columns * rows <= MAX_SHATTER_TILES) {
			upper = candidate;
		} else {
			lower = candidate + 1;
		}
	}
	return lower;
}

/** Lattice cell size for the dissolve front, in tiles. */
const SHATTER_NOISE_CELL_TILES = 3.5;

/**
 * The reference frames erode glyph tops first and leave baseline mounds for
 * last, so the dissolve site mixes in the tile's vertical position. Fitted at
 * 0.3: stronger reads as a hard top-down wipe, weaker loses the mounds.
 */
const SHATTER_VERTICAL_BIAS = 0.3;

/**
 * Ports the release model described in
 * docs/task/text-particle-pipeline/IMPLEMENTATION.md §1.1 (derived from the
 * reference implementation's published behaviour, transcribed as equations):
 * a tile is released once the dissolve front passes it, then drifts by a
 * seeded noise offset plus rotated gravity, with the reference's
 * anisotropic release powers and alpha falloff.
 */
export function computeShatterTiles({
	width,
	height,
	state,
}: {
	width: number;
	height: number;
	state: TextAnimationShatterState;
}): ShatterTile[] {
	const requestedSize = Math.max(2, Math.round(state.tilePx));
	const size = boundedShatterTileSize({ width, height, requestedSize });
	const { columns, rows } = shatterGridDimensions({ width, height, size });
	const tiles: ShatterTile[] = [];
	const gravityAngle = (state.gravityRotDeg * Math.PI) / 180;
	// gravityRotDeg 0 pushes released dust down the screen, 180 lifts it.
	const gravityX = Math.sin(gravityAngle) * state.gravityPx;
	const gravityY = Math.cos(gravityAngle) * state.gravityPx;
	const frontAngle = (state.frontRotDeg * Math.PI) / 180;
	const feather = Math.max(0.001, state.feather);

	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const u = (column + 0.5) / columns;
			const v = (row + 0.5) / rows;
			// Dissolve front position for this tile in [0, 1].
			const site =
				state.front === "wipe"
					? // Normalised by the projection's own extent: an unscaled dot
						// product spans 0.5 ± (|cos| + |sin|)/2, which overflows
						// [0, 1] off-axis and leaves corners that never dissolve.
						((u - 0.5) * Math.cos(frontAngle) +
							(v - 0.5) * Math.sin(frontAngle)) /
							(Math.abs(Math.cos(frontAngle)) +
								Math.abs(Math.sin(frontAngle))) +
						0.5
					: shatterValueNoise({
							x: column / SHATTER_NOISE_CELL_TILES,
							y: row / SHATTER_NOISE_CELL_TILES,
							seed: state.seed,
							channel: 0,
						}) *
							(1 - SHATTER_VERTICAL_BIAS) +
						v * SHATTER_VERTICAL_BIAS;
			const sweep = state.progress * (1 + feather);
			const retained = smoothstep({
				edge0: sweep - feather,
				edge1: sweep,
				value: site,
			});
			const release = 1 - retained;
			if (release <= 0) {
				tiles.push({
					sx: column * size,
					sy: row * size,
					size,
					dx: 0,
					dy: 0,
					alpha: 1,
				});
				continue;
			}
			const noiseX =
				(shatterNoise({ x: column, y: row, seed: state.seed, channel: 1 }) -
					0.5) *
				2 *
				state.distortionPx;
			const noiseY =
				(shatterNoise({ x: column, y: row, seed: state.seed, channel: 2 }) -
					0.5) *
				2 *
				state.distortionPx;
			tiles.push({
				sx: column * size,
				sy: row * size,
				size,
				// The reference releases horizontal drift slightly ahead of
				// vertical (release^0.9 vs ^1.1).
				dx: (noiseX + gravityX * release) * release ** 0.9,
				dy: (noiseY + gravityY * release) * release ** 1.1,
				alpha: retained ** 0.3,
			});
		}
	}
	return tiles;
}
