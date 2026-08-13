import type {
	DraftInteropDocumentV1,
	ForeignDraftEnvelopeV1,
} from "../../draft-interop/index.js";
import {
	getDraftProfile,
	type Jianying113ProfileId,
} from "../profiles/index.js";
import {
	planSameProfileTimingPatches,
	type PlanSameProfileTimingPatchesResult,
	type SameProfileTimingPatchIssue,
	type SameProfileTimingPatchIssueCode,
	type SameProfileWritebackTimingSnapshot,
} from "./same-profile-timing-patches.js";

export type Jianying113WritebackTimingSnapshot =
	SameProfileWritebackTimingSnapshot;
export type Jianying113TimingPatchIssueCode = SameProfileTimingPatchIssueCode;
export type Jianying113TimingPatchIssue = SameProfileTimingPatchIssue;
export type PlanJianying113TimingPatchesResult =
	PlanSameProfileTimingPatchesResult;

function getProductLabel({
	profileId,
}: {
	profileId: Jianying113ProfileId;
}): string {
	const appVersion = getDraftProfile({ profileId })?.appVersions[0];
	return `Jianying Professional ${appVersion ?? "11.3"}`;
}

export function planJianying113TimingPatches({
	document,
	envelope,
	internalIdBySemanticId,
	profileId,
	snapshot,
}: {
	document: DraftInteropDocumentV1;
	envelope: ForeignDraftEnvelopeV1;
	internalIdBySemanticId: Readonly<Record<string, string>>;
	profileId: Jianying113ProfileId;
	snapshot: Jianying113WritebackTimingSnapshot;
}): PlanJianying113TimingPatchesResult {
	return planSameProfileTimingPatches({
		context: {
			productLabel: getProductLabel({ profileId }),
			profileId,
		},
		document,
		envelope,
		internalIdBySemanticId,
		snapshot,
	});
}
