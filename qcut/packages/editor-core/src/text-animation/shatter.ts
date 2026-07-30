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
 * Ports LumiDust's vertex math (evidence:
 * docs/task/text-particle-pipeline/evidence/lumidust-particle.vert.metal):
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
	const size = Math.max(2, Math.round(state.tilePx));
	const columns = Math.max(1, Math.ceil(width / size));
	const rows = Math.max(1, Math.ceil(height / size));
	const tiles: ShatterTile[] = [];
	const gravityAngle = (state.gravityRotDeg * Math.PI) / 180;
	const gravityX = Math.sin(gravityAngle) * state.gravityPx;
	const gravityY = -Math.cos(gravityAngle) * -state.gravityPx;
	const frontAngle = (state.frontRotDeg * Math.PI) / 180;
	const feather = Math.max(0.001, state.feather);

	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			const u = (column + 0.5) / columns;
			const v = (row + 0.5) / rows;
			// Dissolve front position for this tile in [0, 1].
			const site =
				state.front === "wipe"
					? (u - 0.5) * Math.cos(frontAngle) +
						(v - 0.5) * Math.sin(frontAngle) +
						0.5
					: shatterNoise({ x: column, y: row, seed: state.seed, channel: 0 });
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
