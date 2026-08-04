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
