import type { RawDraftGraph, RawGraphSegmentNode } from "./graph-reader.js";
import { isRawRecord } from "./raw-types.js";

const RANGE_KEYS = new Set(["duration", "start"]);
const PLACEHOLDER_KEYS = new Set([
	"error_path",
	"error_text",
	"id",
	"meta_type",
	"res_path",
	"res_text",
	"type",
]);
const SOUND_CHANNEL_MAPPING_KEYS = new Set([
	"audio_channel_mapping",
	"id",
	"is_config_open",
	"type",
]);
const SPEED_KEYS = new Set(["curve_speed", "id", "mode", "speed", "type"]);
const VOCAL_SEPARATION_KEYS = new Set([
	"choice",
	"enter_from",
	"final_algorithm",
	"id",
	"production_path",
	"removed_sounds",
	"time_range",
	"type",
]);

export type Beta4CompanionValidator = ({
	value,
}: {
	value: Record<string, unknown>;
}) => boolean;

export function hasExactKeys({
	value,
	keys,
}: {
	value: Record<string, unknown>;
	keys: ReadonlySet<string>;
}): boolean {
	const observed = Object.keys(value);
	return (
		observed.length === keys.size && observed.every((key) => keys.has(key))
	);
}

export function isEmptyArray({ value }: { value: unknown }): boolean {
	return Array.isArray(value) && value.length === 0;
}

export function isMissingOrEmptyArray({ value }: { value: unknown }): boolean {
	return value === undefined || value === null || isEmptyArray({ value });
}

export function isEmptyString({ value }: { value: unknown }): boolean {
	return value === "";
}

export function isZeroRange({ value }: { value: unknown }): boolean {
	return (
		isRawRecord(value) &&
		hasExactKeys({ value, keys: RANGE_KEYS }) &&
		value.start === 0 &&
		value.duration === 0
	);
}

export function isDefaultPlaceholder({
	value,
}: {
	value: Record<string, unknown>;
}): boolean {
	return (
		hasExactKeys({ value, keys: PLACEHOLDER_KEYS }) &&
		typeof value.id === "string" &&
		value.id.length > 0 &&
		value.type === "placeholder_info" &&
		value.meta_type === "none" &&
		isEmptyString({ value: value.error_path }) &&
		isEmptyString({ value: value.error_text }) &&
		isEmptyString({ value: value.res_path }) &&
		isEmptyString({ value: value.res_text })
	);
}

export function isDefaultSoundChannelMapping({
	value,
}: {
	value: Record<string, unknown>;
}): boolean {
	return (
		hasExactKeys({ value, keys: SOUND_CHANNEL_MAPPING_KEYS }) &&
		typeof value.id === "string" &&
		value.id.length > 0 &&
		(value.type === "" || value.type === "none") &&
		value.audio_channel_mapping === 0 &&
		value.is_config_open === false
	);
}

export function isDefaultSpeed({
	value,
}: {
	value: Record<string, unknown>;
}): boolean {
	return isConstantRateSpeed({ value, expectedSpeed: 1 });
}

/**
 * The constant-rate speed companion subset (L3): mode 0 with no curve, and
 * the companion's scalar matching the segment's own speed field. Curve
 * speeds (mode ≠ 0 / curve_speed set) stay opaque.
 */
export function isConstantRateSpeed({
	expectedSpeed,
	value,
}: {
	expectedSpeed: number;
	value: Record<string, unknown>;
}): boolean {
	return (
		hasExactKeys({ value, keys: SPEED_KEYS }) &&
		typeof value.id === "string" &&
		value.id.length > 0 &&
		value.type === "speed" &&
		value.curve_speed === null &&
		value.mode === 0 &&
		value.speed === expectedSpeed
	);
}

export function isDefaultVocalSeparation({
	value,
}: {
	value: Record<string, unknown>;
}): boolean {
	return (
		hasExactKeys({ value, keys: VOCAL_SEPARATION_KEYS }) &&
		typeof value.id === "string" &&
		value.id.length > 0 &&
		value.type === "vocal_separation" &&
		value.choice === 0 &&
		isEmptyString({ value: value.enter_from }) &&
		isEmptyString({ value: value.final_algorithm }) &&
		isEmptyString({ value: value.production_path }) &&
		isEmptyArray({ value: value.removed_sounds }) &&
		value.time_range === null
	);
}

export function hasVerifiedBeta4DefaultCompanions({
	graph,
	segment,
	validators,
}: {
	graph: RawDraftGraph;
	segment: RawGraphSegmentNode;
	validators: Readonly<Record<string, Beta4CompanionValidator>>;
}): boolean {
	const expectedBuckets = Object.keys(validators);
	if (segment.extraMaterialRefs.length !== expectedBuckets.length) return false;

	const observedBuckets = new Set<string>();
	for (const ref of segment.extraMaterialRefs) {
		const companion = graph.materialsById.get(ref);
		if (companion === undefined || observedBuckets.has(companion.bucket)) {
			return false;
		}
		const validate = validators[companion.bucket];
		if (validate === undefined || !validate({ value: companion.raw })) {
			return false;
		}
		observedBuckets.add(companion.bucket);
	}
	return observedBuckets.size === expectedBuckets.length;
}
