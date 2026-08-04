/**
 * IPC/CLI input allowlist for the import runtime (JYI-006).
 *
 * Fail-closed: unknown keys are rejected, paths must be absolute with no
 * traversal or NUL bytes, and numeric limits are clamped to sane bounds.
 * The validated request is the ONLY shape the Electron handler and CLI may
 * pass into discovery — raw renderer input never reaches the filesystem.
 *
 * @module @qcut/jianying-draft-import/runtime-validation
 */

import { isAbsolute } from "node:path";

const INSPECT_REQUEST_KEYS = new Set([
	"draftPath",
	"maxFileBytes",
	"maxTotalBytes",
]);

const MAX_PATH_LENGTH = 4096;
const MAX_LIMIT_BYTES = 1024 * 1024 * 1024;

export interface DraftInspectRequest {
	draftPath: string;
	maxFileBytes?: number;
	maxTotalBytes?: number;
}

export interface DraftRequestValidationIssue {
	field: string;
	message: string;
}

export type ValidateDraftInspectRequestResult =
	| { ok: true; request: DraftInspectRequest }
	| { ok: false; issues: DraftRequestValidationIssue[] };

function validatePath({
	value,
	issues,
}: {
	value: unknown;
	issues: DraftRequestValidationIssue[];
}): string | undefined {
	if (typeof value !== "string" || value.length === 0) {
		issues.push({ field: "draftPath", message: "must be a non-empty string" });
		return undefined;
	}
	if (value.length > MAX_PATH_LENGTH) {
		issues.push({ field: "draftPath", message: "path is too long" });
		return undefined;
	}
	if (value.includes("\u0000")) {
		issues.push({ field: "draftPath", message: "path contains a NUL byte" });
		return undefined;
	}
	if (!isAbsolute(value)) {
		issues.push({ field: "draftPath", message: "path must be absolute" });
		return undefined;
	}
	const segments = value.split(/[\\/]+/);
	if (segments.includes("..")) {
		issues.push({
			field: "draftPath",
			message: "path must not contain traversal segments",
		});
		return undefined;
	}
	return value;
}

function validateLimit({
	value,
	field,
	issues,
}: {
	value: unknown;
	field: string;
	issues: DraftRequestValidationIssue[];
}): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value <= 0 ||
		value > MAX_LIMIT_BYTES
	) {
		issues.push({
			field,
			message: `must be a positive integer no larger than ${MAX_LIMIT_BYTES}`,
		});
		return undefined;
	}
	return value;
}

/** Validates an untrusted inspect request from IPC or the CLI. */
export function validateDraftInspectRequest(
	value: unknown
): ValidateDraftInspectRequestResult {
	const issues: DraftRequestValidationIssue[] = [];
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return {
			ok: false,
			issues: [{ field: "", message: "request must be an object" }],
		};
	}
	const record = value as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		if (!INSPECT_REQUEST_KEYS.has(key)) {
			issues.push({ field: key, message: "unknown key" });
		}
	}
	const draftPath = validatePath({ value: record.draftPath, issues });
	const maxFileBytes = validateLimit({
		value: record.maxFileBytes,
		field: "maxFileBytes",
		issues,
	});
	const maxTotalBytes = validateLimit({
		value: record.maxTotalBytes,
		field: "maxTotalBytes",
		issues,
	});
	if (issues.length > 0 || draftPath === undefined) {
		return { ok: false, issues };
	}
	return {
		ok: true,
		request: {
			draftPath,
			...(maxFileBytes === undefined ? {} : { maxFileBytes }),
			...(maxTotalBytes === undefined ? {} : { maxTotalBytes }),
		},
	};
}
