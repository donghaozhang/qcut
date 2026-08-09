/**
 * Stable interop issue codes (JYI-001).
 *
 * Codes are a public contract: plans, warning fingerprints, CLI output, and
 * tests all key on them, so a code is never renamed or reused. UI copy hangs
 * off the code — the `message` field is advisory, never load-bearing.
 *
 * @module @qcut/editor-core/draft-interop/issues
 */

export const INTEROP_ISSUE_CODES = [
	// Source and profile
	"SOURCE_FILE_MISSING",
	"SOURCE_FILE_CHANGED",
	"SOURCE_FILE_TOO_LARGE",
	"PAYLOAD_ENCRYPTED",
	"PAYLOAD_OPAQUE",
	"PROFILE_AMBIGUOUS",
	"PROFILE_UNSUPPORTED",
	"PROFILE_READ_ONLY",
	// Graph integrity
	"REF_BROKEN",
	"REF_DUPLICATE_ID",
	"REF_CYCLE",
	"TIME_RANGE_INVALID",
	"TRACK_OVERLAP",
	// Resources
	"RESOURCE_MISSING",
	"RESOURCE_AMBIGUOUS",
	"RESOURCE_LICENSE_RESTRICTED",
	"FONT_GLYPH_COVERAGE_INCOMPLETE",
	// Feature mapping
	"FEATURE_DOWNGRADED",
	"FEATURE_OPAQUE",
	"FEATURE_BLOCKED",
	// Preservation
	"UNKNOWN_SUBTREE_PRESERVED",
	"UNKNOWN_SUBTREE_OWNERSHIP_CONFLICT",
	"ENVELOPE_UNAVAILABLE",
	// Document validation
	"DOCUMENT_MALFORMED",
] as const;

export type InteropIssueCode = (typeof INTEROP_ISSUE_CODES)[number];

const issueCodeSet = new Set<string>(INTEROP_ISSUE_CODES);

export function isInteropIssueCode(value: unknown): value is InteropIssueCode {
	return typeof value === "string" && issueCodeSet.has(value);
}

export type InteropIssueSeverity = "info" | "warning" | "error";

export const INTEROP_ISSUE_SEVERITIES: readonly InteropIssueSeverity[] = [
	"info",
	"warning",
	"error",
] as const;

export function isInteropIssueSeverity(
	value: unknown
): value is InteropIssueSeverity {
	return value === "info" || value === "warning" || value === "error";
}

export interface InteropIssue {
	code: InteropIssueCode;
	severity: InteropIssueSeverity;
	/** Human-readable summary; advisory only, never part of the fingerprint. */
	message: string;
	/** JSON-pointer-like location inside the source document, when known. */
	path?: string;
	/** Semantic id (timeline/track/segment/resource/link) the issue is about. */
	subjectId?: string;
}

/**
 * Deterministic identity used for warning acceptance and plan comparison.
 * Mirrors the exporter's fingerprint contract: only stable fields
 * participate — never the message.
 */
export function createInteropIssueFingerprint({
	issue,
}: {
	issue: InteropIssue;
}): string {
	return [
		issue.code,
		issue.severity,
		issue.subjectId ?? "",
		issue.path ?? "",
	].join("\u001f");
}

/** Sorted fingerprints of every issue at the given severity. */
export function collectInteropIssueFingerprints({
	issues,
	severity,
}: {
	issues: readonly InteropIssue[];
	severity: InteropIssueSeverity;
}): string[] {
	return issues
		.filter((issue) => issue.severity === severity)
		.map((issue) => createInteropIssueFingerprint({ issue }))
		.sort();
}
