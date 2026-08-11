import type {
	ColorCubeLut,
	ColorDualLutSettings,
	ColorLutSettings,
} from "@qcut/editor-core";
import {
	assertNoUnknownKeys,
	getArray,
	getBoolean,
	getFiniteNumber,
	getRecord,
	getString,
	type JsonValue,
	validationIssue,
} from "./runtime-json.js";
import { createAllowedKeySet } from "./snapshot-runtime-helpers.js";

const MAX_COLOR_CUBE_SIZE = 65;
const COLOR_LUT_KEYS = createAllowedKeySet<ColorLutSettings>({
	keys: {
		cube: true,
		dual: true,
		enabled: true,
		intensity: true,
		name: true,
		presetId: true,
		skinProtection: true,
	},
});
const COLOR_DUAL_LUT_KEYS = createAllowedKeySet<ColorDualLutSettings>({
	keys: { maskKind: true, skinCube: true },
});
const COLOR_CUBE_KEYS = createAllowedKeySet<ColorCubeLut>({
	keys: {
		domainMax: true,
		domainMin: true,
		size: true,
		values: true,
	},
});

export function validateColorCubeRuntime({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}) {
	const cube = getRecord({ path, value });
	assertNoUnknownKeys({ allowed: COLOR_CUBE_KEYS, path, record: cube });
	const size = getFiniteNumber({ path: `${path}.size`, value: cube.size });
	if (!Number.isSafeInteger(size) || size < 2 || size > MAX_COLOR_CUBE_SIZE) {
		throw validationIssue({
			message: `Expected a LUT cube size from 2 through ${MAX_COLOR_CUBE_SIZE}.`,
			path: `${path}.size`,
		});
	}
	for (const key of ["domainMin", "domainMax"] as const) {
		const entries = getArray({ path: `${path}.${key}`, value: cube[key] });
		if (entries.length !== 3) {
			throw validationIssue({
				message: "Expected exactly three channel values.",
				path: `${path}.${key}`,
			});
		}
		for (const [index, entry] of entries.entries()) {
			getFiniteNumber({ path: `${path}.${key}[${index}]`, value: entry });
		}
	}
	const values = getArray({ path: `${path}.values`, value: cube.values });
	const expectedValueCount = size ** 3 * 3;
	if (values.length !== expectedValueCount) {
		throw validationIssue({
			message: `Expected exactly ${expectedValueCount} LUT channel values.`,
			path: `${path}.values`,
		});
	}
	for (const [index, entry] of values.entries()) {
		getFiniteNumber({ path: `${path}.values[${index}]`, value: entry });
	}
}

export function validateColorLutRuntime({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}) {
	const lut = getRecord({ path, value });
	assertNoUnknownKeys({ allowed: COLOR_LUT_KEYS, path, record: lut });
	getBoolean({ path: `${path}.enabled`, value: lut.enabled });
	getString({
		allowEmpty: true,
		path: `${path}.presetId`,
		value: lut.presetId,
	});
	getString({ allowEmpty: true, path: `${path}.name`, value: lut.name });
	getFiniteNumber({ path: `${path}.intensity`, value: lut.intensity });
	getFiniteNumber({
		path: `${path}.skinProtection`,
		value: lut.skinProtection,
	});
	if (lut.cube !== undefined) {
		validateColorCubeRuntime({ path: `${path}.cube`, value: lut.cube });
	}
	if (lut.dual === undefined) return;
	const dualPath = `${path}.dual`;
	const dual = getRecord({ path: dualPath, value: lut.dual });
	assertNoUnknownKeys({
		allowed: COLOR_DUAL_LUT_KEYS,
		path: dualPath,
		record: dual,
	});
	const maskKind = getString({
		path: `${dualPath}.maskKind`,
		value: dual.maskKind,
	});
	if (maskKind !== "skin-tone-v1") {
		throw validationIssue({
			message: "Expected the supported dual-LUT mask kind skin-tone-v1.",
			path: `${dualPath}.maskKind`,
		});
	}
	validateColorCubeRuntime({
		path: `${dualPath}.skinCube`,
		value: dual.skinCube,
	});
}
