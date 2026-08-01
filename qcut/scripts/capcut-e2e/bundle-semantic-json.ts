export type JsonRecord = Record<string, unknown>;

export interface TimelineRangeEvidence {
	durationMicroseconds: number;
	sourceStartMicroseconds: number;
	targetStartMicroseconds: number;
}

export function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): JsonRecord {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as JsonRecord;
}

export function requireArray({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): unknown[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	return value;
}

export function requireString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string") throw new Error(`${label} must be a string.`);
	return value;
}

export function requireNumber({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${label} must be a finite number.`);
	}
	return value;
}

export function requireBoolean({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): boolean {
	if (typeof value !== "boolean") {
		throw new Error(`${label} must be a boolean.`);
	}
	return value;
}

export function requireExactValue({
	actual,
	expected,
	label,
}: {
	actual: unknown;
	expected: unknown;
	label: string;
}): void {
	if (!isDeepStrictEqual(actual, expected)) {
		throw new Error(
			`${label} changed; expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`
		);
	}
}

export function getMaterials({
	content,
	key,
}: {
	content: JsonRecord;
	key: string;
}): JsonRecord[] {
	const materials = requireRecord({
		label: "CapCut draft materials",
		value: content.materials,
	});
	return requireArray({
		label: `CapCut ${key} materials`,
		value: materials[key],
	}).map((value, index) =>
		requireRecord({ label: `CapCut ${key} material ${index}`, value })
	);
}

export function getTracks({
	content,
	type,
}: {
	content: JsonRecord;
	type: string;
}): JsonRecord[] {
	return requireArray({ label: "CapCut tracks", value: content.tracks })
		.map((value, index) =>
			requireRecord({ label: `CapCut track ${index}`, value })
		)
		.filter((track) => track.type === type);
}

export function getSegments({
	label,
	track,
}: {
	label: string;
	track: JsonRecord;
}): JsonRecord[] {
	return requireArray({
		label: `${label} segments`,
		value: track.segments,
	}).map((value, index) =>
		requireRecord({ label: `${label} segment ${index}`, value })
	);
}

export function requireSingle<T>({
	label,
	values,
}: {
	label: string;
	values: T[];
}): T {
	if (values.length !== 1 || !values[0]) {
		throw new Error(`${label} must contain exactly one value.`);
	}
	return values[0];
}

export function getRangeEvidence({
	segment,
}: {
	segment: JsonRecord;
}): TimelineRangeEvidence {
	const source = requireRecord({
		label: "CapCut segment source range",
		value: segment.source_timerange,
	});
	const target = requireRecord({
		label: "CapCut segment target range",
		value: segment.target_timerange,
	});
	const sourceDuration = requireNumber({
		label: "CapCut source duration",
		value: source.duration,
	});
	const targetDuration = requireNumber({
		label: "CapCut target duration",
		value: target.duration,
	});
	requireExactValue({
		actual: targetDuration,
		expected: sourceDuration,
		label: "CapCut source/target duration",
	});
	return {
		durationMicroseconds: sourceDuration,
		sourceStartMicroseconds: requireNumber({
			label: "CapCut source start",
			value: source.start,
		}),
		targetStartMicroseconds: requireNumber({
			label: "CapCut target start",
			value: target.start,
		}),
	};
}

export function getMaterialRefs({
	segment,
}: {
	segment: JsonRecord;
}): string[] {
	return requireArray({
		label: "CapCut segment material references",
		value: segment.extra_material_refs,
	}).map((value, index) =>
		requireString({ label: `CapCut material reference ${index}`, value })
	);
}
import { isDeepStrictEqual } from "node:util";
