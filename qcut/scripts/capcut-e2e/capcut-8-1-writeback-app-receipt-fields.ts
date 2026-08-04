import {
	assertExactKeys,
	requireRecord,
} from "./disposable-store-control-file.js";
import {
	CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
	CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT,
	CAPCUT_GUI_APP_SIGNING_AUTHORITIES,
	CAPCUT_GUI_APP_TEAM_IDENTIFIER,
	CAPCUT_GUI_CODESIGN_PATH,
	type CapCutGuiAppSignatureReceipt,
} from "./gui-regression-app-signature.js";
import { CAPCUT_GUI_APP_VERSION } from "./gui-regression-app-profile.js";
import {
	CAPCUT_GUI_RESULT_SCHEMA,
	CAPCUT_GUI_RESULT_SCHEMA_VERSION,
	type CapCut81WritebackAppReceipt,
} from "./capcut-8-1-writeback-app-receipt-contract.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const CDHASH_HEX = /^[a-f0-9]{40}$/u;

export function requireSafeAppReceiptId({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || !SAFE_ID.test(value)) {
		throw new Error(`${label} is invalid.`);
	}
	return value;
}

export function requireAppReceiptSha256({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || !SHA256_HEX.test(value)) {
		throw new Error(`${label} must be a lowercase SHA-256 digest.`);
	}
	return value;
}

export function requireCanonicalAppReceiptTimestamp({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string") {
		throw new Error(`${label} must be a canonical ISO-8601 timestamp.`);
	}
	const milliseconds = Date.parse(value);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== value
	) {
		throw new Error(`${label} must be a canonical ISO-8601 timestamp.`);
	}
	return value;
}

function parseSignature({
	value,
}: {
	value: unknown;
}): CapCutGuiAppSignatureReceipt {
	const signature = requireRecord({
		label: "CapCut app receipt signature",
		value,
	});
	assertExactKeys({
		expectedKeys: [
			"authorities",
			"cdHash",
			"codesignPath",
			"designatedRequirement",
			"identifier",
			"teamIdentifier",
		],
		label: "CapCut app receipt signature",
		value: signature,
	});
	if (
		!Array.isArray(signature.authorities) ||
		signature.authorities.length !==
			CAPCUT_GUI_APP_SIGNING_AUTHORITIES.length ||
		signature.authorities.some(
			(authority, index) =>
				authority !== CAPCUT_GUI_APP_SIGNING_AUTHORITIES[index]
		) ||
		typeof signature.cdHash !== "string" ||
		!CDHASH_HEX.test(signature.cdHash) ||
		signature.codesignPath !== CAPCUT_GUI_CODESIGN_PATH ||
		signature.designatedRequirement !== CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT ||
		signature.identifier !== CAPCUT_GUI_APP_BUNDLE_IDENTIFIER ||
		signature.teamIdentifier !== CAPCUT_GUI_APP_TEAM_IDENTIFIER
	) {
		throw new Error("CapCut app receipt signature is not approved.");
	}
	return signature as unknown as CapCutGuiAppSignatureReceipt;
}

export function parseAppReceiptApp({
	value,
}: {
	value: unknown;
}): CapCut81WritebackAppReceipt["app"] {
	const app = requireRecord({ label: "CapCut app receipt app", value });
	assertExactKeys({
		expectedKeys: [
			"bundleIdentifier",
			"bundleVersion",
			"executableSha256",
			"infoPlistSha256",
			"shortVersion",
			"signature",
		],
		label: "CapCut app receipt app",
		value: app,
	});
	if (
		app.bundleIdentifier !== CAPCUT_GUI_APP_BUNDLE_IDENTIFIER ||
		app.bundleVersion !== CAPCUT_GUI_APP_VERSION ||
		app.shortVersion !== CAPCUT_GUI_APP_VERSION
	) {
		throw new Error(
			`CapCut app receipt requires exact version ${CAPCUT_GUI_APP_VERSION}.`
		);
	}
	return {
		bundleIdentifier: CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
		bundleVersion: CAPCUT_GUI_APP_VERSION,
		executableSha256: requireAppReceiptSha256({
			label: "CapCut app receipt executableSha256",
			value: app.executableSha256,
		}),
		infoPlistSha256: requireAppReceiptSha256({
			label: "CapCut app receipt infoPlistSha256",
			value: app.infoPlistSha256,
		}),
		shortVersion: CAPCUT_GUI_APP_VERSION,
		signature: parseSignature({ value: app.signature }),
	};
}

function parseProcessBoundaries({
	value,
}: {
	value: unknown;
}): CapCut81WritebackAppReceipt["harness"]["processBoundaries"] {
	const boundaries = requireRecord({
		label: "CapCut app receipt process boundaries",
		value,
	});
	assertExactKeys({
		expectedKeys: [
			"finalProcessState",
			"initialProcessState",
			"openProcessGenerationSha256",
			"reopenProcessGenerationSha256",
			"saveAndQuitProcessState",
		],
		label: "CapCut app receipt process boundaries",
		value: boundaries,
	});
	const openProcessGenerationSha256 = requireAppReceiptSha256({
		label: "CapCut app receipt open process generation",
		value: boundaries.openProcessGenerationSha256,
	});
	const reopenProcessGenerationSha256 = requireAppReceiptSha256({
		label: "CapCut app receipt reopen process generation",
		value: boundaries.reopenProcessGenerationSha256,
	});
	if (
		boundaries.initialProcessState !== "absent" ||
		boundaries.saveAndQuitProcessState !== "absent" ||
		boundaries.finalProcessState !== "absent" ||
		openProcessGenerationSha256 === reopenProcessGenerationSha256
	) {
		throw new Error(
			"CapCut app receipt does not prove distinct open and reopen process generations."
		);
	}
	return {
		finalProcessState: "absent",
		initialProcessState: "absent",
		openProcessGenerationSha256,
		reopenProcessGenerationSha256,
		saveAndQuitProcessState: "absent",
	};
}

export function parseAppReceiptHarness({
	value,
}: {
	value: unknown;
}): CapCut81WritebackAppReceipt["harness"] {
	const harness = requireRecord({ label: "CapCut app receipt harness", value });
	assertExactKeys({
		expectedKeys: [
			"applicationState",
			"planSha256",
			"processBoundaries",
			"resultSha256",
			"runId",
			"runnerSchema",
			"runnerSchemaVersion",
		],
		label: "CapCut app receipt harness",
		value: harness,
	});
	if (
		harness.applicationState !== "quiescent" ||
		harness.runnerSchema !== CAPCUT_GUI_RESULT_SCHEMA ||
		harness.runnerSchemaVersion !== CAPCUT_GUI_RESULT_SCHEMA_VERSION
	) {
		throw new Error(
			"CapCut app receipt is not bound to the approved GUI harness."
		);
	}
	return {
		applicationState: "quiescent",
		planSha256: requireAppReceiptSha256({
			label: "CapCut app receipt planSha256",
			value: harness.planSha256,
		}),
		processBoundaries: parseProcessBoundaries({
			value: harness.processBoundaries,
		}),
		resultSha256: requireAppReceiptSha256({
			label: "CapCut app receipt resultSha256",
			value: harness.resultSha256,
		}),
		runId: requireSafeAppReceiptId({
			label: "CapCut app receipt runId",
			value: harness.runId,
		}),
		runnerSchema: CAPCUT_GUI_RESULT_SCHEMA,
		runnerSchemaVersion: CAPCUT_GUI_RESULT_SCHEMA_VERSION,
	};
}
