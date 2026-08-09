import type { InteropTransition } from "../../draft-interop/document.js";
import type { InteropIssueCode } from "../../draft-interop/issues.js";
import { CAPCUT_8_1_PROFILE_ID } from "../capcut-8-1-profile.js";
import { isVerifiedCapCut81TransitionMaterial } from "../transition-validation.js";
import type { JianyingTransitionMaterial } from "../types.js";
import type {
	RawGraphMaterialNode,
	RawGraphSegmentNode,
} from "./graph-reader.js";

export interface MapCapCut81SeamTransitionInput {
	profileId: string;
	material: RawGraphMaterialNode;
	fromSegment: RawGraphSegmentNode;
	toSegment?: RawGraphSegmentNode;
}

export interface MappedCapCut81SeamTransition {
	transition: InteropTransition;
	issueCode?: InteropIssueCode;
	reason?: string;
}

function readPositiveSafeInteger(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0
		? value
		: undefined;
}

function createTransition({
	capability,
	durationUs,
	fromSegment,
	material,
	toSegmentId,
	type,
}: {
	capability: InteropTransition["capability"];
	durationUs: number;
	fromSegment: RawGraphSegmentNode;
	material: RawGraphMaterialNode;
	toSegmentId: string;
	type: InteropTransition["type"];
}): InteropTransition {
	return {
		id: material.id,
		type,
		fromSegmentId: fromSegment.id,
		toSegmentId,
		durationUs,
		capability,
		foreignRef: material.id,
	};
}

/** Maps only the profile-bound CapCut 8.1 native dissolve identity exactly. */
export function mapCapCut81SeamTransition({
	profileId,
	material,
	fromSegment,
	toSegment,
}: MapCapCut81SeamTransitionInput): MappedCapCut81SeamTransition {
	const durationUs = readPositiveSafeInteger(material.raw.duration);
	if (durationUs === undefined) {
		return {
			transition: createTransition({
				capability: "blocked",
				durationUs: 0,
				fromSegment,
				material,
				toSegmentId: toSegment?.id ?? fromSegment.id,
				type: "unknown",
			}),
			issueCode: "TIME_RANGE_INVALID",
			reason: "transition duration must be a positive integer in microseconds",
		};
	}
	if (toSegment === undefined) {
		return {
			transition: createTransition({
				capability: "blocked",
				durationUs,
				fromSegment,
				material,
				toSegmentId: fromSegment.id,
				type: "unknown",
			}),
			issueCode: "REF_BROKEN",
			reason: "transition owner has no following segment on the same track",
		};
	}
	const fromRange = fromSegment.targetRange;
	const toRange = toSegment.targetRange;
	if (
		fromRange === undefined ||
		toRange === undefined ||
		fromRange.start + fromRange.duration !== toRange.start
	) {
		return {
			transition: createTransition({
				capability: "blocked",
				durationUs,
				fromSegment,
				material,
				toSegmentId: toSegment.id,
				type: "unknown",
			}),
			issueCode: "TIME_RANGE_INVALID",
			reason: "transition must join two touching segments on the same track",
		};
	}
	const maximumSeamDurationUs =
		2 * Math.min(fromRange.duration, toRange.duration);
	if (durationUs > maximumSeamDurationUs) {
		return {
			transition: createTransition({
				capability: "blocked",
				durationUs,
				fromSegment,
				material,
				toSegmentId: toSegment.id,
				type: "unknown",
			}),
			issueCode: "TIME_RANGE_INVALID",
			reason:
				"transition duration exceeds the maximum supported by adjacent segments",
		};
	}

	const isExactNativeDissolve =
		profileId === CAPCUT_8_1_PROFILE_ID &&
		isVerifiedCapCut81TransitionMaterial({
			material: material.raw as unknown as JianyingTransitionMaterial,
		});
	if (!isExactNativeDissolve) {
		return {
			transition: createTransition({
				capability: "downgrade",
				durationUs,
				fromSegment,
				material,
				toSegmentId: toSegment.id,
				type: "unknown",
			}),
			issueCode: "FEATURE_DOWNGRADED",
			reason:
				"transition identity is not the verified CapCut 8.1 native dissolve",
		};
	}

	return {
		transition: createTransition({
			capability: "exact",
			durationUs,
			fromSegment,
			material,
			toSegmentId: toSegment.id,
			type: "dissolve",
		}),
	};
}
