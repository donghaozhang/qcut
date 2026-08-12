import type {
	ColorMultiPassOperation,
	ColorMultiPassSettings,
} from "@qcut/editor-core";
import {
	assertNoUnknownKeys,
	assertOptionalBoolean,
	assertOptionalFiniteNumber,
	assertStringLiteral,
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
		nativeEffect: true,
		passes: true,
		presetId: true,
	},
});
const NATIVE_EFFECT_KEYS = createAllowedKeySet<
	NonNullable<ColorMultiPassSettings["nativeEffect"]>
>({
	keys: { provider: true, resourceId: true, version: true },
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
const GRAIN_KEYS = createAllowedKeySet<
	Extract<ColorMultiPassOperation, { kind: "grain-noise" }>
>({
	keys: {
		amount: true,
		kind: true,
		seed: true,
		size: true,
		...PASS_TRAIT_KEYS,
	},
});
const LIGHT_LEAK_KEYS = createAllowedKeySet<
	Extract<ColorMultiPassOperation, { kind: "light-leak" }>
>({
	keys: {
		amount: true,
		centerX: true,
		centerY: true,
		color: true,
		kind: true,
		radius: true,
		speed: true,
		...PASS_TRAIT_KEYS,
	},
});
const BLOOM_KEYS = createAllowedKeySet<
	Extract<ColorMultiPassOperation, { kind: "bloom" }>
>({
	keys: {
		amount: true,
		kind: true,
		radius: true,
		threshold: true,
		...PASS_TRAIT_KEYS,
	},
});
const CHROMATIC_ABERRATION_KEYS = createAllowedKeySet<
	Extract<ColorMultiPassOperation, { kind: "chromatic-aberration" }>
>({
	keys: {
		angle: true,
		kind: true,
		offset: true,
		...PASS_TRAIT_KEYS,
	},
});
const LENS_DISTORTION_KEYS = createAllowedKeySet<
	Extract<ColorMultiPassOperation, { kind: "lens-distortion" }>
>({
	keys: {
		centerX: true,
		centerY: true,
		distortion: true,
		kind: true,
		...PASS_TRAIT_KEYS,
	},
});
const LINEAR_CURVE_KEYS = new Set(["kind"]);
const PIECEWISE_CURVE_KEYS = new Set(["kind", "points"]);

function validatePassTraits({
	path,
	operation,
}: {
	path: string;
	operation: { [key: string]: JsonValue };
}) {
	assertOptionalFiniteNumber({
		path: `${path}.scale`,
		value: operation.scale,
	});
	if (operation.scale !== undefined) {
		const scale = getFiniteNumber({
			path: `${path}.scale`,
			value: operation.scale,
		});
		if (scale !== 1 && scale !== 0.5 && scale !== 0.25) {
			throw validationIssue({
				message: "Expected pass scale to be 1, 0.5, or 0.25.",
				path: `${path}.scale`,
			});
		}
	}
	if (operation.pixelFormat !== undefined) {
		assertStringLiteral({
			allowed: new Set(["rgba8", "float16", "float32"]),
			path: `${path}.pixelFormat`,
			value: operation.pixelFormat,
		});
	}
	assertOptionalFiniteNumber({
		path: `${path}.mipLevels`,
		value: operation.mipLevels,
	});
	if (operation.mipLevels !== undefined) {
		const levels = getFiniteNumber({
			path: `${path}.mipLevels`,
			value: operation.mipLevels,
		});
		if (!Number.isInteger(levels) || levels < 1) {
			throw validationIssue({
				message: "Expected mipLevels to be a positive integer.",
				path: `${path}.mipLevels`,
			});
		}
	}
	if (operation.edgeMode !== undefined) {
		assertStringLiteral({
			allowed: new Set(["clamp", "repeat", "mirror"]),
			path: `${path}.edgeMode`,
			value: operation.edgeMode,
		});
	}
	assertOptionalBoolean({
		path: `${path}.timeVarying`,
		value: operation.timeVarying,
	});
	if (operation.intensityCurve === undefined) return;
	const curvePath = `${path}.intensityCurve`;
	const curve = getRecord({ path: curvePath, value: operation.intensityCurve });
	const curveKind = getString({ path: `${curvePath}.kind`, value: curve.kind });
	if (curveKind === "linear") {
		assertNoUnknownKeys({
			allowed: LINEAR_CURVE_KEYS,
			path: curvePath,
			record: curve,
		});
		return;
	}
	if (curveKind !== "piecewise") {
		throw validationIssue({
			message: "Expected linear or piecewise intensity curve.",
			path: `${curvePath}.kind`,
		});
	}
	assertNoUnknownKeys({
		allowed: PIECEWISE_CURVE_KEYS,
		path: curvePath,
		record: curve,
	});
	const points = getArray({ path: `${curvePath}.points`, value: curve.points });
	for (const [index, pointValue] of points.entries()) {
		const pointPath = `${curvePath}.points[${index}]`;
		const point = getArray({ path: pointPath, value: pointValue });
		if (point.length !== 2) {
			throw validationIssue({
				message: "Expected an [input, output] curve point.",
				path: pointPath,
			});
		}
		getFiniteNumber({ path: `${pointPath}[0]`, value: point[0] });
		getFiniteNumber({ path: `${pointPath}[1]`, value: point[1] });
	}
}

function validateColorTriple({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}) {
	const color = getArray({ path, value });
	if (color.length !== 3) {
		throw validationIssue({ message: "Expected an RGB color triple.", path });
	}
	for (const [index, channel] of color.entries()) {
		getFiniteNumber({ path: `${path}[${index}]`, value: channel });
	}
}

function validateOperation({
	path,
	value,
}: {
	path: string;
	value: JsonValue | undefined;
}) {
	const operation = getRecord({ path, value });
	const kind = getString({ path: `${path}.kind`, value: operation.kind });
	validatePassTraits({ path, operation });
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
	if (kind === "grain-noise") {
		assertNoUnknownKeys({ allowed: GRAIN_KEYS, path, record: operation });
		getFiniteNumber({ path: `${path}.amount`, value: operation.amount });
		getFiniteNumber({ path: `${path}.size`, value: operation.size });
		getFiniteNumber({ path: `${path}.seed`, value: operation.seed });
		return;
	}
	if (kind === "light-leak") {
		assertNoUnknownKeys({ allowed: LIGHT_LEAK_KEYS, path, record: operation });
		getFiniteNumber({ path: `${path}.amount`, value: operation.amount });
		validateColorTriple({ path: `${path}.color`, value: operation.color });
		getFiniteNumber({ path: `${path}.centerX`, value: operation.centerX });
		getFiniteNumber({ path: `${path}.centerY`, value: operation.centerY });
		getFiniteNumber({ path: `${path}.radius`, value: operation.radius });
		getFiniteNumber({ path: `${path}.speed`, value: operation.speed });
		return;
	}
	if (kind === "bloom") {
		assertNoUnknownKeys({ allowed: BLOOM_KEYS, path, record: operation });
		getFiniteNumber({ path: `${path}.threshold`, value: operation.threshold });
		getFiniteNumber({ path: `${path}.radius`, value: operation.radius });
		getFiniteNumber({ path: `${path}.amount`, value: operation.amount });
		return;
	}
	if (kind === "chromatic-aberration") {
		assertNoUnknownKeys({
			allowed: CHROMATIC_ABERRATION_KEYS,
			path,
			record: operation,
		});
		getFiniteNumber({ path: `${path}.offset`, value: operation.offset });
		getFiniteNumber({ path: `${path}.angle`, value: operation.angle });
		return;
	}
	if (kind === "lens-distortion") {
		assertNoUnknownKeys({
			allowed: LENS_DISTORTION_KEYS,
			path,
			record: operation,
		});
		getFiniteNumber({
			path: `${path}.distortion`,
			value: operation.distortion,
		});
		getFiniteNumber({ path: `${path}.centerX`, value: operation.centerX });
		getFiniteNumber({ path: `${path}.centerY`, value: operation.centerY });
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
	if (fidelity !== "structural" && fidelity !== "native-local") {
		throw validationIssue({
			message: "Expected multi-pass fidelity to be structural or native-local.",
			path: `${path}.fidelity`,
		});
	}
	if (fidelity === "native-local") {
		const nativeEffect = getRecord({
			path: `${path}.nativeEffect`,
			value: settings.nativeEffect,
		});
		assertNoUnknownKeys({
			allowed: NATIVE_EFFECT_KEYS,
			path: `${path}.nativeEffect`,
			record: nativeEffect,
		});
		const provider = getString({
			path: `${path}.nativeEffect.provider`,
			value: nativeEffect.provider,
		});
		if (provider !== "jianying-local-effect-v1") {
			throw validationIssue({
				message: "Unsupported native multi-pass provider.",
				path: `${path}.nativeEffect.provider`,
			});
		}
		getString({
			path: `${path}.nativeEffect.resourceId`,
			value: nativeEffect.resourceId,
		});
		getString({
			path: `${path}.nativeEffect.version`,
			value: nativeEffect.version,
		});
	} else if (settings.nativeEffect !== undefined) {
		throw validationIssue({
			message:
				"Structural multi-pass settings cannot select a native provider.",
			path: `${path}.nativeEffect`,
		});
	}
	const passes = getArray({ path: `${path}.passes`, value: settings.passes });
	for (const [index, pass] of passes.entries()) {
		validateOperation({ path: `${path}.passes[${index}]`, value: pass });
	}
}
