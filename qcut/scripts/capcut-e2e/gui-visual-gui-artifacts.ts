import { isDeepStrictEqual } from "node:util";
import { dirname, join } from "node:path";
import {
	CAPCUT_GUI_CASE_EXPECTATIONS,
	CAPCUT_GUI_CASE_IDS,
	buildCapCutGuiRegressionSteps,
} from "./gui-regression-contract.js";
import { requireGuiEvidenceFiles } from "./gui-regression-evidence.js";
import {
	requireCanonicalPath,
	requireRecord,
} from "./gui-regression-filesystem.js";
import type {
	CapCutGuiRegressionExecutionResult,
	CapCutGuiRegressionPlan,
} from "./gui-regression-runner.js";
import type { VisualFileEvidence } from "./visual-contract.js";
import { readVisualJsonFileSnapshot } from "./visual-files.js";

const GUI_PLAN_FILE_NAME = "gui-regression-plan.json";
const GUI_RESULT_FILE_NAME = "gui-regression-result.json";

export interface LoadedGuiVisualArtifacts {
	ownerUid: number;
	plan: CapCutGuiRegressionPlan;
	planEvidence: VisualFileEvidence;
	result: CapCutGuiRegressionExecutionResult;
	resultEvidence: VisualFileEvidence;
}

function toVisualFileEvidence({
	bytes,
	path,
	sha256,
}: {
	bytes: number;
	path: string;
	sha256: string;
}): VisualFileEvidence {
	return { bytes, path, sha256 };
}

function requireGuiPlan({ path, value }: { path: string; value: unknown }) {
	const record = requireRecord({ label: "CapCut GUI plan", value });
	if (
		record.schema !== "qcut.capcut-e2e.gui-regression-plan" ||
		record.schemaVersion !== 2
	) {
		throw new Error("CapCut GUI plan schema is unsupported.");
	}
	const plan = record as unknown as CapCutGuiRegressionPlan;
	if (
		plan.evidenceDirectory !== dirname(path) ||
		!isDeepStrictEqual(plan.caseExpectations, CAPCUT_GUI_CASE_EXPECTATIONS) ||
		!Array.isArray(plan.bundleRun?.bundles) ||
		!Array.isArray(plan.steps)
	) {
		throw new Error("CapCut GUI plan contract is inconsistent.");
	}
	const caseIds = plan.bundleRun.bundles.map(({ caseId }) => caseId).sort();
	if (!isDeepStrictEqual(caseIds, [...CAPCUT_GUI_CASE_IDS].sort())) {
		throw new Error(
			"CapCut GUI plan must bind exactly the three visual cases."
		);
	}
	const expectedSteps = buildCapCutGuiRegressionSteps({
		bundles: plan.bundleRun.bundles,
		evidenceDirectory: plan.evidenceDirectory,
	});
	if (!isDeepStrictEqual(plan.steps, expectedSteps)) {
		throw new Error("CapCut GUI plan steps do not match the locked contract.");
	}
	if (
		!Number.isSafeInteger(plan.identity?.processUid) ||
		plan.identity.processUid < 0
	) {
		throw new Error("CapCut GUI plan owner UID is invalid.");
	}
	return plan;
}

function requireGuiResult({
	plan,
	planPath,
	value,
}: {
	plan: CapCutGuiRegressionPlan;
	planPath: string;
	value: unknown;
}) {
	const record = requireRecord({ label: "CapCut GUI result", value });
	if (
		record.schema !== "qcut.capcut-e2e.gui-regression-result" ||
		record.schemaVersion !== 3 ||
		record.evidenceStatus !== "capture-only" ||
		record.visualVerificationStatus !== "unverified" ||
		!isDeepStrictEqual(record.verifiedCheckIds, []) ||
		!Array.isArray(record.draftVerifications) ||
		!Array.isArray(record.finalDraftVerifications)
	) {
		throw new Error("CapCut GUI result is not an honest capture-only result.");
	}
	const result = record as unknown as CapCutGuiRegressionExecutionResult;
	const adapterSteps = plan.steps.filter(
		({ action }) =>
			action !== "capture-root-before" && action !== "capture-root-after"
	);
	if (
		result.runId !== plan.bundleRun.runId ||
		result.planPath !== planPath ||
		result.stepsCompleted !== plan.steps.length ||
		!Array.isArray(result.stepResults) ||
		result.stepResults.length !== adapterSteps.length
	) {
		throw new Error("CapCut GUI result is not bound to the complete plan.");
	}
	for (const [index, stepResult] of result.stepResults.entries()) {
		const step = adapterSteps[index];
		if (
			!step ||
			stepResult.action !== step.action ||
			stepResult.caseId !== step.caseId ||
			stepResult.sequence !== step.sequence ||
			stepResult.visualVerificationStatus !== "unverified" ||
			(stepResult.draftVerifications !== undefined &&
				!Array.isArray(stepResult.draftVerifications)) ||
			!isDeepStrictEqual(stepResult.expectedCheckIds, step.expectedCheckIds) ||
			!isDeepStrictEqual(
				stepResult.capturedEvidence.map(({ path }: { path: string }) => path),
				step.evidencePaths
			)
		) {
			throw new Error(`CapCut GUI step result ${index} is inconsistent.`);
		}
	}
	const flattened = result.stepResults.flatMap(
		({ capturedEvidence }) => capturedEvidence
	);
	const draftVerifications = result.stepResults.flatMap(
		({ draftVerifications: stepVerifications }) => stepVerifications ?? []
	);
	const finalCaseIds = result.finalDraftVerifications
		.map(({ caseId }) => caseId)
		.sort();
	if (
		result.finalDraftVerifications.length !== CAPCUT_GUI_CASE_IDS.length ||
		!isDeepStrictEqual(finalCaseIds, [...CAPCUT_GUI_CASE_IDS].sort()) ||
		result.finalDraftVerifications.some(
			({ phase, status }) =>
				phase !== "final" || status !== "semantic-and-immutable-assets-verified"
		)
	) {
		throw new Error("CapCut GUI final draft verification set is incomplete.");
	}
	if (!isDeepStrictEqual(result.capturedEvidence, flattened)) {
		throw new Error("CapCut GUI aggregate evidence does not match its steps.");
	}
	if (
		!isDeepStrictEqual(result.draftVerifications, [
			...draftVerifications,
			...result.finalDraftVerifications,
		])
	) {
		throw new Error(
			"CapCut GUI aggregate draft verification does not match its steps."
		);
	}
	return result;
}

export async function loadGuiVisualArtifacts({
	guiPlanPath,
	guiResultPath,
}: {
	guiPlanPath: string;
	guiResultPath: string;
}): Promise<LoadedGuiVisualArtifacts> {
	const [canonicalPlan, canonicalResult] = await Promise.all([
		requireCanonicalPath({
			expectedKind: "file",
			label: "CapCut GUI plan",
			path: guiPlanPath,
		}),
		requireCanonicalPath({
			expectedKind: "file",
			label: "CapCut GUI result",
			path: guiResultPath,
		}),
	]);
	const [planSnapshot, resultSnapshot] = await Promise.all([
		readVisualJsonFileSnapshot({ label: "CapCut GUI plan", path: guiPlanPath }),
		readVisualJsonFileSnapshot({
			label: "CapCut GUI result",
			path: guiResultPath,
		}),
	]);
	const plan = requireGuiPlan({ path: guiPlanPath, value: planSnapshot.value });
	const ownerUid = plan.identity.processUid;
	if (
		canonicalPlan.stats.uid !== BigInt(ownerUid) ||
		canonicalResult.stats.uid !== BigInt(ownerUid) ||
		guiPlanPath !== join(plan.evidenceDirectory, GUI_PLAN_FILE_NAME) ||
		guiResultPath !== join(plan.evidenceDirectory, GUI_RESULT_FILE_NAME)
	) {
		throw new Error(
			"CapCut GUI plan/result path or ownership is inconsistent."
		);
	}
	const result = requireGuiResult({
		plan,
		planPath: guiPlanPath,
		value: resultSnapshot.value,
	});
	const currentEvidence = await requireGuiEvidenceFiles({
		evidencePaths: result.capturedEvidence.map(({ path }) => path),
		ownerUid,
	});
	if (!isDeepStrictEqual(currentEvidence, result.capturedEvidence)) {
		throw new Error(
			"CapCut GUI captured evidence no longer matches the result."
		);
	}
	return {
		ownerUid,
		plan,
		planEvidence: planSnapshot.evidence,
		result,
		resultEvidence: resultSnapshot.evidence,
	};
}

export function findGuiCheckEvidence({
	checkId,
	result,
}: {
	checkId: string;
	result: CapCutGuiRegressionExecutionResult;
}): VisualFileEvidence {
	const matches: VisualFileEvidence[] = [];
	for (const step of result.stepResults) {
		for (const [index, id] of step.expectedCheckIds.entries()) {
			if (id !== checkId) continue;
			const evidence = step.capturedEvidence[index];
			if (!evidence) throw new Error(`Missing GUI evidence for ${checkId}.`);
			matches.push(toVisualFileEvidence(evidence));
		}
	}
	if (matches.length !== 1 || !matches[0]) {
		throw new Error(`Expected exactly one GUI evidence file for ${checkId}.`);
	}
	return matches[0];
}

export function findGuiExportEvidence({
	caseId,
	result,
}: {
	caseId: "native-text-sticker" | "dissolve" | "lut-mask";
	result: CapCutGuiRegressionExecutionResult;
}): VisualFileEvidence {
	const matches = result.stepResults.filter(
		(step) => step.action === "export-video" && step.caseId === caseId
	);
	const evidence = matches[0]?.capturedEvidence[0];
	if (
		matches.length !== 1 ||
		matches[0]?.capturedEvidence.length !== 1 ||
		!evidence
	) {
		throw new Error(`Expected exactly one captured export for ${caseId}.`);
	}
	return toVisualFileEvidence(evidence);
}
