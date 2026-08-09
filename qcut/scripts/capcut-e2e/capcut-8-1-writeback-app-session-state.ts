import { randomUUID } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
	assertExactKeys,
	parseJsonRecord,
	readRegularFileSnapshot,
	requireRecord,
} from "./disposable-store-control-file.js";
import type {
	CapCut81WritebackAppIdentity,
	CapCut81WritebackAppReceiptPhase,
} from "./capcut-8-1-writeback-app-receipt-contract.js";
import {
	parseAppReceiptApp,
	requireAppReceiptSha256,
	requireCanonicalAppReceiptTimestamp,
	requireSafeAppReceiptId,
} from "./capcut-8-1-writeback-app-receipt-fields.js";
import { parseCapCut81WritebackAppReceiptPhase } from "./capcut-8-1-writeback-app-receipt.js";
import type { CapCut81WritebackDraftDirectoryBinding } from "./capcut-8-1-writeback-app-session-draft.js";

export const CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA =
	"qcut.capcut-8.1-same-profile-writeback-app-session-state" as const;
export const CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA_VERSION = 1 as const;
export const CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_FILE_NAME =
	".writeback-app-session-state.json" as const;

const MAXIMUM_SESSION_STATE_BYTES = 1024 * 1024;

export type CapCut81WritebackAppSessionStage =
	| "awaiting-open"
	| "awaiting-save-and-quit"
	| "awaiting-reopen"
	| "awaiting-final-quit"
	| "complete";

export interface CapCut81WritebackAppSessionState {
	activeMirrorRelativePaths: readonly [string, string, string, string];
	activeMirrorTemplates: readonly [string, string, string, string];
	app: CapCut81WritebackAppIdentity;
	appDirectoryIdentity: { device: string; inode: string };
	appPath: string;
	caseId: string;
	createdAtIso: string;
	dedicatedTestHomeDirectory: string;
	draftBinding: CapCut81WritebackDraftDirectoryBinding;
	lastCapturedAtIso: string;
	openProcessGenerationSha256: string | null;
	outputContentSha256: string;
	planSha256: string;
	preOpen: CapCut81WritebackAppReceiptPhase;
	profileId: string;
	reopenProcessGenerationSha256: string | null;
	reopened: CapCut81WritebackAppReceiptPhase | null;
	runId: string;
	saved: CapCut81WritebackAppReceiptPhase | null;
	schema: typeof CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA;
	schemaVersion: typeof CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA_VERSION;
	stage: CapCut81WritebackAppSessionStage;
}

function requireAbsolutePath({
	label,
	value,
}: {
	label: string;
	value: unknown;
}) {
	if (typeof value !== "string" || !isAbsolute(value) || value.includes("\0")) {
		throw new Error(`${label} must be an absolute path.`);
	}
	return value;
}

function parseStringTuple({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): readonly [string, string, string, string] {
	if (
		!Array.isArray(value) ||
		value.length !== 4 ||
		value.some((entry) => typeof entry !== "string" || entry.length === 0)
	) {
		throw new Error(`${label} must contain exactly four strings.`);
	}
	return [
		String(value[0]),
		String(value[1]),
		String(value[2]),
		String(value[3]),
	];
}

function parseDraftBinding({
	value,
}: {
	value: unknown;
}): CapCut81WritebackDraftDirectoryBinding {
	const binding = requireRecord({
		label: "CapCut writeback app session draft binding",
		value,
	});
	assertExactKeys({
		expectedKeys: ["canonicalPath", "device", "inode"],
		label: "CapCut writeback app session draft binding",
		value: binding,
	});
	if (
		typeof binding.device !== "string" ||
		!/^(?:0|[1-9]\d*)$/u.test(binding.device) ||
		typeof binding.inode !== "string" ||
		!/^(?:0|[1-9]\d*)$/u.test(binding.inode)
	) {
		throw new Error("CapCut writeback app session draft identity is invalid.");
	}
	return {
		canonicalPath: requireAbsolutePath({
			label: "CapCut writeback app session draft path",
			value: binding.canonicalPath,
		}),
		device: binding.device,
		inode: binding.inode,
	};
}

function parseAppDirectoryIdentity({ value }: { value: unknown }) {
	const identity = requireRecord({
		label: "CapCut writeback app session app directory identity",
		value,
	});
	assertExactKeys({
		expectedKeys: ["device", "inode"],
		label: "CapCut writeback app session app directory identity",
		value: identity,
	});
	if (
		typeof identity.device !== "string" ||
		!/^(?:0|[1-9]\d*)$/u.test(identity.device) ||
		typeof identity.inode !== "string" ||
		!/^(?:0|[1-9]\d*)$/u.test(identity.inode)
	) {
		throw new Error("CapCut writeback app session app identity is invalid.");
	}
	return { device: identity.device, inode: identity.inode };
}

function parseOptionalPhase({
	expectedPhase,
	templates,
	value,
}: {
	expectedPhase: "reopened" | "saved";
	templates: readonly [string, string, string, string];
	value: unknown;
}): CapCut81WritebackAppReceiptPhase | null {
	return value === null
		? null
		: parseCapCut81WritebackAppReceiptPhase({
				expectedPhase,
				expectedTemplates: templates,
				value,
			});
}

function assertStageConsistency({
	state,
}: {
	state: CapCut81WritebackAppSessionState;
}): void {
	const hasOpen = state.openProcessGenerationSha256 !== null;
	const hasSaved = state.saved !== null;
	const hasReopen = state.reopenProcessGenerationSha256 !== null;
	const hasReopened = state.reopened !== null;
	const expected = {
		"awaiting-open": [false, false, false, false],
		"awaiting-save-and-quit": [true, false, false, false],
		"awaiting-reopen": [true, true, false, false],
		"awaiting-final-quit": [true, true, true, true],
		complete: [true, true, true, true],
	}[state.stage];
	if (
		!expected ||
		[hasOpen, hasSaved, hasReopen, hasReopened].some(
			(value, index) => value !== expected[index]
		)
	) {
		throw new Error("CapCut writeback app session stage is inconsistent.");
	}
}

export function parseCapCut81WritebackAppSessionState({
	value,
}: {
	value: unknown;
}): CapCut81WritebackAppSessionState {
	const root = requireRecord({
		label: "CapCut writeback app session state",
		value,
	});
	assertExactKeys({
		expectedKeys: [
			"activeMirrorRelativePaths",
			"activeMirrorTemplates",
			"app",
			"appDirectoryIdentity",
			"appPath",
			"caseId",
			"createdAtIso",
			"dedicatedTestHomeDirectory",
			"draftBinding",
			"lastCapturedAtIso",
			"openProcessGenerationSha256",
			"outputContentSha256",
			"planSha256",
			"preOpen",
			"profileId",
			"reopenProcessGenerationSha256",
			"reopened",
			"runId",
			"saved",
			"schema",
			"schemaVersion",
			"stage",
		],
		label: "CapCut writeback app session state",
		value: root,
	});
	if (
		root.schema !== CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA ||
		root.schemaVersion !==
			CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA_VERSION ||
		![
			"awaiting-open",
			"awaiting-save-and-quit",
			"awaiting-reopen",
			"awaiting-final-quit",
			"complete",
		].includes(String(root.stage))
	) {
		throw new Error("CapCut writeback app session state schema is invalid.");
	}
	const activeMirrorTemplates = parseStringTuple({
		label: "CapCut writeback app session mirror templates",
		value: root.activeMirrorTemplates,
	});
	const createdAtIso = requireCanonicalAppReceiptTimestamp({
		label: "CapCut writeback app session createdAtIso",
		value: root.createdAtIso,
	});
	const lastCapturedAtIso = requireCanonicalAppReceiptTimestamp({
		label: "CapCut writeback app session lastCapturedAtIso",
		value: root.lastCapturedAtIso,
	});
	if (Date.parse(lastCapturedAtIso) < Date.parse(createdAtIso)) {
		throw new Error("CapCut writeback app session timestamps are invalid.");
	}
	const state: CapCut81WritebackAppSessionState = {
		activeMirrorRelativePaths: parseStringTuple({
			label: "CapCut writeback app session mirror paths",
			value: root.activeMirrorRelativePaths,
		}),
		activeMirrorTemplates,
		app: parseAppReceiptApp({ value: root.app }),
		appDirectoryIdentity: parseAppDirectoryIdentity({
			value: root.appDirectoryIdentity,
		}),
		appPath: requireAbsolutePath({
			label: "CapCut writeback app session app path",
			value: root.appPath,
		}),
		caseId: requireSafeAppReceiptId({
			label: "CapCut writeback app session caseId",
			value: root.caseId,
		}),
		createdAtIso,
		dedicatedTestHomeDirectory: requireAbsolutePath({
			label: "CapCut writeback app session dedicated home",
			value: root.dedicatedTestHomeDirectory,
		}),
		draftBinding: parseDraftBinding({ value: root.draftBinding }),
		lastCapturedAtIso,
		openProcessGenerationSha256:
			root.openProcessGenerationSha256 === null
				? null
				: requireAppReceiptSha256({
						label: "CapCut writeback app session open generation",
						value: root.openProcessGenerationSha256,
					}),
		outputContentSha256: requireAppReceiptSha256({
			label: "CapCut writeback app session output digest",
			value: root.outputContentSha256,
		}),
		planSha256: requireAppReceiptSha256({
			label: "CapCut writeback app session plan digest",
			value: root.planSha256,
		}),
		preOpen: parseCapCut81WritebackAppReceiptPhase({
			expectedPhase: "pre-open",
			expectedTemplates: activeMirrorTemplates,
			value: root.preOpen,
		}),
		profileId: requireSafeAppReceiptId({
			label: "CapCut writeback app session profileId",
			value: root.profileId,
		}),
		reopenProcessGenerationSha256:
			root.reopenProcessGenerationSha256 === null
				? null
				: requireAppReceiptSha256({
						label: "CapCut writeback app session reopen generation",
						value: root.reopenProcessGenerationSha256,
					}),
		reopened: parseOptionalPhase({
			expectedPhase: "reopened",
			templates: activeMirrorTemplates,
			value: root.reopened,
		}),
		runId: requireSafeAppReceiptId({
			label: "CapCut writeback app session runId",
			value: root.runId,
		}),
		saved: parseOptionalPhase({
			expectedPhase: "saved",
			templates: activeMirrorTemplates,
			value: root.saved,
		}),
		schema: CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA,
		schemaVersion: CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA_VERSION,
		stage: root.stage as CapCut81WritebackAppSessionStage,
	};
	if (state.preOpen.activeMirrors[0].sha256 !== state.outputContentSha256) {
		throw new Error("CapCut writeback app session output digest drifted.");
	}
	assertStageConsistency({ state });
	return state;
}

export async function readCapCut81WritebackAppSessionState({
	statePath,
}: {
	statePath: string;
}): Promise<CapCut81WritebackAppSessionState> {
	const snapshot = await readRegularFileSnapshot({
		label: "CapCut writeback app session state",
		maximumBytes: MAXIMUM_SESSION_STATE_BYTES,
		path: statePath,
	});
	return parseCapCut81WritebackAppSessionState({
		value: parseJsonRecord({
			bytes: snapshot.bytes,
			label: "CapCut writeback app session state",
		}),
	});
}

export async function writeCapCut81WritebackAppSessionState({
	initial,
	state,
	statePath,
}: {
	initial: boolean;
	state: CapCut81WritebackAppSessionState;
	statePath: string;
}): Promise<void> {
	parseCapCut81WritebackAppSessionState({ value: state });
	const bytes = `${JSON.stringify(state, null, "\t")}\n`;
	if (initial) {
		await writeFile(statePath, bytes, {
			encoding: "utf8",
			flag: "wx",
			mode: 0o600,
		});
		return;
	}
	const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, bytes, {
		encoding: "utf8",
		flag: "wx",
		mode: 0o600,
	});
	await rename(temporaryPath, statePath);
}
