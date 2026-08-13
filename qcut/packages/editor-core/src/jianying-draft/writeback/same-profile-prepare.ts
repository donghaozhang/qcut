import {
	applySameProfileScalarPatches,
	type DraftInteropDocumentV1,
	type ForeignDraftEnvelopeV1,
	type SameProfileJsonPatchErrorCode,
	type SameProfileScalarPatch,
} from "../../draft-interop/index.js";
import type {
	PlanSameProfileTimingPatchesResult,
	SameProfileTimingPatchIssue,
	SameProfileTimingPatchIssueCode,
	SameProfileWritebackTimingSnapshot,
} from "./same-profile-timing-patches.js";

export type SameProfilePrepareIssueCode =
	| SameProfileTimingPatchIssueCode
	| SameProfileJsonPatchErrorCode
	| "WRITEBACK_CONTENT_ENTRY_MISSING"
	| "WRITEBACK_CONTENT_BYTES_MISSING"
	| "WRITEBACK_CONTENT_IDENTITY_MISMATCH"
	| "WRITEBACK_PATCH_FILE_UNSUPPORTED";

export interface SameProfilePrepareIssue {
	code: SameProfilePrepareIssueCode;
	message: string;
	foreignRef?: string;
	semanticId?: string;
	internalId?: string;
}

export type PrepareSameProfileWritebackResult<ContentPath extends string> =
	| {
			ok: true;
			changed: boolean;
			contentRelativePath: ContentPath;
			expectedSourceSha256: string;
			contentBytes: Uint8Array;
			patches: SameProfileScalarPatch[];
			appliedForeignRefs: string[];
			importedSegmentCount: number;
	  }
	| { ok: false; issues: SameProfilePrepareIssue[] };

export interface SameProfilePrepareContext<ContentPath extends string> {
	contentRelativePath: ContentPath;
	productLabel: string;
	profileId: string;
}

export type PlanSameProfileTimingPatches = (options: {
	document: DraftInteropDocumentV1;
	envelope: ForeignDraftEnvelopeV1;
	internalIdBySemanticId: Readonly<Record<string, string>>;
	snapshot: SameProfileWritebackTimingSnapshot;
}) => PlanSameProfileTimingPatchesResult;

function fail<ContentPath extends string>({
	code,
	message,
}: {
	code: SameProfilePrepareIssueCode;
	message: string;
}): PrepareSameProfileWritebackResult<ContentPath> {
	return { ok: false, issues: [{ code, message }] };
}

function toPrepareIssue({
	issue,
}: {
	issue: SameProfileTimingPatchIssue;
}): SameProfilePrepareIssue {
	return {
		code: issue.code,
		message: issue.message,
		...(issue.semanticId === undefined ? {} : { semanticId: issue.semanticId }),
		...(issue.internalId === undefined ? {} : { internalId: issue.internalId }),
	};
}

function validateContentIdentity<ContentPath extends string>({
	contentRelativePath,
	document,
	envelope,
}: {
	contentRelativePath: ContentPath;
	document: DraftInteropDocumentV1;
	envelope: ForeignDraftEnvelopeV1;
}):
	| { ok: true; expectedSourceSha256: string }
	| { ok: false; result: PrepareSameProfileWritebackResult<ContentPath> } {
	const envelopeEntry = envelope.entries.find(
		({ relativePath }) => relativePath === contentRelativePath
	);
	if (envelopeEntry === undefined) {
		return {
			ok: false,
			result: fail({
				code: "WRITEBACK_CONTENT_ENTRY_MISSING",
				message: `The encrypted envelope does not contain ${contentRelativePath}.`,
			}),
		};
	}
	const sourceFile = document.source.files.find(
		({ relativePath }) => relativePath === contentRelativePath
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
				message: `The normalized baseline and encrypted source disagree on ${contentRelativePath} identity.`,
			}),
		};
	}
	return { ok: true, expectedSourceSha256: envelopeEntry.sha256 };
}

export function prepareSameProfileWriteback<ContentPath extends string>({
	baselineDocument,
	bytesByPath,
	context,
	envelope,
	internalIdBySemanticId,
	planTimingPatches,
	snapshot,
}: {
	baselineDocument: DraftInteropDocumentV1;
	bytesByPath: ReadonlyMap<string, Uint8Array>;
	context: SameProfilePrepareContext<ContentPath>;
	envelope: ForeignDraftEnvelopeV1;
	internalIdBySemanticId: Readonly<Record<string, string>>;
	planTimingPatches: PlanSameProfileTimingPatches;
	snapshot: SameProfileWritebackTimingSnapshot;
}): PrepareSameProfileWritebackResult<ContentPath> {
	if (
		baselineDocument.source.profileId !== context.profileId ||
		envelope.profileId !== context.profileId
	) {
		return fail({
			code: "WRITEBACK_PROFILE_MISMATCH",
			message: `Same-profile preparation requires the exact ${context.productLabel} profile.`,
		});
	}

	const identity = validateContentIdentity({
		contentRelativePath: context.contentRelativePath,
		document: baselineDocument,
		envelope,
	});
	if (!identity.ok) return identity.result;
	const sourceBytes = bytesByPath.get(context.contentRelativePath);
	if (sourceBytes === undefined) {
		return fail({
			code: "WRITEBACK_CONTENT_BYTES_MISSING",
			message: `Verified envelope bytes do not contain ${context.contentRelativePath}.`,
		});
	}

	const plan = planTimingPatches({
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
	if (plan.patches.some(({ file }) => file !== context.contentRelativePath)) {
		return fail({
			code: "WRITEBACK_PATCH_FILE_UNSUPPORTED",
			message: `${context.productLabel} timing writeback may only patch ${context.contentRelativePath}.`,
		});
	}
	if (plan.patches.length === 0) {
		return {
			ok: true,
			changed: false,
			contentRelativePath: context.contentRelativePath,
			expectedSourceSha256: identity.expectedSourceSha256,
			contentBytes: sourceBytes,
			patches: [],
			appliedForeignRefs: [],
			importedSegmentCount: plan.importedSegmentCount,
		};
	}

	const applied = applySameProfileScalarPatches({
		patches: plan.patches,
		relativePath: context.contentRelativePath,
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
		contentRelativePath: context.contentRelativePath,
		expectedSourceSha256: identity.expectedSourceSha256,
		contentBytes: applied.outputBytes,
		patches: plan.patches,
		appliedForeignRefs: applied.appliedForeignRefs,
		importedSegmentCount: plan.importedSegmentCount,
	};
}
