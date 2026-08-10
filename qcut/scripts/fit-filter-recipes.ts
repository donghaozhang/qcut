/**
 * Fits QCut's filter recipe family to reference LUTs and reports how close it
 * can get, measured through the real `transformFilterColor` pipeline.
 *
 * A recipe's `polynomialCorrection` is a complete degree-5 polynomial in
 * (r, g, b) — 56 monomials per channel — and it is applied last, after an
 * otherwise identity chain when no other recipe field is set. So fitting a
 * reference LUT reduces to one linear least-squares solve per channel.
 *
 * Two sample sets go into that solve, and both are needed:
 *   - the committed photographic colour prior, so capacity is spent where real
 *     pixels are dense;
 *   - a uniform cube grid at low weight, because a polynomial fitted only on
 *     photographic colours is unconstrained elsewhere and was measured at ~62
 *     levels of error there — visible the moment a filter meets saturated
 *     graphics.
 *
 * Nothing from the reference cache is copied into QCut; the references are read
 * only to score our own coefficients.
 *
 * Usage: bun run scripts/fit-filter-recipes.ts [--emit <dir>]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { transformFilterColor } from "../apps/web/src/lib/filters/filter-lut";
import type {
	FilterLutRecipe,
	FilterColorMatrix,
} from "../apps/web/src/lib/filters/filter-types";
import { listJianyingLuts } from "../electron/native-pipeline/filters/filter-lab-lut";

interface Cube {
	size: number;
	values: Float64Array;
}
interface Sample {
	r: number;
	g: number;
	b: number;
	weight: number;
}

/**
 * Total influence the uniform grid gets, as a fraction of the photographic
 * corpus mass. Swept over 0 to 1: holdout error is flat between 0.05 and 0.5
 * while out-of-gamut error keeps falling, so this sits at the safe end of the
 * flat region.
 */
const GRID_FRACTION = 0.25;
const GRID_STEPS = 17;
/** Tikhonov term. The monomial basis is collinear on [0,1]; this conditions it. */
const RIDGE = 1e-6;

/** Monomials of total degree <= 5, in the order applyPolynomialCorrection uses. */
function basisExponents(): number[][] {
	const terms: number[][] = [];
	for (let total = 0; total <= 5; total += 1) {
		for (let red = total; red >= 0; red -= 1) {
			for (let green = total - red; green >= 0; green -= 1) {
				terms.push([red, green, total - red - green]);
			}
		}
	}
	return terms;
}

const EXPONENTS = basisExponents();
const N = EXPONENTS.length;

function basisRow({
	r,
	g,
	b,
}: {
	r: number;
	g: number;
	b: number;
}): Float64Array {
	const row = new Float64Array(N);
	for (let index = 0; index < N; index += 1) {
		const [pr, pg, pb] = EXPONENTS[index];
		row[index] = r ** pr * g ** pg * b ** pb;
	}
	return row;
}

function solveNormal({
	ata,
	atb,
}: {
	ata: Float64Array;
	atb: Float64Array;
}): Float64Array {
	const width = N + 3;
	const m = new Float64Array(N * width);
	for (let row = 0; row < N; row += 1) {
		for (let col = 0; col < N; col += 1) {
			m[row * width + col] = ata[row * N + col];
		}
		// The constant term stays unregularised so it can carry the offset.
		if (row > 0) m[row * width + row] += RIDGE;
		for (let channel = 0; channel < 3; channel += 1) {
			m[row * width + N + channel] = atb[row * 3 + channel];
		}
	}
	for (let col = 0; col < N; col += 1) {
		let pivot = col;
		for (let row = col + 1; row < N; row += 1) {
			if (Math.abs(m[row * width + col]) > Math.abs(m[pivot * width + col])) {
				pivot = row;
			}
		}
		if (pivot !== col) {
			for (let k = col; k < width; k += 1) {
				const swap = m[col * width + k];
				m[col * width + k] = m[pivot * width + k];
				m[pivot * width + k] = swap;
			}
		}
		const diagonal = m[col * width + col];
		if (Math.abs(diagonal) < 1e-14) continue;
		for (let row = 0; row < N; row += 1) {
			if (row === col) continue;
			const factor = m[row * width + col] / diagonal;
			if (factor === 0) continue;
			for (let k = col; k < width; k += 1) {
				m[row * width + k] -= factor * m[col * width + k];
			}
		}
	}
	const solution = new Float64Array(N * 3);
	for (let row = 0; row < N; row += 1) {
		const diagonal = m[row * width + row];
		for (let channel = 0; channel < 3; channel += 1) {
			solution[row * 3 + channel] =
				Math.abs(diagonal) < 1e-14
					? 0
					: m[row * width + N + channel] / diagonal;
		}
	}
	return solution;
}

function sampleCube({
	cube,
	r,
	g,
	b,
}: {
	cube: Cube;
	r: number;
	g: number;
	b: number;
}): [number, number, number] {
	const size = cube.size;
	const last = size - 1;
	const position = [
		Math.min(last, Math.max(0, r * last)),
		Math.min(last, Math.max(0, g * last)),
		Math.min(last, Math.max(0, b * last)),
	];
	const base = position.map((value) => Math.min(last - 1, Math.floor(value)));
	const frac = position.map((value, axis) => value - base[axis]);
	const out: [number, number, number] = [0, 0, 0];
	for (let corner = 0; corner < 8; corner += 1) {
		const dr = corner & 1;
		const dg = (corner >> 1) & 1;
		const db = (corner >> 2) & 1;
		const weight =
			(dr ? frac[0] : 1 - frac[0]) *
			(dg ? frac[1] : 1 - frac[1]) *
			(db ? frac[2] : 1 - frac[2]);
		if (weight === 0) continue;
		const index =
			((base[2] + db) * size * size + (base[1] + dg) * size + (base[0] + dr)) *
			3;
		out[0] += weight * cube.values[index];
		out[1] += weight * cube.values[index + 1];
		out[2] += weight * cube.values[index + 2];
	}
	return out;
}

function priorSamples(): Sample[] {
	const path = join(
		import.meta.dir,
		"..",
		"apps",
		"web",
		"src",
		"lib",
		"filters",
		"filter-colour-prior.json"
	);
	const prior = JSON.parse(readFileSync(path, "utf8")) as {
		bins: number;
		histogram: number[][];
	};
	const scale = 1 / prior.bins;
	return prior.histogram.map(([red, green, blue, count]) => ({
		r: (red + 0.5) * scale,
		g: (green + 0.5) * scale,
		b: (blue + 0.5) * scale,
		weight: count,
	}));
}

function gridSamples({ weight }: { weight: number }): Sample[] {
	const out: Sample[] = [];
	for (let blue = 0; blue < GRID_STEPS; blue += 1) {
		for (let green = 0; green < GRID_STEPS; green += 1) {
			for (let red = 0; red < GRID_STEPS; red += 1) {
				out.push({
					r: red / (GRID_STEPS - 1),
					g: green / (GRID_STEPS - 1),
					b: blue / (GRID_STEPS - 1),
					weight,
				});
			}
		}
	}
	return out;
}

function fit({
	samples,
	cube,
}: {
	samples: Sample[];
	cube: Cube;
}): Float64Array {
	const ata = new Float64Array(N * N);
	const atb = new Float64Array(N * 3);
	for (const sample of samples) {
		const row = basisRow(sample);
		const target = sampleCube({ cube, ...sample });
		for (let i = 0; i < N; i += 1) {
			const value = row[i] * sample.weight;
			if (value === 0) continue;
			for (let j = i; j < N; j += 1) ata[i * N + j] += value * row[j];
			for (let c = 0; c < 3; c += 1) atb[i * 3 + c] += value * target[c];
		}
	}
	for (let i = 0; i < N; i += 1) {
		for (let j = 0; j < i; j += 1) ata[i * N + j] = ata[j * N + i];
	}
	return solveNormal({ ata, atb });
}

const round = (value: number) => Number(value.toFixed(4));

/** Packs solved coefficients into the recipe shape the renderer consumes. */
function toRecipe({
	coefficients,
}: {
	coefficients: Float64Array;
}): FilterLutRecipe {
	const at = (index: number): [number, number, number] => [
		round(coefficients[index * 3]),
		round(coefficients[index * 3 + 1]),
		round(coefficients[index * 3 + 2]),
	];
	// Channel-major: each matrix row is one output channel's coefficients.
	const matrix = (indices: number[]): FilterColorMatrix =>
		[0, 1, 2].map((channel) =>
			indices.map((index) => round(coefficients[index * 3 + channel]))
		) as FilterColorMatrix;
	const rows = (indices: number[]): number[][] =>
		[0, 1, 2].map((channel) =>
			indices.map((index) => round(coefficients[index * 3 + channel]))
		);

	// Look each term up by its exponents rather than hand-writing offsets — the
	// generator's ordering within a degree is not the order the recipe fields
	// are declared in, and an off-by-one here is silent.
	const indexOf = (exponents: number[]): number => {
		const key = exponents.join();
		const found = EXPONENTS.findIndex((term) => term.join() === key);
		if (found < 0) throw new Error(`no basis term for ${key}`);
		return found;
	};
	const indicesOfDegree = (degree: number): number[] =>
		EXPONENTS.map((term, index) => ({ term, index }))
			.filter(({ term }) => term[0] + term[1] + term[2] === degree)
			.map(({ index }) => index);

	const squaredIndex = {
		rr: indexOf([2, 0, 0]),
		gg: indexOf([0, 2, 0]),
		bb: indexOf([0, 0, 2]),
	};
	const crossIndex = {
		rg: indexOf([1, 1, 0]),
		rb: indexOf([1, 0, 1]),
		gb: indexOf([0, 1, 1]),
	};
	const cubicPure = {
		rrr: indexOf([3, 0, 0]),
		ggg: indexOf([0, 3, 0]),
		bbb: indexOf([0, 0, 3]),
	};
	const cubicMixed = {
		rrg: indexOf([2, 1, 0]),
		rrb: indexOf([2, 0, 1]),
		ggr: indexOf([1, 2, 0]),
		ggb: indexOf([0, 2, 1]),
		bbr: indexOf([1, 0, 2]),
		bbg: indexOf([0, 1, 2]),
	};
	const cubicTriple = indexOf([1, 1, 1]);

	// The higher-order fields consume a whole degree block in generator order,
	// which is exactly what totalDegreeTerms produces at render time.
	const quartic = indicesOfDegree(4);
	const quintic = indicesOfDegree(5);

	return {
		polynomialCorrection: {
			offset: at(0),
			linear: matrix([1, 2, 3]),
			squared: matrix([squaredIndex.rr, squaredIndex.gg, squaredIndex.bb]),
			cross: matrix([crossIndex.rg, crossIndex.rb, crossIndex.gb]),
			cubic: {
				pure: matrix([cubicPure.rrr, cubicPure.ggg, cubicPure.bbb]),
				mixed: rows([
					cubicMixed.rrg,
					cubicMixed.rrb,
					cubicMixed.ggr,
					cubicMixed.ggb,
					cubicMixed.bbr,
					cubicMixed.bbg,
				]) as never,
				triple: at(cubicTriple),
			},
			higherOrder: {
				quartic: rows(quartic) as never,
				quintic: rows(quintic) as never,
			},
		},
	};
}

/**
 * Scores a recipe by running it through the shipped renderer, not through the
 * fitting maths — this is what catches a basis packed in the wrong order.
 */
function scoreRecipe({
	recipe,
	cube,
	samples,
}: {
	recipe: FilterLutRecipe;
	cube: Cube;
	samples: Sample[];
}) {
	let sum = 0;
	let weight = 0;
	let worst = 0;
	for (const sample of samples) {
		const got = transformFilterColor({
			color: { r: sample.r, g: sample.g, b: sample.b },
			recipe,
		});
		const target = sampleCube({ cube, ...sample });
		const channels = [got.r, got.g, got.b];
		for (let c = 0; c < 3; c += 1) {
			const delta = (channels[c] - target[c]) * 255;
			sum += sample.weight * delta * delta;
			worst = Math.max(worst, Math.abs(delta));
		}
		weight += sample.weight;
	}
	return { rmse: Math.sqrt(sum / (weight * 3)), worst };
}

function stats(values: number[]) {
	const sorted = [...values].sort((left, right) => left - right);
	return {
		median: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
		p90: Number(sorted[Math.floor(sorted.length * 0.9)].toFixed(3)),
		max: Number(sorted[sorted.length - 1].toFixed(3)),
	};
}

/**
 * Refits only the presets whose reference is known by name. Fitting a preset
 * to its nearest-looking reference instead would make it reproduce a different
 * filter precisely, which the aggregate error would report as an improvement.
 */
async function fitMappedPresets({
	mapPath,
	emitPath,
	prior,
	training,
	gridProbe,
}: {
	mapPath: string;
	emitPath: string | null;
	prior: Sample[];
	training: Sample[];
	gridProbe: Sample[];
}) {
	const mapping = JSON.parse(readFileSync(mapPath, "utf8")) as {
		presetId: string;
		localizedName: string;
		resourceId: string;
	}[];
	const references = new Map(
		(await listJianyingLuts()).map((entry) => [entry.resourceId, entry])
	);
	const { FILTER_PRESETS } = await import(
		"../apps/web/src/lib/filters/filter-registry"
	);
	const presetsById = new Map(
		FILTER_PRESETS.map((preset) => [preset.id, preset])
	);

	const rows: {
		presetId: string;
		name: string;
		beforePhoto: number;
		afterPhoto: number;
		beforeGrid: number;
		afterGrid: number;
	}[] = [];
	const emitted: Record<string, FilterLutRecipe> = {};

	for (const entry of mapping) {
		const reference = references.get(entry.resourceId);
		const preset = presetsById.get(entry.presetId);
		if (!reference || !preset) continue;
		const cube = reference.cube as Cube;
		const fitted = toRecipe({ coefficients: fit({ samples: training, cube }) });
		emitted[entry.presetId] = fitted;
		rows.push({
			presetId: entry.presetId,
			name: entry.localizedName,
			beforePhoto: scoreRecipe({ recipe: preset.recipe, cube, samples: prior })
				.rmse,
			afterPhoto: scoreRecipe({ recipe: fitted, cube, samples: prior }).rmse,
			beforeGrid: scoreRecipe({
				recipe: preset.recipe,
				cube,
				samples: gridProbe,
			}).rmse,
			afterGrid: scoreRecipe({ recipe: fitted, cube, samples: gridProbe }).rmse,
		});
	}

	rows.sort((left, right) => right.beforePhoto - left.beforePhoto);
	console.log(
		JSON.stringify(
			{
				refitted: rows.length,
				photographicColours: {
					before: stats(rows.map((row) => row.beforePhoto)),
					after: stats(rows.map((row) => row.afterPhoto)),
				},
				uniformGrid: {
					before: stats(rows.map((row) => row.beforeGrid)),
					after: stats(rows.map((row) => row.afterGrid)),
				},
				regressions: rows
					.filter((row) => row.afterPhoto > row.beforePhoto)
					.map((row) => row.presetId),
				perPreset: rows.map((row) => ({
					preset: row.presetId,
					name: row.name,
					photo: `${row.beforePhoto.toFixed(2)} -> ${row.afterPhoto.toFixed(2)}`,
					grid: `${row.beforeGrid.toFixed(2)} -> ${row.afterGrid.toFixed(2)}`,
				})),
			},
			null,
			2
		)
	);

	if (emitPath) {
		writeFileSync(emitPath, `${JSON.stringify(emitted, null, "\t")}\n`, "utf8");
		console.error(
			`wrote ${Object.keys(emitted).length} recipes to ${emitPath}`
		);
	}
}

async function main() {
	const emitIndex = process.argv.indexOf("--emit");
	const emitDir = emitIndex >= 0 ? process.argv[emitIndex + 1] : null;
	const mapIndex = process.argv.indexOf("--map");
	const mapPath = mapIndex >= 0 ? process.argv[mapIndex + 1] : null;

	const prior = priorSamples();
	const priorMass = prior.reduce((sum, sample) => sum + sample.weight, 0);
	const grid = gridSamples({
		weight: (GRID_FRACTION * priorMass) / GRID_STEPS ** 3,
	});
	const training = [...prior, ...grid];
	const gridProbe = gridSamples({ weight: 1 });

	if (mapPath) {
		await fitMappedPresets({
			mapPath,
			emitPath: emitDir ? join(emitDir, "fitted-recipes.json") : null,
			prior,
			training,
			gridProbe,
		});
		return;
	}

	const references = await listJianyingLuts();
	if (references.length === 0) {
		throw new Error("No reference LUTs cached locally — nothing to fit.");
	}

	const priorScores: number[] = [];
	const gridScores: number[] = [];
	const emitted: { resourceId: string; recipe: FilterLutRecipe }[] = [];

	for (const reference of references) {
		const cube = reference.cube as Cube;
		const recipe = toRecipe({ coefficients: fit({ samples: training, cube }) });
		priorScores.push(scoreRecipe({ recipe, cube, samples: prior }).rmse);
		gridScores.push(scoreRecipe({ recipe, cube, samples: gridProbe }).rmse);
		emitted.push({ resourceId: reference.resourceId, recipe });
	}

	console.log(
		JSON.stringify(
			{
				references: references.length,
				gridFraction: GRID_FRACTION,
				scoredThrough: "transformFilterColor (shipped renderer)",
				photographicColours: stats(priorScores),
				uniformGrid: stats(gridScores),
			},
			null,
			2
		)
	);

	if (emitDir) {
		const path = join(emitDir, "fitted-recipes.json");
		writeFileSync(path, `${JSON.stringify(emitted, null, "\t")}\n`, "utf8");
		console.error(`wrote ${emitted.length} recipes to ${path}`);
	}
}

await main();
