import type { CapCutGuiCapturedEvidenceFile } from "./gui-regression-evidence.js";
import type { CapCutGuiRootFingerprint } from "./gui-regression-evidence.js";
import type {
	CapCutGuiDraftPhaseVerification,
	CapCutGuiSemanticDraftVerification,
} from "./gui-regression-draft-verification.js";
import type {
	CapCutGuiRegressionStep,
	CAPCUT_GUI_CASE_EXPECTATIONS,
} from "./gui-regression-contract.js";
import type {
	CapCutGuiRegressionMode,
	CapCutGuiRegressionPreflightOptions,
	CapCutGuiRegressionPreflightReport,
} from "./gui-regression-preflight.js";
import type { CAPCUT_GUI_EXECUTION_CONFIRMATION } from "./gui-regression-preflight.js";
import type { CapCutGuiMainProcessGeneration } from "./gui-regression-process-generation.js";

export const CAPCUT_GUI_ADAPTER_APPLICATION_STATE = "quiescent";
export const CAPCUT_GUI_VISUAL_VERIFICATION_REVIEW_GATE =
	"manual-or-automated-visual-oracle-required";

export interface CapCutGuiRegressionPlan {
	app: CapCutGuiRegressionPreflightReport["app"];
	bundleRun: CapCutGuiRegressionPreflightReport["bundleRun"];
	caseExpectations: typeof CAPCUT_GUI_CASE_EXPECTATIONS;
	createdAt: string;
	evidenceDirectory: string;
	executionGate: {
		confirmationValue: typeof CAPCUT_GUI_EXECUTION_CONFIRMATION;
		requiresDedicatedMacOsLoginOrVm: true;
		requiresExecutionSentinel: true;
	};
	executionSentinel: CapCutGuiRegressionPreflightReport["executionSentinel"];
	identity: CapCutGuiRegressionPreflightReport["identity"];
	mode: CapCutGuiRegressionMode;
	rootFingerprints: {
		after: {
			expectedDraftIds: readonly string[];
			path: string;
			status: "pending";
		};
		before: CapCutGuiRootFingerprint;
	};
	schema: "qcut.capcut-e2e.gui-regression-plan";
	schemaVersion: 2;
	steps: readonly CapCutGuiRegressionStep[];
	store: CapCutGuiRegressionPreflightReport["store"];
}

export interface CapCutGuiRegressionExecutionResult {
	capturedEvidence: readonly CapCutGuiCapturedEvidenceFile[];
	completedAt: string;
	draftVerifications: readonly CapCutGuiDraftPhaseVerification[];
	evidenceStatus: "capture-only";
	finalDraftVerifications: readonly CapCutGuiSemanticDraftVerification[];
	planPath: string;
	rootFingerprintAfter: CapCutGuiRootFingerprint;
	runId: string;
	schema: "qcut.capcut-e2e.gui-regression-result";
	schemaVersion: 3;
	stepResults: readonly CapCutGuiRegressionStepExecutionResult[];
	stepsCompleted: number;
	verifiedCheckIds: readonly [];
	visualVerificationReviewGate: typeof CAPCUT_GUI_VISUAL_VERIFICATION_REVIEW_GATE;
	visualVerificationStatus: "unverified";
}

export interface CapCutGuiRegressionStepExecutionResult {
	action: CapCutGuiRegressionStep["action"];
	capturedEvidence: readonly CapCutGuiCapturedEvidenceFile[];
	caseId?: CapCutGuiRegressionStep["caseId"];
	draftVerifications?: readonly CapCutGuiDraftPhaseVerification[];
	expectedCheckIds: readonly string[];
	mainProcessGenerationAfter: CapCutGuiMainProcessGeneration | null;
	mainProcessGenerationBefore: CapCutGuiMainProcessGeneration | null;
	rootFingerprintAfter: CapCutGuiRootFingerprint;
	rootFingerprintBefore: CapCutGuiRootFingerprint;
	sequence: number;
	visualVerificationStatus: "unverified";
}

export interface CapCutGuiRegressionAdapterStepResult {
	applicationState: typeof CAPCUT_GUI_ADAPTER_APPLICATION_STATE;
}

export function assertCapCutGuiAdapterResult({
	result,
}: {
	result: CapCutGuiRegressionAdapterStepResult;
}): void {
	if (result?.applicationState !== CAPCUT_GUI_ADAPTER_APPLICATION_STATE) {
		throw new Error(
			"CapCut GUI adapter must return only after the operation and application are quiescent."
		);
	}
}

export interface CapCutGuiRegressionExecutionAdapter {
	performStep: ({
		plan,
		step,
	}: {
		plan: CapCutGuiRegressionPlan;
		step: CapCutGuiRegressionStep;
	}) => Promise<CapCutGuiRegressionAdapterStepResult>;
}

export interface RunCapCutGuiRegressionOptions
	extends CapCutGuiRegressionPreflightOptions {
	evidenceDirectory: string;
}
