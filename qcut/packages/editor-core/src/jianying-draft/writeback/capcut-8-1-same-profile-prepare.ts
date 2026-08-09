import {
	applySameProfileScalarPatches,
	type DraftInteropDocumentV1,
	type ForeignDraftEnvelopeV1,
	type SameProfileJsonPatchErrorCode,
	type SameProfileScalarPatch,
} from "../../draft-interop/index.js";
import { CAPCUT_8_1_PROFILE_ID } from "../capcut-8-1-profile.js";
import {
	planCapCut81TimingPatches,
	type CapCut81TimingPatchIssue,
	type CapCut81TimingPatchIssueCode,
	type CapCut81WritebackTimingSnapshot,
} from "./capcut-8-1-timing-patches.js";

const CAPCUT_8_1_ROOT_CONTENT_PATH = "draft_info.json";

export type CapCut81SameProfilePrepareIssueCode =
	| CapCut81TimingPatchIssueCode
	| SameProfileJsonPatchErrorCode
	| "WRITEBACK_CONTENT_ENTRY_MISSING"
	| "WRITEBACK_CONTENT_BYTES_MISSING"
	| "WRITEBACK_CONTENT_IDENTITY_MISMATCH"
	| "WRITEBACK_PATCH_FILE_UNSUPPORTED";

export interface CapCut81SameProfilePrepareIssue {
	code: CapCut81SameProfilePrepareIssueCode;
	message: string;
	foreignRef?: string;
	semanticId?: string;
	internalId?: string;
}

export type PrepareCapCut81SameProfileWritebackResult =
	| {
			ok: true;
			changed: boolean;
			contentRelativePath: typeof CAPCUT_8_1_ROOT_CONTENT_PATH;
			expectedSourceSha256: string;
			contentBytes: Uint8Array;
			patches: SameProfileScalarPatch[];
			appliedForeignRefs: string[];
			importedSegmentCount: number;
	  }
	| { ok: false; issues: CapCut81SameProfilePrepareIssue[] };

function fail({
	code,
	message,
}: {
	code: CapCut81SameProfilePrepareIssueCode;
	message: string;
}): PrepareCapCut81SameProfileWritebackResult {
	return { ok: false, issues: [{ code, message }] };
}

function toPrepareIssue({
	issue,
}: {
	issue: CapCut81TimingPatchIssue;
}): CapCut81SameProfilePrepareIssue {
	return {
		code: issue.code,
		message: issue.message,
		...(issue.semanticId === undefined ? {} : { semanticId: issue.semanticId }),
		...(issue.internalId === undefined ? {} : { internalId: issue.internalId }),
	};
}

function validateContentIdentity({
	document,
	envelope,
}: {
	document: DraftInteropDocumentV1;
	envelope: ForeignDraftEnvelopeV1;
}):
	| { ok: true; expectedSourceSha256: string }
	| { ok: false; result: PrepareCapCut81SameProfileWritebackResult } {
	const envelopeEntry = envelope.entries.find(
		({ relativePath }) => relativePath === CAPCUT_8_1_ROOT_CONTENT_PATH
	);
	if (envelopeEntry === undefined) {
		return {
			ok: false,
			result: fail({
				code: "WRITEBACK_CONTENT_ENTRY_MISSING",
				message: "The encrypted envelope does not contain draft_info.json.",
			}),
		};
	}
	const sourceFile = document.source.files.find(
		({ relativePath }) => relativePath === CAPCUT_8_1_ROOT_CONTENT_PATH
	);
	if (
		sourceFile === undefined ||
		sourceFile.sha256 !== envelopeEntry.sha256 ||
		sourceFile.byteLength !== envelopeEntry.byteLength
	) {
		return {
			ok: false,
			result: fail({
				code: "WRITEBACK_CONTENT_IDENTITY_MISMATCH",
				message:
					"The normalized baseline and encrypted source disagree on draft_info.json identity.",
			}),
		};
	}
	return { ok: true, expectedSourceSha256: envelopeEntry.sha256 };
}

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
	if (
		baselineDocument.source.profileId !== CAPCUT_8_1_PROFILE_ID ||
		envelope.profileId !== CAPCUT_8_1_PROFILE_ID
	) {
		return fail({
			code: "WRITEBACK_PROFILE_MISMATCH",
			message:
				"Same-profile preparation requires the exact CapCut 8.1 profile.",
		});
	}

	const identity = validateContentIdentity({
		document: baselineDocument,
		envelope,
	});
	if (!identity.ok) return identity.result;
	const sourceBytes = bytesByPath.get(CAPCUT_8_1_ROOT_CONTENT_PATH);
	if (sourceBytes === undefined) {
		return fail({
			code: "WRITEBACK_CONTENT_BYTES_MISSING",
			message: "Verified envelope bytes do not contain draft_info.json.",
		});
	}

	const plan = planCapCut81TimingPatches({
		document: baselineDocument,
		envelope,
		internalIdBySemanticId,
		snapshot,
	});
	if (!plan.ok) {
		return {
			ok: false,
			issues: plan.issues.map((issue) => toPrepareIssue({ issue })),
		};
	}
	if (plan.patches.some(({ file }) => file !== CAPCUT_8_1_ROOT_CONTENT_PATH)) {
		return fail({
			code: "WRITEBACK_PATCH_FILE_UNSUPPORTED",
			message: "CapCut 8.1 timing writeback may only patch draft_info.json.",
		});
	}
	if (plan.patches.length === 0) {
		return {
			ok: true,
			changed: false,
			contentRelativePath: CAPCUT_8_1_ROOT_CONTENT_PATH,
			expectedSourceSha256: identity.expectedSourceSha256,
			contentBytes: sourceBytes,
			patches: [],
			appliedForeignRefs: [],
			importedSegmentCount: plan.importedSegmentCount,
		};
	}

	const applied = applySameProfileScalarPatches({
		patches: plan.patches,
		relativePath: CAPCUT_8_1_ROOT_CONTENT_PATH,
		sourceBytes,
		unknownSubtrees: envelope.unknownSubtrees,
	});
	if (!applied.ok) {
		return {
			ok: false,
			issues: [
				{
					code: applied.code,
					message: applied.message,
					...(applied.foreignRef === undefined
						? {}
						: { foreignRef: applied.foreignRef }),
				},
			],
		};
	}
	return {
		ok: true,
		changed: true,
		contentRelativePath: CAPCUT_8_1_ROOT_CONTENT_PATH,
		expectedSourceSha256: identity.expectedSourceSha256,
		contentBytes: applied.outputBytes,
		patches: plan.patches,
		appliedForeignRefs: applied.appliedForeignRefs,
		importedSegmentCount: plan.importedSegmentCount,
	};
}
