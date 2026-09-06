export interface IndependentCube {
	size: number;
	values: ArrayLike<number>;
	domainMin?: [number, number, number];
	domainMax?: [number, number, number];
}

export function validateIndependentCube({
	cube,
}: {
	cube: IndependentCube;
}): IndependentCube {
	if (
		!Number.isInteger(cube.size) ||
		cube.size < 2 ||
		cube.size > 65 ||
		cube.values.length !== cube.size ** 3 * 3
	) {
		throw new Error(
			"Independent LUT must contain a complete 2-65 level RGB cube."
		);
	}
	const min = cube.domainMin ?? [0, 0, 0];
	const max = cube.domainMax ?? [1, 1, 1];
	if (min.some((value) => value !== 0) || max.some((value) => value !== 1)) {
		throw new Error(
			"Independent LUT currently requires a normalized 0-1 domain."
		);
	}
	for (let index = 0; index < cube.values.length; index++) {
		if (
			!Number.isFinite(cube.values[index]) ||
			Math.abs(cube.values[index]) > 16
		)
			throw new Error("Invalid local LUT value.");
	}
	return cube;
}

export function encodeIndependentCube({ cube }: { cube: IndependentCube }) {
	validateIndependentCube({ cube });
	const values = new Float32Array(cube.size ** 3 * 4);
	for (let pixel = 0; pixel < cube.size ** 3; pixel++) {
		values[pixel * 4] = cube.values[pixel * 3];
		values[pixel * 4 + 1] = cube.values[pixel * 3 + 1];
		values[pixel * 4 + 2] = cube.values[pixel * 3 + 2];
		values[pixel * 4 + 3] = 1;
	}
	return new Uint8Array(values.buffer);
}
