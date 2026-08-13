import type {
	InteropMediaVisual,
	InteropVisualKeyframe,
} from "../../draft-interop/document.js";
import { hasExactKeys } from "./beta4-default-companions.js";
import type { RawGraphSegmentNode } from "./graph-reader.js";
import { isRawRecord } from "./raw-types.js";

const GROUP_KEYS = new Set([
	"id",
	"keyframe_list",
	"material_id",
	"property_type",
]);
const KEYFRAME_KEYS = new Set([
	"curveType",
	"graphID",
	"id",
	"left_control",
	"right_control",
	"string_value",
	"time_offset",
	"values",
]);
const CONTROL_KEYS = new Set(["x", "y"]);

interface ParsedPositionChannel {
	finalNormalizedValue: number;
	keyframes: InteropVisualKeyframe[];
	timeOffsetsUs: number[];
}

export type Beta4PositionKeyframeResult =
	| { kind: "none" }
	| { kind: "unsupported" }
	| {
			kind: "mapped";
			finalNormalizedX: number;
			finalNormalizedY: 0;
			visual: InteropMediaVisual;
	  };

function isZeroControl({ value }: { value: unknown }): boolean {
	return (
		isRawRecord(value) &&
		hasExactKeys({ value, keys: CONTROL_KEYS }) &&
		value.x === 0 &&
		value.y === 0
	);
}

function parseChannel({
	group,
	segmentDurationUs,
}: {
	group: Record<string, unknown>;
	segmentDurationUs: number;
}): ParsedPositionChannel | undefined {
	if (
		!hasExactKeys({ value: group, keys: GROUP_KEYS }) ||
		typeof group.id !== "string" ||
		group.id.length === 0 ||
		group.material_id !== "" ||
		!Array.isArray(group.keyframe_list) ||
		group.keyframe_list.length < 2
	) {
		return undefined;
	}

	const keyframes: InteropVisualKeyframe[] = [];
	const ids = new Set<string>();
	let previousTimeOffsetUs = -1;
	for (const entry of group.keyframe_list) {
		if (
			!isRawRecord(entry) ||
			!hasExactKeys({ value: entry, keys: KEYFRAME_KEYS }) ||
			entry.curveType !== "Line" ||
			entry.graphID !== "" ||
			typeof entry.id !== "string" ||
			entry.id.length === 0 ||
			ids.has(entry.id) ||
			!isZeroControl({ value: entry.left_control }) ||
			!isZeroControl({ value: entry.right_control }) ||
			entry.string_value !== "" ||
			!Number.isSafeInteger(entry.time_offset) ||
			(entry.time_offset as number) <= previousTimeOffsetUs ||
			(entry.time_offset as number) > segmentDurationUs ||
			!Array.isArray(entry.values) ||
			entry.values.length !== 1 ||
			typeof entry.values[0] !== "number" ||
			!Number.isFinite(entry.values[0])
		) {
			return undefined;
		}
		const timeOffsetUs = entry.time_offset as number;
		ids.add(entry.id);
		previousTimeOffsetUs = timeOffsetUs;
		keyframes.push({
			id: entry.id,
			timeOffsetUs,
			value: entry.values[0],
			easing: "linear",
			foreignRef: entry.id,
		});
	}
	if (keyframes[0]?.timeOffsetUs !== 0) return undefined;
	return {
		finalNormalizedValue: keyframes.at(-1)?.value ?? 0,
		keyframes,
		timeOffsetsUs: keyframes.map(({ timeOffsetUs }) => timeOffsetUs),
	};
}

/** Maps only the real beta4 two-channel linear X-position shape. */
export function mapBeta4PositionKeyframes({
	canvasWidth,
	fps,
	segment,
}: {
	canvasWidth: number;
	fps: number;
	segment: RawGraphSegmentNode;
}): Beta4PositionKeyframeResult {
	const rawGroups = segment.raw.common_keyframes;
	if (rawGroups === undefined || rawGroups === null) return { kind: "none" };
	if (!Array.isArray(rawGroups)) return { kind: "unsupported" };
	if (rawGroups.length === 0) return { kind: "none" };
	if (
		rawGroups.length !== 2 ||
		!Number.isFinite(canvasWidth) ||
		canvasWidth <= 0 ||
		!Number.isFinite(fps) ||
		fps <= 0 ||
		segment.targetRange === undefined
	) {
		return { kind: "unsupported" };
	}

	const groups = rawGroups.filter(isRawRecord);
	if (groups.length !== rawGroups.length) return { kind: "unsupported" };
	const xGroup = groups.find(
		(group) => group.property_type === "KFTypePositionX"
	);
	const yGroup = groups.find(
		(group) => group.property_type === "KFTypePositionY"
	);
	if (xGroup === undefined || yGroup === undefined || xGroup === yGroup) {
		return { kind: "unsupported" };
	}

	const x = parseChannel({
		group: xGroup,
		segmentDurationUs: segment.targetRange.duration,
	});
	const y = parseChannel({
		group: yGroup,
		segmentDurationUs: segment.targetRange.duration,
	});
	if (
		x === undefined ||
		y === undefined ||
		x.timeOffsetsUs.some(
			(timeOffsetUs, index) => timeOffsetUs !== y.timeOffsetsUs[index]
		) ||
		x.timeOffsetsUs.some(
			(timeOffsetUs) =>
				Number.isSafeInteger((timeOffsetUs * fps) / 1_000_000) === false
		) ||
		y.keyframes.some(({ value }) => value !== 0)
	) {
		return { kind: "unsupported" };
	}

	const scaleX = ({ keyframe }: { keyframe: InteropVisualKeyframe }) => ({
		...keyframe,
		value: keyframe.value * canvasWidth,
	});
	return {
		kind: "mapped",
		finalNormalizedX: x.finalNormalizedValue,
		finalNormalizedY: 0,
		visual: {
			xPx: x.finalNormalizedValue * canvasWidth,
			yPx: 0,
			keyframes: {
				x: x.keyframes.map((keyframe) => scaleX({ keyframe })),
				y: y.keyframes,
			},
		},
	};
}
