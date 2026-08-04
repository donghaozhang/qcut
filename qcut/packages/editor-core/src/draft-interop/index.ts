/**
 * @qcut/editor-core draft-interop exports — the bidirectional semantic
 * layer between JianYing/CapCut drafts and QCut (JYI-001+).
 * @module @qcut/editor-core/draft-interop
 */

export {
	aggregateInteropCapabilities,
	canCommitInteropNode,
	combineInteropCapabilities,
	INTEROP_CAPABILITIES,
	isInteropCapability,
	type InteropCapability,
	type InteropCapabilityAggregate,
	type InteropCommitGateInput,
} from "./capability.js";

export {
	collectInteropIssueFingerprints,
	createInteropIssueFingerprint,
	INTEROP_ISSUE_CODES,
	INTEROP_ISSUE_SEVERITIES,
	isInteropIssueCode,
	isInteropIssueSeverity,
	type InteropIssue,
	type InteropIssueCode,
	type InteropIssueSeverity,
} from "./issues.js";

export {
	evaluateUnknownSubtree,
	evaluateUnknownSubtrees,
	INTEROP_DIRTY_DOMAINS,
	isInteropDirtyDomain,
	type InteropDirtyDomain,
	type UnknownSubtreeDecision,
	type UnknownSubtreeOwnership,
} from "./dirty-domains.js";

export {
	assertNoRestrictedProvenanceFields,
	PROVENANCE_RESTRICTED_KEYS,
	redactProvenanceForEvidence,
	type DraftImportProvenanceV1,
	type ProfileDetectionEvidence,
	type ProfileDetectionOutcome,
	type ProfileDetectionSignal,
	type ProfileDetectionSignalKind,
	type RawNodeBinding,
	type RedactedProvenanceEvidence,
} from "./provenance.js";

export {
	evaluateEnvelopeFileCandidate,
	FOREIGN_ENVELOPE_SCHEMA_VERSION,
	parseForeignDraftEnvelopeV1,
	validateForeignEnvelopeEntries,
	type EnvelopeAllowlistEvidenceKind,
	type EnvelopeFileDecision,
	type ForeignDraftEnvelopeV1,
	type ForeignEnvelopeAllowlistEntry,
	type ForeignEnvelopeEntry,
	type ForeignEnvelopePayloadRef,
	type ParseForeignDraftEnvelopeResult,
} from "./foreign-envelope.js";

export {
	FOREIGN_ENVELOPE_PAYLOAD_MAX_BYTES,
	FOREIGN_ENVELOPE_PAYLOAD_SCHEMA_VERSION,
	verifyForeignEnvelopePayload,
	type ForeignEnvelopePayloadEntryV1,
	type ForeignEnvelopePayloadV1,
	type ForeignEnvelopePayloadVerificationCode,
	type VerifyForeignEnvelopePayloadResult,
} from "./foreign-envelope-payload.js";

export {
	DRAFT_INTEROP_SCHEMA_VERSION,
	DRAFT_INTEROP_TIME_UNIT,
	parseDraftInteropDocumentV1,
	type DraftInteropDocumentV1,
	type DraftSourceDescriptor,
	type DraftSourceFile,
	type DraftSourceFileClassification,
	type DraftSourceFileRole,
	type DraftSourcePlatform,
	type DraftSourceProduct,
	type InteropLink,
	type InteropLinkType,
	type InteropProject,
	type InteropResource,
	type InteropResourceKind,
	type InteropResourceStatus,
	type InteropSegment,
	type InteropSegmentKind,
	type InteropTimeline,
	type InteropTimeRange,
	type InteropTrack,
	type InteropTrackKind,
	type ParseDraftInteropDocumentResult,
} from "./document.js";

export {
	canonicalizeQCutImportBundleForDigest,
	deriveImportInternalId,
	parseQCutImportBundleV1,
	QCUT_IMPORT_BUNDLE_DIGEST_PLACEHOLDER,
	QCUT_IMPORT_BUNDLE_SCHEMA_VERSION,
	type ParseQCutImportBundleResult,
	type QCutImportBundleBuildIdentity,
	type QCutImportBundleResourceStaging,
	type QCutImportBundleV1,
	type QCutImportProjectNameConflictPolicy,
} from "./import-bundle.js";
