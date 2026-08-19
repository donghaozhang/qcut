import type {
	InteropTransition,
	InteropTransitionPreset,
} from "../../draft-interop/document.js";
import type { InteropIssueCode } from "../../draft-interop/issues.js";
import { JIANYING_11_3_BETA4_PROFILE_ID } from "../profiles/jianying-11-3-beta4.js";
import { JIANYING_NATIVE_DISSOLVE_METADATA } from "../transition-mapping.js";
import { isVerifiedJianyingTransitionMaterial } from "../transition-validation.js";
import type { JianyingTransitionMaterial } from "../types.js";
import type {
	RawGraphMaterialNode,
	RawGraphSegmentNode,
} from "./graph-reader.js";

/**
 * JianYing native transition resource ids → the transition lab's QCut
 * reimplementations (L5). Ids come from the local ressdk_db catalog
 * (Cache/ressdk_db/<hash>/rp.db http_cache, 2026-08-19) with the native
 * dissolve id cross-anchored against JIANYING_NATIVE_DISSOLVE_METADATA
 * (same 672x-era family). Preset metadata mirrors
 * apps/web .../transitions/transition-jianying-selected-presets.ts plus the
 * base fade presets. Unknown ids keep today's unadmitted-downgrade path.
 */
const BETA4_TRANSITION_PRESETS: Readonly<
	Record<string, { name: string; preset: InteropTransitionPreset }>
> = {
	"6726711499676455435": {
		name: "左移",
		preset: {
			presetId: "move-left",
			clipType: "push",
			easing: "easeInOutQuint",
			direction: "right",
		},
	},
	"6726711296063967748": {
		name: "右移",
		preset: {
			presetId: "move-right",
			clipType: "push",
			easing: "easeInOutQuint",
			direction: "left",
		},
	},
	"6747979085894390279": {
		name: "翻页",
		preset: {
			presetId: "page-flip",
			clipType: "page-flip",
			easing: "linear",
			direction: "left",
			intensity: 0.7,
		},
	},
	"7316901787762430491": {
		name: "横移模糊",
		preset: {
			presetId: "horizontal-motion-blur",
			clipType: "motion-blur",
			easing: "linear",
			direction: "left",
			intensity: 0.65,
		},
	},
	"6724239388189921806": {
		name: "闪黑",
		preset: {
			presetId: "fade-black",
			clipType: "fade-black",
			easing: "easeInOut",
		},
	},
	"6724845376098013708": {
		name: "闪白",
		preset: {
			presetId: "fade-white",
			clipType: "fade-white",
			easing: "easeInOut",
		},
	},
};

export interface MapBeta4SeamTransitionInput {
	profileId: string;
	material: RawGraphMaterialNode;
	fromSegment: RawGraphSegmentNode;
	toSegment?: RawGraphSegmentNode;
}

export interface MappedBeta4SeamTransition {
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

/**
 * Maps a JianYing beta4 seam transition: the verified native dissolve stays
 * exact; catalogued native transitions become declaration-backed downgrades
 * onto the transition lab's presets; everything else stays an unadmitted
 * downgrade. Seam geometry rules match the CapCut mapper (touching segments,
 * duration ≤ 2×min neighbor).
 */
export function mapBeta4SeamTransition({
	profileId,
	material,
	fromSegment,
	toSegment,
}: MapBeta4SeamTransitionInput): MappedBeta4SeamTransition {
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

	const raw = material.raw as unknown as JianyingTransitionMaterial;
	if (
		profileId === JIANYING_11_3_BETA4_PROFILE_ID &&
		isVerifiedJianyingTransitionMaterial({ material: raw })
	) {
		return {
			transition: {
				...createTransition({
					capability: "exact",
					durationUs,
					fromSegment,
					material,
					toSegmentId: toSegment.id,
					type: "dissolve",
				}),
			},
		};
	}

	const catalogued =
		profileId === JIANYING_11_3_BETA4_PROFILE_ID &&
		typeof raw.resource_id === "string"
			? BETA4_TRANSITION_PRESETS[raw.resource_id]
			: undefined;
	if (catalogued !== undefined && raw.name === catalogued.name) {
		return {
			transition: {
				...createTransition({
					capability: "downgrade",
					durationUs,
					fromSegment,
					material,
					toSegmentId: toSegment.id,
					type: "unknown",
				}),
				preset: catalogued.preset,
				downgrade: {
					approximation: `transition-preset:${catalogued.preset.presetId}`,
					fidelityEvidence:
						"jianying-transition-lab reimplementation (ressdk_db id catalog 2026-08-19); move-left receipt 2026-08-19: push curve aligned (boundary within 9px, seam midpoint exact, same 0.5s centered window), native flourish on the wings unmatched (RMSE 15.0 vs strict ceiling 11.0)",
				},
			},
			issueCode: "FEATURE_DOWNGRADED",
			reason: `transition ${catalogued.name} maps to the QCut preset ${catalogued.preset.presetId}`,
		};
	}

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
			"transition identity is not the verified JianYing native dissolve or a catalogued lab preset",
	};
}

/** Test-only view of the catalogue keys. */
export function listBeta4TransitionPresetResourceIds(): string[] {
	return Object.keys(BETA4_TRANSITION_PRESETS);
}

export { JIANYING_NATIVE_DISSOLVE_METADATA };
