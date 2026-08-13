import {
	QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
	type QCutJianyingProjectExportBlockedReason,
	type QCutJianyingProjectExportFailureReason,
	type QCutJianyingProjectExportIssue,
	type QCutJianyingProjectExportRequest,
	type QCutJianyingProjectExportResult,
} from "./qcut-jianying-project-export-api.js";
import {
	requireAllowedKeys,
	requireExactKeys,
	requireRecord,
	requireSha256,
	requireString,
} from "./strict-json-validation.js";

const MAX_ISSUES = 256;
const MAX_WARNINGS = 256;

function requireProjectId({ value }: { value: unknown }): string {
	return requireString({
		label: "Jianying project export project id",
		maximumLength: 256,
		value,
	});
}

function requirePath({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	return requireString({ label, maximumLength: 4096, value });
}

function requireNullablePath({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string | null {
	return value === null ? null : requirePath({ label, value });
}

function requireBoundedInteger({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): number {
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value < 0 ||
		value > 10_000_000
	) {
		throw new Error(`${label} must be a bounded non-negative integer.`);
	}
	return value;
}

function requireBlockedReason({
	value,
}: {
	value: unknown;
}): QCutJianyingProjectExportBlockedReason {
	switch (value) {
		case "baseline-document-missing":
		case "envelope-unavailable":
		case "operation-busy":
		case "prepare-blocked":
		case "project-not-found":
		case "project-not-imported":
		case "profile-not-writable":
		case "qcut-state-changed":
		case "timeline-not-found":
			return value;
		default:
			throw new Error("Jianying project export blocked reason is unsupported.");
	}
}

function requireFailureReason({
	value,
}: {
	value: unknown;
}): QCutJianyingProjectExportFailureReason {
	switch (value) {
		case "bridge-unavailable":
		case "directory-selection-failed":
		case "export-failed":
		case "unexpected":
			return value;
		default:
			throw new Error("Jianying project export failure reason is unsupported.");
	}
}

function parseIssue({
	index,
	value,
}: {
	index: number;
	value: unknown;
}): QCutJianyingProjectExportIssue {
	const label = `Jianying project export issue ${index}`;
	const record = requireRecord({ label, value });
	requireAllowedKeys({
		allowedKeys: ["code", "foreignRef", "internalId", "message", "semanticId"],
		label,
		record,
		requiredKeys: ["code", "message"],
	});
	return {
		code: requireString({ label: `${label} code`, value: record.code }),
		message: requireString({
			label: `${label} message`,
			maximumLength: 4096,
			value: record.message,
		}),
		...(record.foreignRef === undefined
			? {}
			: {
					foreignRef: requireString({
						label: `${label} foreignRef`,
						value: record.foreignRef,
					}),
				}),
		...(record.internalId === undefined
			? {}
			: {
					internalId: requireString({
						label: `${label} internalId`,
						value: record.internalId,
					}),
				}),
		...(record.semanticId === undefined
			? {}
			: {
					semanticId: requireString({
						label: `${label} semanticId`,
						value: record.semanticId,
					}),
				}),
	};
}

function parseIssues({
	value,
}: {
	value: unknown;
}): QCutJianyingProjectExportIssue[] {
	if (!Array.isArray(value) || value.length > MAX_ISSUES) {
		throw new Error("Jianying project export issues must be a bounded array.");
	}
	return value.map((issue, index) => parseIssue({ index, value: issue }));
}

function parseWarnings({ value }: { value: unknown }): string[] {
	if (!Array.isArray(value) || value.length > MAX_WARNINGS) {
		throw new Error(
			"Jianying project export warnings must be a bounded array."
		);
	}
	return value.map((warning, index) =>
		requireString({
			label: `Jianying project export warning ${index}`,
			maximumLength: 4096,
			value: warning,
		})
	);
}

function requireResultBase({ root }: { root: Record<string, unknown> }): {
	projectId: string;
	schema: typeof QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA;
	schemaVersion: 1;
} {
	if (
		root.schema !== QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA ||
		root.schemaVersion !== 1
	) {
		throw new Error("Jianying project export result schema is unsupported.");
	}
	return {
		projectId: requireProjectId({ value: root.projectId }),
		schema: QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
		schemaVersion: 1,
	};
}

export function parseQCutJianyingProjectExportRequest({
	value,
}: {
	value: unknown;
}): QCutJianyingProjectExportRequest {
	const record = requireRecord({
		label: "Jianying project export request",
		value,
	});
	requireExactKeys({
		keys: ["projectId"],
		label: "Jianying project export request",
		record,
	});
	return { projectId: requireProjectId({ value: record.projectId }) };
}

export function parseQCutJianyingProjectExportResult({
	value,
}: {
	value: unknown;
}): QCutJianyingProjectExportResult {
	const root = requireRecord({
		label: "Jianying project export result",
		value,
	});
	const common = requireResultBase({ root });
	if (root.outcome === "exported") {
		requireExactKeys({
			keys: [
				"changed",
				"contentRelativePath",
				"contentSha256",
				"outcome",
				"patchCount",
				"projectDirectory",
				"projectId",
				"schema",
				"schemaVersion",
				"subdraftId",
				"transactionId",
				"warnings",
			],
			label: "Jianying project export result",
			record: root,
		});
		if (typeof root.changed !== "boolean") {
			throw new Error("Jianying project export changed flag must be boolean.");
		}
		return {
			...common,
			outcome: "exported",
			changed: root.changed,
			contentRelativePath: requirePath({
				label: "Jianying project export content path",
				value: root.contentRelativePath,
			}),
			contentSha256: requireSha256({
				label: "Jianying project export content digest",
				value: root.contentSha256,
			}),
			patchCount: requireBoundedInteger({
				label: "Jianying project export patch count",
				value: root.patchCount,
			}),
			projectDirectory: requirePath({
				label: "Jianying project export registered project directory",
				value: root.projectDirectory,
			}),
			subdraftId: requireString({
				label: "Jianying project export subdraft id",
				maximumLength: 256,
				value: root.subdraftId,
			}),
			transactionId: requireString({
				label: "Jianying project export transaction id",
				maximumLength: 256,
				value: root.transactionId,
			}),
			warnings: parseWarnings({ value: root.warnings }),
		};
	}
	if (root.outcome === "cancelled") {
		requireExactKeys({
			keys: ["outcome", "projectId", "schema", "schemaVersion"],
			label: "Jianying project export result",
			record: root,
		});
		return { ...common, outcome: "cancelled" };
	}
	if (root.outcome === "blocked") {
		requireExactKeys({
			keys: [
				"issues",
				"message",
				"outcome",
				"projectId",
				"reason",
				"schema",
				"schemaVersion",
			],
			label: "Jianying project export result",
			record: root,
		});
		return {
			...common,
			outcome: "blocked",
			issues: parseIssues({ value: root.issues }),
			message: requireString({
				label: "Jianying project export message",
				maximumLength: 16_384,
				value: root.message,
			}),
			reason: requireBlockedReason({ value: root.reason }),
		};
	}
	if (root.outcome === "failed") {
		requireExactKeys({
			keys: [
				"message",
				"outcome",
				"projectDirectory",
				"projectId",
				"reason",
				"schema",
				"schemaVersion",
			],
			label: "Jianying project export result",
			record: root,
		});
		return {
			...common,
			outcome: "failed",
			message: requireString({
				label: "Jianying project export failure message",
				maximumLength: 16_384,
				value: root.message,
			}),
			projectDirectory: requireNullablePath({
				label: "Jianying project export registered project directory",
				value: root.projectDirectory,
			}),
			reason: requireFailureReason({ value: root.reason }),
		};
	}
	throw new Error("Jianying project export result outcome is unsupported.");
}
