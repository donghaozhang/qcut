import type {
	TextAnimationDirection,
	TextAnimationDistance,
	TextAnimationEasing,
	TextAnimationOrder,
	TextAnimationPresetRef,
	TextAnimationSequence,
	TextAnimationTarget,
	TextAnimationTiming,
	TextAnimationUnit,
} from "./model.js";

export const TEXT_ANIMATION_DIRECTIONS: TextAnimationDirection[] = [
	"left",
	"right",
	"up",
	"down",
];
export const TEXT_ANIMATION_TARGETS: TextAnimationTarget[] = [
	"text",
	"textAndBackground",
];

const DISTANCE_UNITS: TextAnimationDistance["unit"][] = [
	"px",
	"em",
	"boxWidth",
	"boxHeight",
];
const ORDERS: TextAnimationOrder[] = [
	"forward",
	"reverse",
	"centerOut",
	"outsideIn",
	"random",
];
const UNITS: TextAnimationUnit[] = ["all", "word", "grapheme"];
const EASING_NAMES: Array<Extract<TextAnimationEasing, string>> = [
	"linear",
	"easeIn",
	"easeOut",
	"easeInOut",
];

export function asRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

export function finiteOr({
	value,
	fallback,
}: {
	value: unknown;
	fallback: number;
}): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function numberInRange({
	value,
	fallback,
	minimum,
	maximum,
}: {
	value: unknown;
	fallback: number;
	minimum: number;
	maximum: number;
}): number {
	return Math.min(maximum, Math.max(minimum, finiteOr({ value, fallback })));
}

export function oneOf<TValue extends string>({
	value,
	values,
	fallback,
}: {
	value: unknown;
	values: TValue[];
	fallback: TValue;
}): TValue {
	return values.find((candidate) => candidate === value) ?? fallback;
}

export function stableSeed({ value }: { value: string }): number {
	let hash = 2_166_136_261;
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16_777_619);
	}
	return hash >>> 0;
}

export function normalizeDistance({
	value,
	fallback,
}: {
	value: unknown;
	fallback: TextAnimationDistance;
}): TextAnimationDistance {
	const record = asRecord({ value });
	if (!record) return fallback;
	return {
		value: numberInRange({
			value: record.value,
			fallback: fallback.value,
			minimum: 0,
			maximum: 100_000,
		}),
		unit: oneOf({
			value: record.unit,
			values: DISTANCE_UNITS,
			fallback: fallback.unit,
		}),
	};
}

export function normalizeSpring({ value }: { value: unknown }): {
	mass: number;
	stiffness: number;
	damping: number;
	velocity: number;
} {
	const record = asRecord({ value });
	return {
		mass: numberInRange({
			value: record?.mass,
			fallback: 1,
			minimum: 0.01,
			maximum: 100,
		}),
		stiffness: numberInRange({
			value: record?.stiffness,
			fallback: 170,
			minimum: 0.01,
			maximum: 10_000,
		}),
		damping: numberInRange({
			value: record?.damping,
			fallback: 18,
			minimum: 0.01,
			maximum: 1_000,
		}),
		velocity: numberInRange({
			value: record?.velocity,
			fallback: 0,
			minimum: -1_000,
			maximum: 1_000,
		}),
	};
}

export function normalizeEasing({
	value,
}: {
	value: unknown;
}): TextAnimationEasing {
	const named = EASING_NAMES.find((candidate) => candidate === value);
	if (named) return named;
	const record = asRecord({ value });
	if (record?.type === "cubicBezier") {
		return {
			type: "cubicBezier",
			x1: numberInRange({
				value: record.x1,
				fallback: 0.25,
				minimum: 0,
				maximum: 1,
			}),
			y1: numberInRange({
				value: record.y1,
				fallback: 0.1,
				minimum: -10,
				maximum: 10,
			}),
			x2: numberInRange({
				value: record.x2,
				fallback: 0.25,
				minimum: 0,
				maximum: 1,
			}),
			y2: numberInRange({
				value: record.y2,
				fallback: 1,
				minimum: -10,
				maximum: 10,
			}),
		};
	}
	if (record?.type === "spring") {
		return { type: "spring", ...normalizeSpring({ value: record }) };
	}
	return "linear";
}

export function normalizeTiming({
	value,
	fps,
}: {
	value: unknown;
	fps: number;
}): TextAnimationTiming {
	const record = asRecord({ value });
	return {
		duration: numberInRange({
			value: record?.duration,
			fallback: 0.6,
			minimum: 1 / fps,
			maximum: 60,
		}),
		delay: numberInRange({
			value: record?.delay,
			fallback: 0,
			minimum: 0,
			maximum: 60,
		}),
		easing: normalizeEasing({ value: record?.easing }),
	};
}

export function normalizeSequence({
	value,
	elementId,
}: {
	value: unknown;
	elementId: string;
}): TextAnimationSequence {
	const record = asRecord({ value });
	const locale =
		typeof record?.locale === "string" && record.locale.length > 0
			? record.locale
			: undefined;
	return {
		unit: oneOf({
			value: record?.unit,
			values: UNITS,
			fallback: "all",
		}),
		order: oneOf({
			value: record?.order,
			values: ORDERS,
			fallback: "forward",
		}),
		staggerRatio: numberInRange({
			value: record?.staggerRatio,
			fallback: 0,
			minimum: 0,
			maximum: 0.95,
		}),
		seed: Math.trunc(
			numberInRange({
				value: record?.seed,
				fallback: stableSeed({ value: elementId }),
				minimum: 0,
				maximum: 0xffff_ffff,
			})
		),
		...(locale ? { locale } : {}),
	};
}

export function normalizePresetRef({
	value,
}: {
	value: unknown;
}): TextAnimationPresetRef | undefined {
	const record = asRecord({ value });
	if (typeof record?.id !== "string" || record.id.length === 0) return;
	return {
		id: record.id,
		version: Math.max(
			1,
			Math.trunc(finiteOr({ value: record.version, fallback: 1 }))
		),
	};
}
