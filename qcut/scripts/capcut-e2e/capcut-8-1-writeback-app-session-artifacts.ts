import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CapCutGuiAppReport } from "./gui-regression-app-profile.js";
import {
	CAPCUT_8_1_WRITEBACK_APP_RECEIPT_FILE_NAME,
	CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA,
	CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA_VERSION,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_FILE_NAME,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_SCHEMA,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_SCHEMA_VERSION,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_FILE_NAME,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_SCHEMA,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_SCHEMA_VERSION,
	type CapCut81WritebackAppIdentity,
	type CapCut81WritebackAppProcessBoundaries,
	type CapCut81WritebackAppReceipt,
	type CapCut81WritebackAppReceiptPhase,
	type CapCut81WritebackAppSessionPlan,
	type CapCut81WritebackAppSessionResult,
} from "./capcut-8-1-writeback-app-receipt-contract.js";
import { readRegularFileSnapshot } from "./disposable-store-control-file.js";

function serializeEvidence({ value }: { value: unknown }): Buffer {
	return Buffer.from(`${JSON.stringify(value, null, "\t")}\n`, "utf8");
}

async function writeEvidenceOnce({
	bytes,
	path,
}: {
	bytes: Buffer;
	path: string;
}): Promise<void> {
	try {
		await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
	} catch (error) {
		if (
			typeof error !== "object" ||
			error === null ||
			!("code" in error) ||
			error.code !== "EEXIST"
		) {
			throw error;
		}
		const existing = await readRegularFileSnapshot({
			label: "CapCut writeback app evidence",
			path,
		});
		if (!existing.bytes.equals(bytes)) {
			throw new Error("Existing CapCut writeback app evidence differs.");
		}
	}
}

export function buildCapCut81WritebackAppIdentity({
	app,
}: {
	app: CapCutGuiAppReport;
}): CapCut81WritebackAppIdentity {
	return {
		bundleIdentifier: app.bundleIdentifier,
		bundleVersion: app.bundleVersion,
		executableSha256: app.executableIntegrity.sha256,
		infoPlistSha256: app.infoPlistIntegrity.sha256,
		shortVersion: app.shortVersion,
		signature: app.signature,
	};
}

export async function writeCapCut81WritebackAppSessionPlan({
	activeMirrorTemplates,
	app,
	caseId,
	createdAtIso,
	preOpen,
	profileId,
	runId,
	sessionDirectory,
}: {
	activeMirrorTemplates: readonly [string, string, string, string];
	app: CapCut81WritebackAppIdentity;
	caseId: string;
	createdAtIso: string;
	preOpen: CapCut81WritebackAppReceiptPhase;
	profileId: string;
	runId: string;
	sessionDirectory: string;
}): Promise<{ planPath: string; planSha256: string }> {
	const plan: CapCut81WritebackAppSessionPlan = {
		app,
		caseId,
		createdAtIso,
		draft: { activeMirrorTemplates, preOpen },
		profile: {
			appVersion: "8.1.1",
			detectionOutcome: "exact",
			profileId,
		},
		runId,
		schema: CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_SCHEMA,
		schemaVersion: CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_SCHEMA_VERSION,
	};
	const bytes = serializeEvidence({ value: plan });
	const planPath = join(
		sessionDirectory,
		CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_FILE_NAME
	);
	await writeEvidenceOnce({ bytes, path: planPath });
	return {
		planPath,
		planSha256: createHash("sha256").update(bytes).digest("hex"),
	};
}

export async function writeCapCut81WritebackAppSessionResult({
	app,
	caseId,
	completedAtIso,
	generatedAtIso,
	phases,
	planSha256,
	processBoundaries,
	profileId,
	runId,
	sessionDirectory,
}: {
	app: CapCut81WritebackAppIdentity;
	caseId: string;
	completedAtIso: string;
	generatedAtIso: string;
	phases: CapCut81WritebackAppReceipt["phases"];
	planSha256: string;
	processBoundaries: CapCut81WritebackAppProcessBoundaries;
	profileId: string;
	runId: string;
	sessionDirectory: string;
}): Promise<{ receiptPath: string; resultPath: string }> {
	const profile = {
		appVersion: "8.1.1" as const,
		detectionOutcome: "exact" as const,
		profileId,
	};
	const result: CapCut81WritebackAppSessionResult = {
		app,
		applicationState: "quiescent",
		caseId,
		completedAtIso,
		phases,
		planSha256,
		processBoundaries,
		profile,
		runId,
		schema: CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_SCHEMA,
		schemaVersion: CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_SCHEMA_VERSION,
	};
	const resultBytes = serializeEvidence({ value: result });
	const resultSha256 = createHash("sha256").update(resultBytes).digest("hex");
	const receipt: CapCut81WritebackAppReceipt = {
		app,
		caseId,
		generatedAtIso,
		harness: {
			applicationState: "quiescent",
			planSha256,
			processBoundaries,
			resultSha256,
			runId,
			runnerSchema: CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_SCHEMA,
			runnerSchemaVersion:
				CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_SCHEMA_VERSION,
		},
		phases,
		profile,
		schema: CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA,
		schemaVersion: CAPCUT_8_1_WRITEBACK_APP_RECEIPT_SCHEMA_VERSION,
	};
	const resultPath = join(
		sessionDirectory,
		CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_FILE_NAME
	);
	const receiptPath = join(
		sessionDirectory,
		CAPCUT_8_1_WRITEBACK_APP_RECEIPT_FILE_NAME
	);
	await writeEvidenceOnce({ bytes: resultBytes, path: resultPath });
	await writeEvidenceOnce({
		bytes: serializeEvidence({ value: receipt }),
		path: receiptPath,
	});
	return { receiptPath, resultPath };
}
