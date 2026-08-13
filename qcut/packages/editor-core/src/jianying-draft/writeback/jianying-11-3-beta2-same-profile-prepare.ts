import type {
	DraftInteropDocumentV1,
	ForeignDraftEnvelopeV1,
} from "../../draft-interop/index.js";
import { JIANYING_11_3_BETA2_PROFILE_ID } from "../profiles/jianying-11-3-beta2.js";
import {
	JIANYING_11_3_CONTENT_PATH,
	prepareJianying113SameProfileWriteback,
	type Jianying113SameProfilePrepareIssue,
	type Jianying113SameProfilePrepareIssueCode,
	type PrepareJianying113SameProfileWritebackResult,
} from "./jianying-11-3-same-profile-prepare.js";
import type { Jianying113WritebackTimingSnapshot } from "./jianying-11-3-timing-patches.js";

export const JIANYING_11_3_BETA2_CONTENT_PATH = JIANYING_11_3_CONTENT_PATH;

export type Jianying113Beta2SameProfilePrepareIssueCode =
	Jianying113SameProfilePrepareIssueCode;
export type Jianying113Beta2SameProfilePrepareIssue =
	Jianying113SameProfilePrepareIssue;
export type PrepareJianying113Beta2SameProfileWritebackResult =
	PrepareJianying113SameProfileWritebackResult;

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
	snapshot: Jianying113WritebackTimingSnapshot;
}): PrepareJianying113Beta2SameProfileWritebackResult {
	return prepareJianying113SameProfileWriteback({
		baselineDocument,
		bytesByPath,
		envelope,
		internalIdBySemanticId,
		profileId: JIANYING_11_3_BETA2_PROFILE_ID,
		snapshot,
	});
}
