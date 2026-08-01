import { isAbsolute, join, resolve } from "node:path";
import {
	CAPCUT_GUI_CASE_EXPECTATIONS,
	buildCapCutGuiRegressionSteps,
	type CapCutGuiRegressionStep,
} from "./gui-regression-contract.js";
import {
	inspectCapCutApp,
	type CapCutGuiAppInspector,
} from "./gui-regression-app-profile.js";
import {
	createProductionBundleVerifier,
	type CapCutGuiBundleVerifier,
} from "./gui-regression-bundle-verification.js";
import {
	assertNoUnexpectedDraftIds,
	assertExpectedDraftIds,
	assertGuiEvidenceRecordsUnchanged,
	assertRootFingerprintUnchanged,
	captureCapCutGuiRootFingerprint,
	createGuiEvidenceDirectory,
	requireGuiEvidenceFiles,
	type CapCutGuiCapturedEvidenceFile,
	type CapCutGuiRootFingerprint,
	writeJsonEvidence,
} from "./gui-regression-evidence.js";
import { isSameOrDescendantPath } from "./gui-regression-filesystem.js";
import {
	CAPCUT_GUI_EXECUTION_CONFIRMATION,
	preflightCapCutGuiRegression,
	type CapCutGuiRegressionMode,
	type CapCutGuiRegressionPreflightOptions,
	type CapCutGuiRegressionPreflightReport,
} from "./gui-regression-preflight.js";
import { assertCapCutGuiStepBoundary } from "./gui-regression-step-guard.js";

const PLAN_FILE_NAME = "gui-regression-plan.json";
const EXECUTION_RESULT_FILE_NAME = "gui-regression-result.json";
const PROJECT_ROOT = resolve(process.cwd());

export const CAPCUT_GUI_ADAPTER_APPLICATION_STATE = "quiescent";
export const CAPCUT_GUI_VISUAL_VERIFICATION_REVIEW_GATE =
	"manual-or-automated-visual-oracle-required";

export type { CapCutGuiRootFingerprint } from "./gui-regression-evidence.js";

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
	schemaVersion: 1;
	steps: readonly CapCutGuiRegressionStep[];
	store: CapCutGuiRegressionPreflightReport["store"];
}

export interface CapCutGuiRegressionExecutionResult {
	capturedEvidence: readonly CapCutGuiCapturedEvidenceFile[];
	completedAt: string;
	evidenceStatus: "capture-only";
	planPath: string;
	rootFingerprintAfter: CapCutGuiRootFingerprint;
	runId: string;
	schema: "qcut.capcut-e2e.gui-regression-result";
	schemaVersion: 2;
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
	expectedCheckIds: readonly string[];
	rootFingerprintAfter: CapCutGuiRootFingerprint;
	rootFingerprintBefore: CapCutGuiRootFingerprint;
	sequence: number;
	visualVerificationStatus: "unverified";
}

export interface CapCutGuiRegressionAdapterStepResult {
	applicationState: typeof CAPCUT_GUI_ADAPTER_APPLICATION_STATE;
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

function requireEvidenceDirectoryPath({
	evidenceDirectory,
	preflight,
}: {
	evidenceDirectory: string;
	preflight: CapCutGuiRegressionPreflightReport;
}): string {
	if (!isAbsolute(evidenceDirectory)) {
		throw new Error("CapCut GUI evidence directory must be an absolute path.");
	}
	const requestedPath = resolve(evidenceDirectory);
	if (
		!isSameOrDescendantPath({
			candidatePath: requestedPath,
			parentPath: preflight.store.dedicatedTestHomePath,
		}) ||
		requestedPath === preflight.store.dedicatedTestHomePath
	) {
		throw new Error(
			"CapCut GUI evidence directory must be a new descendant of the isolated account home."
		);
	}
	if (
		isSameOrDescendantPath({
			candidatePath: requestedPath,
			parentPath: preflight.store.canonicalStorePath,
		}) ||
		isSameOrDescendantPath({
			candidatePath: preflight.store.canonicalStorePath,
			parentPath: requestedPath,
		})
	) {
		throw new Error(
			"CapCut GUI evidence directory must not overlap the disposable draft store."
		);
	}
	return requestedPath;
}

export function buildCapCutGuiRegressionPlan({
	createdAt = new Date().toISOString(),
	evidenceDirectory,
	preflight,
}: {
	createdAt?: string;
	evidenceDirectory: string;
	preflight: CapCutGuiRegressionPreflightReport;
}): CapCutGuiRegressionPlan {
	const canonicalEvidenceDirectory = requireEvidenceDirectoryPath({
		evidenceDirectory,
		preflight,
	});
	return {
		app: preflight.app,
		bundleRun: preflight.bundleRun,
		caseExpectations: CAPCUT_GUI_CASE_EXPECTATIONS,
		createdAt,
		evidenceDirectory: canonicalEvidenceDirectory,
		executionGate: {
			confirmationValue: CAPCUT_GUI_EXECUTION_CONFIRMATION,
			requiresDedicatedMacOsLoginOrVm: true,
			requiresExecutionSentinel: true,
		},
		executionSentinel: preflight.executionSentinel,
		identity: preflight.identity,
		mode: preflight.mode,
		rootFingerprints: {
			after: {
				expectedDraftIds: preflight.bundleRun.bundles.map(
					({ draftId }) => draftId
				),
				path: join(canonicalEvidenceDirectory, "root-fingerprint-after.json"),
				status: "pending",
			},
			before: preflight.rootFingerprint,
		},
		schema: "qcut.capcut-e2e.gui-regression-plan",
		schemaVersion: 1,
		steps: buildCapCutGuiRegressionSteps({
			bundles: preflight.bundleRun.bundles,
			evidenceDirectory: canonicalEvidenceDirectory,
		}),
		store: preflight.store,
	};
}

async function writePlan({
	plan,
}: {
	plan: CapCutGuiRegressionPlan;
}): Promise<string> {
	await createGuiEvidenceDirectory({
		evidenceDirectory: plan.evidenceDirectory,
		ownerUid: plan.identity.processUid,
	});
	const planPath = join(plan.evidenceDirectory, PLAN_FILE_NAME);
	await writeJsonEvidence({ path: planPath, value: plan });
	return planPath;
}

async function executeAdapterSteps({
	adapter,
	initialRootFingerprint,
	inspectApp,
	plan,
	verifyBundle,
}: {
	adapter: CapCutGuiRegressionExecutionAdapter;
	initialRootFingerprint: CapCutGuiRootFingerprint;
	inspectApp: CapCutGuiAppInspector;
	plan: CapCutGuiRegressionPlan;
	verifyBundle: CapCutGuiBundleVerifier;
}): Promise<{
	rootFingerprintAfter: CapCutGuiRootFingerprint;
	stepResults: CapCutGuiRegressionStepExecutionResult[];
}> {
	if (plan.executionSentinel === null) {
		throw new Error("Execute plan is missing its bound execution sentinel.");
	}
	const executionSentinel = plan.executionSentinel;
	const adapterSteps = plan.steps.filter(
		({ action }) =>
			action !== "capture-root-before" && action !== "capture-root-after"
	);
	const executionState = await adapterSteps.reduce<
		Promise<{
			rootFingerprintAfter: CapCutGuiRootFingerprint;
			stepResults: CapCutGuiRegressionStepExecutionResult[];
		}>
	>(
		async (previousPromise, step) => {
			const previous = await previousPromise;
			const rootFingerprintBefore = await assertCapCutGuiStepBoundary({
				app: plan.app,
				bundleRun: plan.bundleRun,
				executionSentinel,
				expectedRootFingerprint: previous.rootFingerprintAfter,
				identity: plan.identity,
				inspectApp,
				store: plan.store,
				verifyBundle,
			});
			const adapterResult = await adapter.performStep({ plan, step });
			if (
				adapterResult?.applicationState !== CAPCUT_GUI_ADAPTER_APPLICATION_STATE
			) {
				throw new Error(
					"CapCut GUI adapter must return only after the operation and application are quiescent."
				);
			}
			const rootFingerprintAfter = await captureCapCutGuiRootFingerprint({
				bundles: plan.bundleRun.bundles,
				canonicalStorePath: plan.store.canonicalStorePath,
				expectedStoreSentinelIntegrity:
					plan.rootFingerprints.before.storeSentinelIntegrity,
				ownerUid: plan.identity.processUid,
				rootMetaInfoPath: plan.store.rootMetaInfo.path,
			});
			assertNoUnexpectedDraftIds({
				actualDraftIds: rootFingerprintAfter.draftIds,
				allowedDraftIds: plan.rootFingerprints.after.expectedDraftIds,
			});
			const capturedEvidence = await requireGuiEvidenceFiles({
				evidencePaths: step.evidencePaths,
				ownerUid: plan.identity.processUid,
			});
			return {
				rootFingerprintAfter,
				stepResults: [
					...previous.stepResults,
					{
						action: step.action,
						capturedEvidence,
						...(step.caseId === undefined ? {} : { caseId: step.caseId }),
						expectedCheckIds: step.expectedCheckIds,
						rootFingerprintAfter,
						rootFingerprintBefore,
						sequence: step.sequence,
						visualVerificationStatus: "unverified",
					},
				],
			};
		},
		Promise.resolve({
			rootFingerprintAfter: initialRootFingerprint,
			stepResults: [],
		})
	);
	await assertCapCutGuiStepBoundary({
		app: plan.app,
		bundleRun: plan.bundleRun,
		executionSentinel,
		expectedRootFingerprint: executionState.rootFingerprintAfter,
		identity: plan.identity,
		inspectApp,
		store: plan.store,
		verifyBundle,
	});
	return executionState;
}

async function executeCapCutGuiRegression({
	adapter,
	inspectApp,
	plan,
	planPath,
	verifyBundle,
}: {
	adapter: CapCutGuiRegressionExecutionAdapter;
	inspectApp: CapCutGuiAppInspector;
	plan: CapCutGuiRegressionPlan;
	planPath: string;
	verifyBundle: CapCutGuiBundleVerifier;
}): Promise<CapCutGuiRegressionExecutionResult> {
	if (plan.mode !== "execute") {
		throw new Error("Only an execute-mode plan can be executed.");
	}
	if (plan.executionSentinel === null) {
		throw new Error("Execute plan is missing its bound execution sentinel.");
	}
	const rootFingerprintAtExecutionBoundary =
		await captureCapCutGuiRootFingerprint({
			bundles: plan.bundleRun.bundles,
			canonicalStorePath: plan.store.canonicalStorePath,
			expectedStoreSentinelIntegrity:
				plan.rootFingerprints.before.storeSentinelIntegrity,
			ownerUid: plan.identity.processUid,
			rootMetaInfoPath: plan.store.rootMetaInfo.path,
		});
	assertRootFingerprintUnchanged({
		actual: rootFingerprintAtExecutionBoundary,
		expected: plan.rootFingerprints.before,
	});
	await writeJsonEvidence({
		path: join(plan.evidenceDirectory, "root-fingerprint-before.json"),
		value: rootFingerprintAtExecutionBoundary,
	});
	const executionState = await executeAdapterSteps({
		adapter,
		initialRootFingerprint: rootFingerprintAtExecutionBoundary,
		inspectApp,
		plan,
		verifyBundle,
	});
	const { rootFingerprintAfter, stepResults } = executionState;
	assertExpectedDraftIds({
		actualDraftIds: rootFingerprintAfter.draftIds,
		expectedDraftIds: plan.rootFingerprints.after.expectedDraftIds,
	});
	await writeJsonEvidence({
		path: plan.rootFingerprints.after.path,
		value: rootFingerprintAfter,
	});
	const capturedEvidence = stepResults.flatMap(
		({ capturedEvidence: stepEvidence }) => stepEvidence
	);
	await assertGuiEvidenceRecordsUnchanged({
		ownerUid: plan.identity.processUid,
		records: capturedEvidence,
	});
	const result: CapCutGuiRegressionExecutionResult = {
		capturedEvidence,
		completedAt: new Date().toISOString(),
		evidenceStatus: "capture-only",
		planPath,
		rootFingerprintAfter,
		runId: plan.bundleRun.runId,
		schema: "qcut.capcut-e2e.gui-regression-result",
		schemaVersion: 2,
		stepResults,
		stepsCompleted: stepResults.length + 2,
		verifiedCheckIds: [],
		visualVerificationReviewGate: CAPCUT_GUI_VISUAL_VERIFICATION_REVIEW_GATE,
		visualVerificationStatus: "unverified",
	};
	await writeJsonEvidence({
		path: join(plan.evidenceDirectory, EXECUTION_RESULT_FILE_NAME),
		value: result,
	});
	return result;
}

export const capCutGuiRegressionRunnerTesting = Object.freeze({
	executeCapCutGuiRegression,
});

export async function runCapCutGuiRegression({
	adapter,
	options,
}: {
	adapter?: CapCutGuiRegressionExecutionAdapter;
	options: RunCapCutGuiRegressionOptions;
}): Promise<{
	executionResult: CapCutGuiRegressionExecutionResult | null;
	plan: CapCutGuiRegressionPlan;
	planPath: string;
}> {
	const preflight = await preflightCapCutGuiRegression(options);
	const plan = buildCapCutGuiRegressionPlan({
		evidenceDirectory: options.evidenceDirectory,
		preflight,
	});
	if (preflight.mode === "execute" && !adapter) {
		throw new Error(
			"Execute mode requires an explicit GUI automation adapter; no default launcher is allowed."
		);
	}
	const planPath = await writePlan({ plan });
	const executionResult = adapter
		? await executeCapCutGuiRegression({
				adapter,
				inspectApp: inspectCapCutApp,
				plan,
				planPath,
				verifyBundle: createProductionBundleVerifier({
					projectRoot: PROJECT_ROOT,
				}),
			})
		: null;
	return { executionResult, plan, planPath };
}
