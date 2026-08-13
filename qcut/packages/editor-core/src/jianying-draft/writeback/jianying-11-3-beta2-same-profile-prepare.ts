import type {
	DraftInteropDocumentV1,
	ForeignDraftEnvelopeV1,
} from "../../draft-interop/index.js";
import { JIANYING_11_3_BETA2_PROFILE_ID } from "../profiles/jianying-11-3-beta2.js";
import {
	planJianying113Beta2TimingPatches,
	type Jianying113Beta2TimingPatchIssueCode,
	type Jianying113Beta2WritebackTimingSnapshot,
} from "./jianying-11-3-beta2-timing-patches.js";
import {
	prepareSameProfileWriteback,
	type PrepareSameProfileWritebackResult,
	type SameProfilePrepareIssue,
	type SameProfilePrepareIssueCode,
} from "./same-profile-prepare.js";

export const JIANYING_11_3_BETA2_CONTENT_PATH = "draft_content.json";

export type Jianying113Beta2SameProfilePrepareIssueCode =
	| Jianying113Beta2TimingPatchIssueCode
	| SameProfilePrepareIssueCode;
export type Jianying113Beta2SameProfilePrepareIssue = SameProfilePrepareIssue;
export type PrepareJianying113Beta2SameProfileWritebackResult =
	PrepareSameProfileWritebackResult<typeof JIANYING_11_3_BETA2_CONTENT_PATH>;

export function prepareJianying113Beta2SameProfileWriteback({
	baselineDocument,
	bytesByPath,
	envelope,
	internalIdBySemanticId,
	snapshot,
}: {
	baselineDocument: DraftInteropDocumentV1;
	bytesByPath: ReadonlyMap<string, Uint8Array>;
	envelope: ForeignDraftEnvelopeV1;
	internalIdBySemanticId: Readonly<Record<string, string>>;
	snapshot: Jianying113Beta2WritebackTimingSnapshot;
}): PrepareJianying113Beta2SameProfileWritebackResult {
	return prepareSameProfileWriteback({
		baselineDocument,
		bytesByPath,
		context: {
			contentRelativePath: JIANYING_11_3_BETA2_CONTENT_PATH,
			productLabel: "Jianying Professional 11.3 beta 2",
			profileId: JIANYING_11_3_BETA2_PROFILE_ID,
		},
		envelope,
		internalIdBySemanticId,
		planTimingPatches: planJianying113Beta2TimingPatches,
		snapshot,
	});
}
