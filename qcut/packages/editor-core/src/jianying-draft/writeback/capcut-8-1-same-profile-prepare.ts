import type {
	DraftInteropDocumentV1,
	ForeignDraftEnvelopeV1,
} from "../../draft-interop/index.js";
import { CAPCUT_8_1_PROFILE_ID } from "../capcut-8-1-profile.js";
import {
	planCapCut81TimingPatches,
	type CapCut81TimingPatchIssueCode,
	type CapCut81WritebackTimingSnapshot,
} from "./capcut-8-1-timing-patches.js";
import {
	prepareSameProfileWriteback,
	type PrepareSameProfileWritebackResult,
	type SameProfilePrepareIssue,
	type SameProfilePrepareIssueCode,
} from "./same-profile-prepare.js";

const CAPCUT_8_1_ROOT_CONTENT_PATH = "draft_info.json";

export type CapCut81SameProfilePrepareIssueCode =
	| CapCut81TimingPatchIssueCode
	| SameProfilePrepareIssueCode;
export type CapCut81SameProfilePrepareIssue = SameProfilePrepareIssue;
export type PrepareCapCut81SameProfileWritebackResult =
	PrepareSameProfileWritebackResult<typeof CAPCUT_8_1_ROOT_CONTENT_PATH>;

export function prepareCapCut81SameProfileWriteback({
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
	snapshot: CapCut81WritebackTimingSnapshot;
}): PrepareCapCut81SameProfileWritebackResult {
	return prepareSameProfileWriteback({
		baselineDocument,
		bytesByPath,
		context: {
			contentRelativePath: CAPCUT_8_1_ROOT_CONTENT_PATH,
			productLabel: "CapCut 8.1",
			profileId: CAPCUT_8_1_PROFILE_ID,
		},
		envelope,
		internalIdBySemanticId,
		planTimingPatches: planCapCut81TimingPatches,
		snapshot,
	});
}
