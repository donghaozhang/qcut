import {
	QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA,
	type QCutJianyingProjectImportBlockedReason,
	type QCutJianyingProjectImportFailureReason,
	type QCutJianyingProjectImportRequest,
	type QCutJianyingProjectImportResult,
} from "./qcut-jianying-project-import-api.js";
import {
	requireAllowedKeys,
	requireExactKeys,
	requireRecord,
	requireSha256,
	requireString,
} from "./strict-json-validation.js";

const MAX_WARNING_FINGERPRINTS = 256;

function requireAbsoluteDraftPath({ value }: { value: unknown }): string {
	const draftPath = requireString({
		label: "Jianying project import draft path",
		maximumLength: 4096,
		value,
	});
	const isPosixAbsolute = draftPath.startsWith("/");
	const isWindowsAbsolute = /^[A-Za-z]:[\\/]/u.test(draftPath);
	const isUncAbsolute = /^\\\\[^\\]/u.test(draftPath);
	if (!isPosixAbsolute && !isWindowsAbsolute && !isUncAbsolute) {
		throw new Error("Jianying project import draft path must be absolute.");
	}
	return draftPath;
}

function requireFingerprints({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string[] {
	if (!Array.isArray(value) || value.length > MAX_WARNING_FINGERPRINTS) {
		throw new Error(`${label} must be a bounded array.`);
	}
	const fingerprints = value.map((fingerprint, index) =>
		requireSha256({ label: `${label} ${index}`, value: fingerprint })
	);
	if (new Set(fingerprints).size !== fingerprints.length) {
		throw new Error(`${label} must not contain duplicates.`);
	}
	return fingerprints.sort();
}

function requireSourceScope({
	value,
}: {
	value: unknown;
}): "selected-directory" | "compound-subdraft" {
	if (value === "selected-directory" || value === "compound-subdraft") {
		return value;
	}
	throw new Error("Jianying project import source scope is unsupported.");
}

function requireBlockedReason({
	value,
}: {
	value: unknown;
}): QCutJianyingProjectImportBlockedReason {
	switch (value) {
		case "plan-blocked":
		case "profile-not-exact":
		case "warning-acceptance-required":
			return value;
		default:
			throw new Error("Jianying project import blocked reason is unsupported.");
	}
}

function requireFailureReason({
	value,
}: {
	value: unknown;
}): QCutJianyingProjectImportFailureReason {
	switch (value) {
		case "bridge-unavailable":
		case "commit-failed":
		case "operation-busy":
		case "plan-failed":
		case "unexpected":
			return value;
		default:
			throw new Error("Jianying project import failure reason is unsupported.");
	}
}

function requireResultBase({ root }: { root: Record<string, unknown> }): {
	schema: typeof QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA;
	schemaVersion: 1;
} {
	if (
		root.schema !== QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA ||
		root.schemaVersion !== 1
	) {
		throw new Error("Jianying project import result schema is unsupported.");
	}
	return {
		schema: QCUT_JIANYING_PROJECT_IMPORT_RESULT_SCHEMA,
		schemaVersion: 1,
	};
}

export function parseQCutJianyingProjectImportRequest({
	value,
}: {
	value: unknown;
}): QCutJianyingProjectImportRequest {
	const record = requireRecord({
		label: "Jianying project import request",
		value,
	});
	requireExactKeys({
		keys: ["acceptedWarningFingerprints", "draftPath"],
		label: "Jianying project import request",
		record,
	});
	return {
		acceptedWarningFingerprints: requireFingerprints({
			label: "Jianying project import accepted warning fingerprints",
			value: record.acceptedWarningFingerprints,
		}),
		draftPath: requireAbsoluteDraftPath({ value: record.draftPath }),
	};
}

export function parseQCutJianyingProjectImportResult({
	value,
}: {
	value: unknown;
}): QCutJianyingProjectImportResult {
	const root = requireRecord({
		label: "Jianying project import result",
		value,
	});
	const common = requireResultBase({ root });
	if (root.outcome === "imported") {
		requireAllowedKeys({
			allowedKeys: [
				"outcome",
				"profileId",
				"projectId",
				"reversible",
				"schema",
				"schemaVersion",
				"selectedSubdraftId",
				"sourceScope",
				"warningFingerprints",
			],
			label: "Jianying project import result",
			record: root,
			requiredKeys: [
				"outcome",
				"profileId",
				"projectId",
				"reversible",
				"schema",
				"schemaVersion",
				"sourceScope",
				"warningFingerprints",
			],
		});
		if (root.reversible !== true) {
			throw new Error("Jianying project import must be reversible.");
		}
		return {
			...common,
			outcome: "imported",
			profileId: requireString({
				label: "Jianying project import profile id",
				maximumLength: 256,
				value: root.profileId,
			}),
			projectId: requireString({
				label: "Jianying project import project id",
				maximumLength: 256,
				value: root.projectId,
			}),
			reversible: true,
			...(root.selectedSubdraftId === undefined
				? {}
				: {
						selectedSubdraftId: requireString({
							label: "Jianying project import selected subdraft id",
							maximumLength: 256,
							value: root.selectedSubdraftId,
						}),
					}),
			sourceScope: requireSourceScope({ value: root.sourceScope }),
			warningFingerprints: requireFingerprints({
				label: "Jianying project import warning fingerprints",
				value: root.warningFingerprints,
			}),
		};
	}
	if (root.outcome === "blocked") {
		requireAllowedKeys({
			allowedKeys: [
				"blockerFingerprints",
				"message",
				"outcome",
				"profileId",
				"reason",
				"schema",
				"schemaVersion",
				"warningFingerprints",
			],
			label: "Jianying project import result",
			record: root,
			requiredKeys: [
				"blockerFingerprints",
				"message",
				"outcome",
				"reason",
				"schema",
				"schemaVersion",
				"warningFingerprints",
			],
		});
		return {
			...common,
			outcome: "blocked",
			blockerFingerprints: requireFingerprints({
				label: "Jianying project import blocker fingerprints",
				value: root.blockerFingerprints,
			}),
			message: requireString({
				label: "Jianying project import message",
				maximumLength: 16_384,
				value: root.message,
			}),
			...(root.profileId === undefined
				? {}
				: {
						profileId: requireString({
							label: "Jianying project import profile id",
							maximumLength: 256,
							value: root.profileId,
						}),
					}),
			reason: requireBlockedReason({ value: root.reason }),
			warningFingerprints: requireFingerprints({
				label: "Jianying project import warning fingerprints",
				value: root.warningFingerprints,
			}),
		};
	}
	if (root.outcome === "failed") {
		requireExactKeys({
			keys: ["message", "outcome", "reason", "schema", "schemaVersion"],
			label: "Jianying project import result",
			record: root,
		});
		return {
			...common,
			outcome: "failed",
			message: requireString({
				label: "Jianying project import message",
				maximumLength: 16_384,
				value: root.message,
			}),
			reason: requireFailureReason({ value: root.reason }),
		};
	}
	throw new Error("Jianying project import outcome is unsupported.");
}
