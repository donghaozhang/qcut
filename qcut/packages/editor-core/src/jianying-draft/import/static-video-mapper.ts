import type { InteropCapability } from "../../draft-interop/capability.js";
import type { InteropMediaVisual } from "../../draft-interop/document.js";
import type { InteropIssueCode } from "../../draft-interop/issues.js";
import { JIANYING_11_3_BETA4_PROFILE_ID } from "../profiles/jianying-11-3-beta4.js";
import { hasVerifiedBeta4DefaultCompanions } from "./beta4-default-companions.js";
import { hasVerifiedBeta4VideoMaterial } from "./beta4-video-material-defaults.js";
import {
	BETA4_VIDEO_COMPANION_VALIDATORS,
	hasVerifiedBeta4VideoSegmentDefaults,
	readBeta4ClipTransform,
	type Beta4ClipTransform,
} from "./beta4-video-segment-defaults.js";
import type {
	RawDraftGraph,
	RawGraphMaterialNode,
	RawGraphSegmentNode,
} from "./graph-reader.js";
import {
	mapBeta4PositionKeyframes,
	type Beta4PositionKeyframeResult,
} from "./beta4-position-keyframes.js";

export interface MapStaticVideoInput {
	profileId: string;
	material: RawGraphMaterialNode;
	segment: RawGraphSegmentNode;
	graph: RawDraftGraph;
	trackIndex: number;
	canvasWidth: number;
	canvasHeight: number;
	fps: number;
}

export interface MappedStaticVideo {
	capability: InteropCapability;
	issueCode?: InteropIssueCode;
	reason?: string;
	visual?: InteropMediaVisual;
}

function opaque({ reason }: { reason: string }): MappedStaticVideo {
	return { capability: "opaque", issueCode: "FEATURE_OPAQUE", reason };
}

/**
 * Converts the verified clip transform into QCut canvas conventions and
 * merges it with any mapped position keyframes. JianYing dialect → QCut:
 * transform is in half-canvas units (real px = value × canvas/2, receipt:
 * KF01 lab e2e). Rotation carries over sign-unchanged — both dialects are
 * screen-clockwise-positive (receipt: jianying-parity transform-rotation
 * 2026-08-19; an eyeballed "counterclockwise" first read was wrong and the
 * frame comparator caught the mirror).
 */
function buildStaticVisual({
	canvasHeight,
	canvasWidth,
	clipTransform,
	positionKeyframes,
}: {
	canvasHeight: number;
	canvasWidth: number;
	clipTransform: Beta4ClipTransform;
	positionKeyframes: Beta4PositionKeyframeResult;
}): InteropMediaVisual | undefined {
	const base: InteropMediaVisual =
		positionKeyframes.kind === "mapped"
			? { ...positionKeyframes.visual }
			: {
					xPx: (clipTransform.transformX * canvasWidth) / 2,
					yPx: (clipTransform.transformY * canvasHeight) / 2,
				};
	if (clipTransform.rotationDegrees !== 0) {
		base.rotationDegrees = clipTransform.rotationDegrees;
	}
	if (clipTransform.scaleX !== 1) {
		base.scaleX = clipTransform.scaleX;
		base.scaleY = clipTransform.scaleY;
	}
	if (clipTransform.alpha !== 1) {
		base.opacity = clipTransform.alpha;
	}
	const isDefault =
		positionKeyframes.kind !== "mapped" &&
		base.xPx === 0 &&
		base.yPx === 0 &&
		base.rotationDegrees === undefined &&
		base.scaleX === undefined &&
		base.opacity === undefined;
	return isDefault ? undefined : base;
}

/** Classifies the real beta4 local-video, default-processing subset. */
export function mapStaticVideo({
	profileId,
	material,
	segment,
	graph,
	trackIndex,
	canvasWidth,
	canvasHeight,
	fps,
}: MapStaticVideoInput): MappedStaticVideo {
	if (profileId !== JIANYING_11_3_BETA4_PROFILE_ID) {
		return {
			capability: "blocked",
			issueCode: "FEATURE_OPAQUE",
			reason: "video material is outside the verified beta4 profile",
		};
	}
	if (!hasVerifiedBeta4VideoMaterial({ material, segment })) {
		return opaque({
			reason:
				"video source, trim, crop, algorithm, or material state is outside the verified beta4 local-video subset",
		});
	}
	const positionKeyframes = mapBeta4PositionKeyframes({
		canvasWidth,
		fps,
		segment,
	});
	if (positionKeyframes.kind === "unsupported") {
		return opaque({
			reason:
				"video position keyframes are preserved but fall outside the verified beta4 linear X-only subset",
		});
	}
	if (
		!hasVerifiedBeta4VideoSegmentDefaults({
			positionKeyframes,
			segment,
			trackIndex,
		})
	) {
		return opaque({
			reason:
				"video transform, playback, visibility, color, mask, or keyframe state is preserved but not editable",
		});
	}
	if (
		!hasVerifiedBeta4DefaultCompanions({
			graph,
			segment,
			validators: BETA4_VIDEO_COMPANION_VALIDATORS,
		})
	) {
		return opaque({
			reason:
				"video companion processing is preserved but falls outside the verified beta4 defaults",
		});
	}
	const clipTransform = readBeta4ClipTransform({
		positionKeyframes,
		uniformScale: segment.raw.uniform_scale,
		value: segment.raw.clip,
	});
	if (clipTransform === null) {
		// Unreachable after the defaults check, but fail closed regardless.
		return opaque({
			reason: "video clip transform is outside the verified beta4 subset",
		});
	}
	const visual = buildStaticVisual({
		canvasHeight,
		canvasWidth,
		clipTransform,
		positionKeyframes,
	});
	return {
		capability: "exact",
		...(visual === undefined ? {} : { visual }),
	};
}
