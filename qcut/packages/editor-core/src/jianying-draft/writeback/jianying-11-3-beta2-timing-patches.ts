import type {
	DraftInteropDocumentV1,
	ForeignDraftEnvelopeV1,
} from "../../draft-interop/index.js";
import { JIANYING_11_3_BETA2_PROFILE_ID } from "../profiles/jianying-11-3-beta2.js";
import {
	planSameProfileTimingPatches,
	type PlanSameProfileTimingPatchesResult,
	type SameProfileTimingPatchIssue,
	type SameProfileTimingPatchIssueCode,
	type SameProfileWritebackTimingSnapshot,
} from "./same-profile-timing-patches.js";

export type Jianying113Beta2WritebackTimingSnapshot =
	SameProfileWritebackTimingSnapshot;
export type Jianying113Beta2TimingPatchIssueCode =
	SameProfileTimingPatchIssueCode;
export type Jianying113Beta2TimingPatchIssue = SameProfileTimingPatchIssue;
export type PlanJianying113Beta2TimingPatchesResult =
	PlanSameProfileTimingPatchesResult;

export function planJianying113Beta2TimingPatches({
	document,
	envelope,
	internalIdBySemanticId,
	snapshot,
}: {
	document: DraftInteropDocumentV1;
	envelope: ForeignDraftEnvelopeV1;
	internalIdBySemanticId: Readonly<Record<string, string>>;
	snapshot: Jianying113Beta2WritebackTimingSnapshot;
}): PlanJianying113Beta2TimingPatchesResult {
	return planSameProfileTimingPatches({
		context: {
			productLabel: "Jianying Professional 11.3 beta 2",
			profileId: JIANYING_11_3_BETA2_PROFILE_ID,
		},
		document,
		envelope,
		internalIdBySemanticId,
		snapshot,
	});
}
