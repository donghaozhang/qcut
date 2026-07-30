import type { ColorCubeLut } from "../types/color.js";

const CUBE_CHANNEL_COUNT = 3;
const MINIMUM_CUBE_SIZE = 2;

function formatCubeNumber({ value }: { value: number }): string {
	return Object.is(value, -0) ? "0" : String(value);
}

function assertFiniteTriplet({
	label,
	values,
}: {
	label: string;
	values: readonly number[];
}): void {
	if (
		values.length !== CUBE_CHANNEL_COUNT ||
		values.some((value) => !Number.isFinite(value))
	) {
		throw new RangeError(`${label} must contain exactly three finite numbers.`);
	}
}

function escapeCubeTitle({ title }: { title: string }): string {
	const normalized = title.normalize("NFC").trim();
	if (!normalized) {
		throw new Error("LUT title must not be empty.");
	}
	return normalized
		.replaceAll("\\", "\\\\")
		.replaceAll('"', '\\"')
		.replace(/[\u0000-\u001f\u007f]/g, " ");
}

export function validateColorCubeLut({ cube }: { cube: ColorCubeLut }): void {
	if (!Number.isSafeInteger(cube.size) || cube.size < MINIMUM_CUBE_SIZE) {
		throw new RangeError(
			`LUT size must be a safe integer of at least ${MINIMUM_CUBE_SIZE}.`
		);
	}

	const expectedValueCount = cube.size ** 3 * CUBE_CHANNEL_COUNT;
	if (
		!Number.isSafeInteger(expectedValueCount) ||
		cube.values.length !== expectedValueCount
	) {
		throw new RangeError(
			`LUT size ${cube.size} requires exactly ${expectedValueCount} channel values.`
		);
	}

	assertFiniteTriplet({ label: "LUT domain minimum", values: cube.domainMin });
	assertFiniteTriplet({ label: "LUT domain maximum", values: cube.domainMax });

	for (let channel = 0; channel < CUBE_CHANNEL_COUNT; channel += 1) {
		const minimum = cube.domainMin[channel];
		const maximum = cube.domainMax[channel];
		if (minimum === undefined || maximum === undefined || minimum >= maximum) {
			throw new RangeError(
				`LUT domain minimum must be below its maximum for channel ${channel}.`
			);
		}
	}

	if (cube.values.some((value) => !Number.isFinite(value))) {
		throw new RangeError("LUT channel values must all be finite.");
	}
}

export function serializeColorCubeLut({
	cube,
	title,
}: {
	cube: ColorCubeLut;
	title: string;
}): string {
	validateColorCubeLut({ cube });

	const rows = [
		`TITLE "${escapeCubeTitle({ title })}"`,
		`LUT_3D_SIZE ${cube.size}`,
		`DOMAIN_MIN ${cube.domainMin
			.map((value) => formatCubeNumber({ value }))
			.join(" ")}`,
		`DOMAIN_MAX ${cube.domainMax
			.map((value) => formatCubeNumber({ value }))
			.join(" ")}`,
	];

	for (let index = 0; index < cube.values.length; index += CUBE_CHANNEL_COUNT) {
		rows.push(
			cube.values
				.slice(index, index + CUBE_CHANNEL_COUNT)
				.map((value) => formatCubeNumber({ value }))
				.join(" ")
		);
	}

	return `${rows.join("\n")}\n`;
}
