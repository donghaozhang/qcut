import type { InteropCapability } from "../../draft-interop/capability.js";
import type { InteropMediaVisual } from "../../draft-interop/document.js";
import type { InteropIssueCode } from "../../draft-interop/issues.js";
import { JIANYING_11_3_BETA4_PROFILE_ID } from "../profiles/jianying-11-3-beta4.js";
import { hasVerifiedBeta4DefaultCompanions } from "./beta4-default-companions.js";
import { hasVerifiedBeta4VideoMaterial } from "./beta4-video-material-defaults.js";
import {
	BETA4_VIDEO_COMPANION_VALIDATORS,
	hasVerifiedBeta4VideoSegmentDefaults,
} from "./beta4-video-segment-defaults.js";
import type {
	RawDraftGraph,
	RawGraphMaterialNode,
	RawGraphSegmentNode,
} from "./graph-reader.js";
import { mapBeta4PositionKeyframes } from "./beta4-position-keyframes.js";

export interface MapStaticVideoInput {
	profileId: string;
	material: RawGraphMaterialNode;
	segment: RawGraphSegmentNode;
	graph: RawDraftGraph;
	trackIndex: number;
	canvasWidth: number;
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

/** Classifies the real beta4 local-video, default-processing subset. */
export function mapStaticVideo({
	profileId,
	material,
	segment,
	graph,
	trackIndex,
	canvasWidth,
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
	return {
		capability: "exact",
		...(positionKeyframes.kind === "mapped"
			? { visual: positionKeyframes.visual }
			: {}),
	};
}
