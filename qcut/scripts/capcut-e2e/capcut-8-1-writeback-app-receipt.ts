import { createHash } from "node:crypto";
import {
	assertExactKeys,
	parseJsonRecord,
	readRegularFileSnapshot,
	requireRecord,
} from "./disposable-store-control-file.js";
import { CAPCUT_GUI_APP_VERSION } from "./gui-regression-app-profile.js";
import {
	CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA,
	CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA_VERSION,
	type CapCut81WritebackAppReceipt,
	type CapCut81WritebackAppReceiptExpectedBinding,
	type CapCut81WritebackAppReceiptPhase,
	type CapCut81WritebackAppReceiptPhaseId,
	type CapCut81WritebackAppVerification,
} from "./capcut-8-1-writeback-app-receipt-contract.js";
import {
	parseAppReceiptApp,
	parseAppReceiptHarness,
	requireAppReceiptSha256,
	requireCanonicalAppReceiptTimestamp,
	requireSafeAppReceiptId,
} from "./capcut-8-1-writeback-app-receipt-fields.js";
import { verifyCapCut81WritebackAppSessionEvidence } from "./capcut-8-1-writeback-app-session-evidence.js";

const MAXIMUM_APP_RECEIPT_BYTES = 1024 * 1024;

export function parseCapCut81WritebackAppReceiptPhase({
	expectedPhase,
	expectedTemplates,
	value,
}: {
	expectedPhase: CapCut81WritebackAppReceiptPhaseId;
	expectedTemplates: readonly [string, string, string, string];
	value: unknown;
}): CapCut81WritebackAppReceiptPhase {
	const phase = requireRecord({
		label: `CapCut app receipt ${expectedPhase} phase`,
		value,
	});
	assertExactKeys({
		expectedKeys: [
			"activeMirrors",
			"capturedAtIso",
			"phase",
			"unknownSentinelPreserved",
		],
		label: `CapCut app receipt ${expectedPhase} phase`,
		value: phase,
	});
	if (
		phase.phase !== expectedPhase ||
		phase.unknownSentinelPreserved !== true ||
		!Array.isArray(phase.activeMirrors) ||
		phase.activeMirrors.length !== expectedTemplates.length
	) {
		throw new Error(`CapCut app receipt ${expectedPhase} phase is incomplete.`);
	}
	const activeMirrors = phase.activeMirrors.map((value, index) => {
		const mirror = requireRecord({
			label: `CapCut app receipt ${expectedPhase} mirror ${index}`,
			value,
		});
		assertExactKeys({
			expectedKeys: ["byteLength", "sha256", "template"],
			label: `CapCut app receipt ${expectedPhase} mirror ${index}`,
			value: mirror,
		});
		if (
			mirror.template !== expectedTemplates[index] ||
			!Number.isSafeInteger(mirror.byteLength) ||
			Number(mirror.byteLength) <= 0
		) {
			throw new Error(
				`CapCut app receipt ${expectedPhase} mirror ${index} is invalid.`
			);
		}
		return {
			byteLength: Number(mirror.byteLength),
			sha256: requireAppReceiptSha256({
				label: `CapCut app receipt ${expectedPhase} mirror ${index} sha256`,
				value: mirror.sha256,
			}),
			template: expectedTemplates[index],
		};
	});
	const [firstMirror, secondMirror, thirdMirror, fourthMirror] = activeMirrors;
	if (
		!firstMirror ||
		!secondMirror ||
		!thirdMirror ||
		!fourthMirror ||
		activeMirrors.some(
			(mirror) =>
				mirror.byteLength !== firstMirror.byteLength ||
				mirror.sha256 !== firstMirror.sha256
		)
	) {
		throw new Error(
			`CapCut app receipt ${expectedPhase} active mirrors do not match.`
		);
	}
	return {
		activeMirrors: [firstMirror, secondMirror, thirdMirror, fourthMirror],
		capturedAtIso: requireCanonicalAppReceiptTimestamp({
			label: `CapCut app receipt ${expectedPhase} capturedAtIso`,
			value: phase.capturedAtIso,
		}),
		phase: expectedPhase,
		unknownSentinelPreserved: true,
	};
}

function assertChronological({
	generatedAtIso,
	phases,
}: {
	generatedAtIso: string;
	phases: CapCut81WritebackAppReceipt["phases"];
}): void {
	const timestamps = [
		...phases.map(({ capturedAtIso }) => Date.parse(capturedAtIso)),
		Date.parse(generatedAtIso),
	];
	if (
		timestamps.some(
			(timestamp, index) => index > 0 && timestamp < timestamps[index - 1]
		)
	) {
		throw new Error("CapCut app receipt timestamps are not chronological.");
	}
}

export function parseCapCut81WritebackAppReceipt({
	expected,
	value,
}: {
	expected: CapCut81WritebackAppReceiptExpectedBinding;
	value: unknown;
}): CapCut81WritebackAppReceipt {
	requireSafeAppReceiptId({
		label: "Expected CapCut app receipt caseId",
		value: expected.caseId,
	});
	requireAppReceiptSha256({
		label: "Expected CapCut writeback output digest",
		value: expected.outputContentSha256,
	});
	const root = requireRecord({ label: "CapCut writeback app receipt", value });
	assertExactKeys({
		expectedKeys: [
			"app",
			"caseId",
			"generatedAtIso",
			"harness",
			"phases",
			"profile",
			"schema",
			"schemaVersion",
		],
		label: "CapCut writeback app receipt",
		value: root,
	});
	if (
		root.schema !== CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA ||
		root.schemaVersion !== CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA_VERSION ||
		requireSafeAppReceiptId({
			label: "CapCut app receipt caseId",
			value: root.caseId,
		}) !== expected.caseId
	) {
		throw new Error("CapCut app receipt is not bound to this writeback case.");
	}
	const profile = requireRecord({
		label: "CapCut app receipt profile",
		value: root.profile,
	});
	assertExactKeys({
		expectedKeys: ["appVersion", "detectionOutcome", "profileId"],
		label: "CapCut app receipt profile",
		value: profile,
	});
	if (
		profile.profileId !== expected.profileId ||
		profile.appVersion !== CAPCUT_GUI_APP_VERSION ||
		profile.detectionOutcome !== "exact"
	) {
		throw new Error(
			"CapCut app receipt profile does not match this writeback."
		);
	}
	const phaseValues = root.phases;
	if (!Array.isArray(phaseValues) || phaseValues.length !== 3) {
		throw new Error(
			"CapCut app receipt must contain pre-open, saved, and reopened phases."
		);
	}
	const phases = [
		parseCapCut81WritebackAppReceiptPhase({
			expectedPhase: "pre-open",
			expectedTemplates: expected.activeMirrorTemplates,
			value: phaseValues[0],
		}),
		parseCapCut81WritebackAppReceiptPhase({
			expectedPhase: "saved",
			expectedTemplates: expected.activeMirrorTemplates,
			value: phaseValues[1],
		}),
		parseCapCut81WritebackAppReceiptPhase({
			expectedPhase: "reopened",
			expectedTemplates: expected.activeMirrorTemplates,
			value: phaseValues[2],
		}),
	] as const;
	const [preOpen, saved, reopened] = phases;
	if (
		preOpen.activeMirrors[0].sha256 !== expected.outputContentSha256 ||
		JSON.stringify(saved.activeMirrors) !==
			JSON.stringify(reopened.activeMirrors)
	) {
		throw new Error(
			"CapCut app receipt is not bound to the writeback output or stable reopen state."
		);
	}
	const generatedAtIso = requireCanonicalAppReceiptTimestamp({
		label: "CapCut app receipt generatedAtIso",
		value: root.generatedAtIso,
	});
	assertChronological({ generatedAtIso, phases });
	return {
		app: parseAppReceiptApp({ value: root.app }),
		caseId: expected.caseId,
		generatedAtIso,
		harness: parseAppReceiptHarness({ value: root.harness }),
		phases,
		profile: {
			appVersion: CAPCUT_GUI_APP_VERSION,
			detectionOutcome: "exact",
			profileId: expected.profileId,
		},
		schema: CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA,
		schemaVersion: CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA_VERSION,
	};
}

export async function loadCapCut81WritebackAppReceipt({
	expected,
	path,
}: {
	expected: CapCut81WritebackAppReceiptExpectedBinding;
	path: string;
}): Promise<CapCut81WritebackAppVerification> {
	const snapshot = await readRegularFileSnapshot({
		label: "CapCut writeback app receipt",
		maximumBytes: MAXIMUM_APP_RECEIPT_BYTES,
		path,
	});
	const receipt = parseCapCut81WritebackAppReceipt({
		expected,
		value: parseJsonRecord({
			bytes: snapshot.bytes,
			label: "CapCut writeback app receipt",
		}),
	});
	await verifyCapCut81WritebackAppSessionEvidence({
		receipt,
		receiptPath: path,
	});
	const [preOpen, saved, reopened] = receipt.phases;
	return {
		app: {
			bundleIdentifier: receipt.app.bundleIdentifier,
			bundleVersion: receipt.app.bundleVersion,
			cdHash: receipt.app.signature.cdHash,
			executableSha256: receipt.app.executableSha256,
			infoPlistSha256: receipt.app.infoPlistSha256,
			shortVersion: receipt.app.shortVersion,
		},
		harness: {
			planSha256: receipt.harness.planSha256,
			resultSha256: receipt.harness.resultSha256,
			runId: receipt.harness.runId,
		},
		preOpenContentSha256: preOpen.activeMirrors[0].sha256,
		receiptSha256: createHash("sha256").update(snapshot.bytes).digest("hex"),
		reopenedContentSha256: reopened.activeMirrors[0].sha256,
		savedContentSha256: saved.activeMirrors[0].sha256,
	};
}
