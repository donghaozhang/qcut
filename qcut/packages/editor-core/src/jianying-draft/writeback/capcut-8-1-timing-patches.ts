import type {
	DraftInteropDocumentV1,
	ForeignDraftEnvelopeV1,
} from "../../draft-interop/index.js";
import { CAPCUT_8_1_PROFILE_ID } from "../capcut-8-1-profile.js";
import {
	planSameProfileTimingPatches,
	type PlanSameProfileTimingPatchesResult,
	type SameProfileTimingPatchIssue,
	type SameProfileTimingPatchIssueCode,
	type SameProfileWritebackTimingSnapshot,
} from "./same-profile-timing-patches.js";

export type CapCut81WritebackTimingSnapshot =
	SameProfileWritebackTimingSnapshot;
export type CapCut81TimingPatchIssueCode = SameProfileTimingPatchIssueCode;
export type CapCut81TimingPatchIssue = SameProfileTimingPatchIssue;
export type PlanCapCut81TimingPatchesResult =
	PlanSameProfileTimingPatchesResult;

export function planCapCut81TimingPatches({
	document,
	envelope,
	internalIdBySemanticId,
	snapshot,
}: {
	document: DraftInteropDocumentV1;
	envelope: ForeignDraftEnvelopeV1;
	internalIdBySemanticId: Readonly<Record<string, string>>;
	snapshot: CapCut81WritebackTimingSnapshot;
}): PlanCapCut81TimingPatchesResult {
	return planSameProfileTimingPatches({
		context: {
			productLabel: "CapCut 8.1",
			profileId: CAPCUT_8_1_PROFILE_ID,
		},
		document,
		envelope,
		internalIdBySemanticId,
		snapshot,
	});
}
