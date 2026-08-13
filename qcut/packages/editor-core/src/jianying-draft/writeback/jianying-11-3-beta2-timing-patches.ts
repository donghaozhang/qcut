import { JIANYING_11_3_BETA2_PROFILE_ID } from "../profiles/jianying-11-3-beta2.js";
import {
	planJianying113TimingPatches,
	type Jianying113TimingPatchIssue,
	type Jianying113TimingPatchIssueCode,
	type Jianying113WritebackTimingSnapshot,
	type PlanJianying113TimingPatchesResult,
} from "./jianying-11-3-timing-patches.js";
import type {
	DraftInteropDocumentV1,
	ForeignDraftEnvelopeV1,
} from "../../draft-interop/index.js";

export type Jianying113Beta2WritebackTimingSnapshot =
	Jianying113WritebackTimingSnapshot;
export type Jianying113Beta2TimingPatchIssueCode =
	Jianying113TimingPatchIssueCode;
export type Jianying113Beta2TimingPatchIssue = Jianying113TimingPatchIssue;
export type PlanJianying113Beta2TimingPatchesResult =
	PlanJianying113TimingPatchesResult;

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
	return planJianying113TimingPatches({
		document,
		envelope,
		internalIdBySemanticId,
		profileId: JIANYING_11_3_BETA2_PROFILE_ID,
		snapshot,
	});
}
