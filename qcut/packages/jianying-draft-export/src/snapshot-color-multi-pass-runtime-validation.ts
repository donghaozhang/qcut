import type {
	ColorMultiPassOperation,
	ColorMultiPassSettings,
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
import { validateColorCubeRuntime } from "./snapshot-color-lut-runtime-validation.js";
import { createAllowedKeySet } from "./snapshot-runtime-helpers.js";

const SETTINGS_KEYS = createAllowedKeySet<ColorMultiPassSettings>({
	keys: {
		enabled: true,
		fidelity: true,
		intensity: true,
		name: true,
		passes: true,
		presetId: true,
	},
});
/** Optional long-tail traits every pass kind may carry (FLP-002). */
const PASS_TRAIT_KEYS = {
	edgeMode: true,
	intensityCurve: true,
	mipLevels: true,
	pixelFormat: true,
	scale: true,
	timeVarying: true,
} as const;
const SHARPEN_KEYS = createAllowedKeySet<
	Extract<ColorMultiPassOperation, { kind: "sharpen" }>
>({ keys: { amount: true, kind: true, ...PASS_TRAIT_KEYS } });
const BILATERAL_KEYS = createAllowedKeySet<
	Extract<ColorMultiPassOperation, { kind: "bilateral-blur" }>
>({ keys: { kind: true, radius: true, threshold: true, ...PASS_TRAIT_KEYS } });
const FOG_KEYS = createAllowedKeySet<
	Extract<ColorMultiPassOperation, { kind: "fog-blend" }>
>({ keys: { amount: true, kind: true, radius: true, ...PASS_TRAIT_KEYS } });
const VIGNETTE_KEYS = createAllowedKeySet<
	Extract<ColorMultiPassOperation, { kind: "vignette" }>
>({ keys: { amount: true, kind: true, softness: true, ...PASS_TRAIT_KEYS } });
const LUT_KEYS = createAllowedKeySet<
	Extract<ColorMultiPassOperation, { kind: "lut" }>
>({ keys: { cube: true, intensity: true, kind: true, ...PASS_TRAIT_KEYS } });

function validateOperation({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}) {
	const operation = getRecord({ path, value });
	const kind = getString({ path: `${path}.kind`, value: operation.kind });
	if (kind === "sharpen") {
		assertNoUnknownKeys({ allowed: SHARPEN_KEYS, path, record: operation });
		getFiniteNumber({ path: `${path}.amount`, value: operation.amount });
		return;
	}
	if (kind === "bilateral-blur") {
		assertNoUnknownKeys({ allowed: BILATERAL_KEYS, path, record: operation });
		getFiniteNumber({ path: `${path}.radius`, value: operation.radius });
		getFiniteNumber({ path: `${path}.threshold`, value: operation.threshold });
		return;
	}
	if (kind === "fog-blend") {
		assertNoUnknownKeys({ allowed: FOG_KEYS, path, record: operation });
		getFiniteNumber({ path: `${path}.radius`, value: operation.radius });
		getFiniteNumber({ path: `${path}.amount`, value: operation.amount });
		return;
	}
	if (kind === "vignette") {
		assertNoUnknownKeys({ allowed: VIGNETTE_KEYS, path, record: operation });
		getFiniteNumber({ path: `${path}.amount`, value: operation.amount });
		getFiniteNumber({ path: `${path}.softness`, value: operation.softness });
		return;
	}
	if (kind === "lut") {
		assertNoUnknownKeys({ allowed: LUT_KEYS, path, record: operation });
		getFiniteNumber({ path: `${path}.intensity`, value: operation.intensity });
		validateColorCubeRuntime({ path: `${path}.cube`, value: operation.cube });
		return;
	}
	throw validationIssue({
		message: `Unsupported multi-pass operation: ${kind}`,
		path: `${path}.kind`,
	});
}

export function validateColorMultiPassRuntime({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}) {
	if (value === undefined) return;
	const settings = getRecord({ path, value });
	assertNoUnknownKeys({ allowed: SETTINGS_KEYS, path, record: settings });
	getBoolean({ path: `${path}.enabled`, value: settings.enabled });
	getString({
		allowEmpty: true,
		path: `${path}.presetId`,
		value: settings.presetId,
	});
	getString({ allowEmpty: true, path: `${path}.name`, value: settings.name });
	getFiniteNumber({ path: `${path}.intensity`, value: settings.intensity });
	const fidelity = getString({
		path: `${path}.fidelity`,
		value: settings.fidelity,
	});
	if (fidelity !== "structural") {
		throw validationIssue({
			message: "Expected multi-pass fidelity to be structural.",
			path: `${path}.fidelity`,
		});
	}
	const passes = getArray({ path: `${path}.passes`, value: settings.passes });
	for (const [index, pass] of passes.entries()) {
		validateOperation({ path: `${path}.passes[${index}]`, value: pass });
	}
}
