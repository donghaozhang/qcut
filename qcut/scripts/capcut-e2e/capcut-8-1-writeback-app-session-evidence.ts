import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
	assertExactKeys,
	parseJsonRecord,
	readRegularFileSnapshot,
	requireRecord,
} from "./disposable-store-control-file.js";
import {
	CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_FILE_NAME,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_SCHEMA,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_SCHEMA_VERSION,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_FILE_NAME,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_SCHEMA,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_SCHEMA_VERSION,
	type CapCut81WritebackAppReceipt,
} from "./capcut-8-1-writeback-app-receipt-contract.js";
import {
	requireAppReceiptSha256,
	requireCanonicalAppReceiptTimestamp,
	requireSafeAppReceiptId,
} from "./capcut-8-1-writeback-app-receipt-fields.js";

const MAXIMUM_SESSION_EVIDENCE_BYTES = 1024 * 1024;

function requireEqual({
	actual,
	expected,
	label,
}: {
	actual: unknown;
	expected: unknown;
	label: string;
}): void {
	if (!isDeepStrictEqual(actual, expected)) {
		throw new Error(`${label} does not match the bound app receipt.`);
	}
}

function parseSessionPlan({
	planSha256,
	receipt,
	value,
}: {
	planSha256: string;
	receipt: CapCut81WritebackAppReceipt;
	value: unknown;
}): void {
	const plan = requireRecord({
		label: "CapCut writeback app session plan",
		value,
	});
	assertExactKeys({
		expectedKeys: [
			"app",
			"caseId",
			"createdAtIso",
			"draft",
			"profile",
			"runId",
			"schema",
			"schemaVersion",
		],
		label: "CapCut writeback app session plan",
		value: plan,
	});
	if (
		plan.schema !== CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_SCHEMA ||
		plan.schemaVersion !==
			CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_SCHEMA_VERSION ||
		requireSafeAppReceiptId({
			label: "CapCut writeback app session plan caseId",
			value: plan.caseId,
		}) !== receipt.caseId ||
		requireSafeAppReceiptId({
			label: "CapCut writeback app session plan runId",
			value: plan.runId,
		}) !== receipt.harness.runId
	) {
		throw new Error("CapCut writeback app session plan binding is invalid.");
	}
	requireEqual({
		actual: plan.app,
		expected: receipt.app,
		label: "CapCut writeback app session plan app",
	});
	requireEqual({
		actual: plan.profile,
		expected: receipt.profile,
		label: "CapCut writeback app session plan profile",
	});
	const draft = requireRecord({
		label: "CapCut writeback app session plan draft",
		value: plan.draft,
	});
	assertExactKeys({
		expectedKeys: ["activeMirrorTemplates", "preOpen"],
		label: "CapCut writeback app session plan draft",
		value: draft,
	});
	requireEqual({
		actual: draft.activeMirrorTemplates,
		expected: receipt.phases[0].activeMirrors.map(({ template }) => template),
		label: "CapCut writeback app session plan mirror templates",
	});
	requireEqual({
		actual: draft.preOpen,
		expected: receipt.phases[0],
		label: "CapCut writeback app session plan pre-open phase",
	});
	const createdAtIso = requireCanonicalAppReceiptTimestamp({
		label: "CapCut writeback app session plan createdAtIso",
		value: plan.createdAtIso,
	});
	if (Date.parse(createdAtIso) > Date.parse(receipt.phases[0].capturedAtIso)) {
		throw new Error("CapCut writeback app session plan was created too late.");
	}
	if (planSha256 !== receipt.harness.planSha256) {
		throw new Error("CapCut writeback app session plan hash is not bound.");
	}
}

function parseSessionResult({
	planSha256,
	receipt,
	resultSha256,
	value,
}: {
	planSha256: string;
	receipt: CapCut81WritebackAppReceipt;
	resultSha256: string;
	value: unknown;
}): void {
	const result = requireRecord({
		label: "CapCut writeback app session result",
		value,
	});
	assertExactKeys({
		expectedKeys: [
			"app",
			"applicationState",
			"caseId",
			"completedAtIso",
			"phases",
			"planSha256",
			"processBoundaries",
			"profile",
			"runId",
			"schema",
			"schemaVersion",
		],
		label: "CapCut writeback app session result",
		value: result,
	});
	if (
		result.schema !== CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_SCHEMA ||
		result.schemaVersion !==
			CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_SCHEMA_VERSION ||
		result.applicationState !== "quiescent" ||
		requireSafeAppReceiptId({
			label: "CapCut writeback app session result caseId",
			value: result.caseId,
		}) !== receipt.caseId ||
		requireSafeAppReceiptId({
			label: "CapCut writeback app session result runId",
			value: result.runId,
		}) !== receipt.harness.runId ||
		requireAppReceiptSha256({
			label: "CapCut writeback app session result planSha256",
			value: result.planSha256,
		}) !== planSha256
	) {
		throw new Error("CapCut writeback app session result binding is invalid.");
	}
	requireEqual({
		actual: result.app,
		expected: receipt.app,
		label: "CapCut writeback app session result app",
	});
	requireEqual({
		actual: result.phases,
		expected: receipt.phases,
		label: "CapCut writeback app session result phases",
	});
	requireEqual({
		actual: result.processBoundaries,
		expected: receipt.harness.processBoundaries,
		label: "CapCut writeback app session result process boundaries",
	});
	requireEqual({
		actual: result.profile,
		expected: receipt.profile,
		label: "CapCut writeback app session result profile",
	});
	const completedAtIso = requireCanonicalAppReceiptTimestamp({
		label: "CapCut writeback app session result completedAtIso",
		value: result.completedAtIso,
	});
	if (
		Date.parse(completedAtIso) < Date.parse(receipt.phases[2].capturedAtIso) ||
		Date.parse(completedAtIso) > Date.parse(receipt.generatedAtIso) ||
		resultSha256 !== receipt.harness.resultSha256
	) {
		throw new Error(
			"CapCut writeback app session result timing or hash is invalid."
		);
	}
}

export async function verifyCapCut81WritebackAppSessionEvidence({
	receipt,
	receiptPath,
}: {
	receipt: CapCut81WritebackAppReceipt;
	receiptPath: string;
}): Promise<void> {
	const evidenceDirectory = dirname(receiptPath);
	const [planSnapshot, resultSnapshot] = await Promise.all([
		readRegularFileSnapshot({
			label: "CapCut writeback app session plan",
			maximumBytes: MAXIMUM_SESSION_EVIDENCE_BYTES,
			path: join(
				evidenceDirectory,
				CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_FILE_NAME
			),
		}),
		readRegularFileSnapshot({
			label: "CapCut writeback app session result",
			maximumBytes: MAXIMUM_SESSION_EVIDENCE_BYTES,
			path: join(
				evidenceDirectory,
				CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_FILE_NAME
			),
		}),
	]);
	const planSha256 = createHash("sha256")
		.update(planSnapshot.bytes)
		.digest("hex");
	const resultSha256 = createHash("sha256")
		.update(resultSnapshot.bytes)
		.digest("hex");
	parseSessionPlan({
		planSha256,
		receipt,
		value: parseJsonRecord({
			bytes: planSnapshot.bytes,
			label: "CapCut writeback app session plan",
		}),
	});
	parseSessionResult({
		planSha256,
		receipt,
		resultSha256,
		value: parseJsonRecord({
			bytes: resultSnapshot.bytes,
			label: "CapCut writeback app session result",
		}),
	});
}
