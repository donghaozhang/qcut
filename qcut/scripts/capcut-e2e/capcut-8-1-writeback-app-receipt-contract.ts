import type { CapCutGuiAppSignatureReceipt } from "./gui-regression-app-signature.js";
import { CAPCUT_GUI_APP_BUNDLE_IDENTIFIER } from "./gui-regression-app-signature.js";
import { CAPCUT_GUI_APP_VERSION } from "./gui-regression-app-profile.js";

export const CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA =
	"qcut.capcut-8.1-same-profile-writeback-app-receipt" as const;
export const CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA_VERSION = 1 as const;
export const CAPCUT_GUI_RESULT_SCHEMA =
	"qcut.capcut-e2e.gui-regression-result" as const;
export const CAPCUT_GUI_RESULT_SCHEMA_VERSION = 3 as const;

export type CapCut81WritebackAppReceiptPhaseId =
	| "pre-open"
	| "saved"
	| "reopened";

export interface CapCut81WritebackAppReceiptMirror {
	byteLength: number;
	sha256: string;
	template: string;
}

export interface CapCut81WritebackAppReceiptPhase {
	activeMirrors: readonly [
		CapCut81WritebackAppReceiptMirror,
		CapCut81WritebackAppReceiptMirror,
		CapCut81WritebackAppReceiptMirror,
		CapCut81WritebackAppReceiptMirror,
	];
	capturedAtIso: string;
	phase: CapCut81WritebackAppReceiptPhaseId;
	unknownSentinelPreserved: true;
}

export interface CapCut81WritebackAppReceipt {
	app: {
		bundleIdentifier: typeof CAPCUT_GUI_APP_BUNDLE_IDENTIFIER;
		bundleVersion: typeof CAPCUT_GUI_APP_VERSION;
		executableSha256: string;
		infoPlistSha256: string;
		shortVersion: typeof CAPCUT_GUI_APP_VERSION;
		signature: CapCutGuiAppSignatureReceipt;
	};
	caseId: string;
	generatedAtIso: string;
	harness: {
		applicationState: "quiescent";
		planSha256: string;
		processBoundaries: {
			finalProcessState: "absent";
			initialProcessState: "absent";
			openProcessGenerationSha256: string;
			reopenProcessGenerationSha256: string;
			saveAndQuitProcessState: "absent";
		};
		resultSha256: string;
		runId: string;
		runnerSchema: typeof CAPCUT_GUI_RESULT_SCHEMA;
		runnerSchemaVersion: typeof CAPCUT_GUI_RESULT_SCHEMA_VERSION;
	};
	phases: readonly [
		CapCut81WritebackAppReceiptPhase,
		CapCut81WritebackAppReceiptPhase,
		CapCut81WritebackAppReceiptPhase,
	];
	profile: {
		appVersion: typeof CAPCUT_GUI_APP_VERSION;
		detectionOutcome: "exact";
		profileId: string;
	};
	schema: typeof CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA;
	schemaVersion: typeof CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA_VERSION;
}

export interface CapCut81WritebackAppReceiptExpectedBinding {
	activeMirrorTemplates: readonly [string, string, string, string];
	caseId: string;
	outputContentSha256: string;
	profileId: string;
}

export interface CapCut81WritebackAppVerification {
	app: {
		bundleIdentifier: typeof CAPCUT_GUI_APP_BUNDLE_IDENTIFIER;
		bundleVersion: typeof CAPCUT_GUI_APP_VERSION;
		cdHash: string;
		executableSha256: string;
		infoPlistSha256: string;
		shortVersion: typeof CAPCUT_GUI_APP_VERSION;
	};
	harness: {
		planSha256: string;
		resultSha256: string;
		runId: string;
	};
	preOpenContentSha256: string;
	receiptSha256: string;
	reopenedContentSha256: string;
	savedContentSha256: string;
}
