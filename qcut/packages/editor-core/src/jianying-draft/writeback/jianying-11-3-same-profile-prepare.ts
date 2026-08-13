import type {
	DraftInteropDocumentV1,
	ForeignDraftEnvelopeV1,
} from "../../draft-interop/index.js";
import {
	getDraftProfile,
	type Jianying113ProfileId,
} from "../profiles/index.js";
import {
	planJianying113TimingPatches,
	type Jianying113TimingPatchIssueCode,
	type Jianying113WritebackTimingSnapshot,
} from "./jianying-11-3-timing-patches.js";
import {
	prepareSameProfileWriteback,
	type PrepareSameProfileWritebackResult,
	type SameProfilePrepareIssue,
	type SameProfilePrepareIssueCode,
} from "./same-profile-prepare.js";

export const JIANYING_11_3_CONTENT_PATH = "draft_content.json";

export type Jianying113SameProfilePrepareIssueCode =
	| Jianying113TimingPatchIssueCode
	| SameProfilePrepareIssueCode;
export type Jianying113SameProfilePrepareIssue = SameProfilePrepareIssue;
export type PrepareJianying113SameProfileWritebackResult =
	PrepareSameProfileWritebackResult<typeof JIANYING_11_3_CONTENT_PATH>;

export function prepareJianying113SameProfileWriteback({
	baselineDocument,
	bytesByPath,
	envelope,
	internalIdBySemanticId,
	profileId,
	snapshot,
}: {
	baselineDocument: DraftInteropDocumentV1;
	bytesByPath: ReadonlyMap<string, Uint8Array>;
	envelope: ForeignDraftEnvelopeV1;
	internalIdBySemanticId: Readonly<Record<string, string>>;
	profileId: Jianying113ProfileId;
	snapshot: Jianying113WritebackTimingSnapshot;
}): PrepareJianying113SameProfileWritebackResult {
	const appVersion = getDraftProfile({ profileId })?.appVersions[0];
	return prepareSameProfileWriteback({
		baselineDocument,
		bytesByPath,
		context: {
			contentRelativePath: JIANYING_11_3_CONTENT_PATH,
			productLabel: `Jianying Professional ${appVersion ?? "11.3"}`,
			profileId,
		},
		envelope,
		internalIdBySemanticId,
		planTimingPatches: ({
			document,
			envelope: timingEnvelope,
			internalIdBySemanticId: timingInternalIds,
			snapshot: timingSnapshot,
		}) =>
			planJianying113TimingPatches({
				document,
				envelope: timingEnvelope,
				internalIdBySemanticId: timingInternalIds,
				profileId,
				snapshot: timingSnapshot,
			}),
		snapshot,
	});
}
