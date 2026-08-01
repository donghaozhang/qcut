import { join, resolve } from "node:path";
import {
	verifyCapCutGuiDraftPhase,
	type CapCutGuiDraftPhaseVerifier,
} from "./gui-regression-draft-verification.js";
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
	assertRootFingerprintContinuity,
	assertRootFingerprintUnchanged,
	captureCapCutGuiRootFingerprint,
	createGuiEvidenceDirectory,
	requireGuiEvidenceFiles,
	type CapCutGuiRootFingerprint,
	writeJsonEvidence,
} from "./gui-regression-evidence.js";
import { buildCapCutGuiRegressionPlan } from "./gui-regression-plan.js";
import { preflightCapCutGuiRegression } from "./gui-regression-preflight.js";
import {
	advanceCapCutGuiProcessGeneration,
	assertCapCutGuiProcessGenerationContinuity,
	getCapCutGuiMainProcessGeneration,
	type CapCutGuiProcessGenerationState,
} from "./gui-regression-process-generation.js";
import {
	CAPCUT_GUI_ADAPTER_APPLICATION_STATE,
	CAPCUT_GUI_VISUAL_VERIFICATION_REVIEW_GATE,
	assertCapCutGuiAdapterResult,
	type CapCutGuiRegressionExecutionAdapter,
	type CapCutGuiRegressionExecutionResult,
	type CapCutGuiRegressionPlan,
	type CapCutGuiRegressionStepExecutionResult,
	type RunCapCutGuiRegressionOptions,
} from "./gui-regression-runner-contract.js";
import {
	assertCapCutGuiSessionBoundary,
	getCapCutGuiSessionExpectationAfterStep,
	inspectCapCutGuiSession,
	type CapCutGuiSessionExpectation,
	type CapCutGuiSessionInspector,
} from "./gui-regression-session-guard.js";
import {
	verifyDraftsAfterGuiStep,
	verifyFinalDrafts,
} from "./gui-regression-step-draft-verification.js";
import {
	assertCapCutGuiImmutableInputsBoundary,
	assertCapCutGuiStepBoundary,
} from "./gui-regression-step-guard.js";

const PLAN_FILE_NAME = "gui-regression-plan.json";
const EXECUTION_RESULT_FILE_NAME = "gui-regression-result.json";
const PROJECT_ROOT = resolve(process.cwd());

export type { CapCutGuiRootFingerprint } from "./gui-regression-evidence.js";
export { buildCapCutGuiRegressionPlan } from "./gui-regression-plan.js";
export {
	CAPCUT_GUI_ADAPTER_APPLICATION_STATE,
	CAPCUT_GUI_VISUAL_VERIFICATION_REVIEW_GATE,
};
export type {
	CapCutGuiRegressionAdapterStepResult,
	CapCutGuiRegressionExecutionAdapter,
	CapCutGuiRegressionExecutionResult,
	CapCutGuiRegressionPlan,
	CapCutGuiRegressionStepExecutionResult,
	RunCapCutGuiRegressionOptions,
} from "./gui-regression-runner-contract.js";

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
	inspectSession,
	plan,
	verifyBundle,
	verifyDraftPhase,
}: {
	adapter: CapCutGuiRegressionExecutionAdapter;
	initialRootFingerprint: CapCutGuiRootFingerprint;
	inspectApp: CapCutGuiAppInspector;
	inspectSession: CapCutGuiSessionInspector;
	plan: CapCutGuiRegressionPlan;
	verifyBundle: CapCutGuiBundleVerifier;
	verifyDraftPhase: CapCutGuiDraftPhaseVerifier;
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
			processGenerationState: CapCutGuiProcessGenerationState;
			rootFingerprintAfter: CapCutGuiRootFingerprint;
			sessionExpectation: CapCutGuiSessionExpectation;
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
			const sessionReportBefore = await assertCapCutGuiSessionBoundary({
				app: plan.app,
				expectation: previous.sessionExpectation,
				identity: plan.identity,
				inspectSession,
				store: plan.store,
			});
			const adapterResult = await adapter.performStep({ plan, step });
			assertCapCutGuiAdapterResult({ result: adapterResult });
			await assertCapCutGuiImmutableInputsBoundary({
				app: plan.app,
				bundleRun: plan.bundleRun,
				executionSentinel,
				identity: plan.identity,
				inspectApp,
				store: plan.store,
				verifyBundle,
			});
			const sessionExpectation = getCapCutGuiSessionExpectationAfterStep({
				containerWasRequired: previous.sessionExpectation.containerRequired,
				stepAction: step.action,
			});
			const sessionReportAfter = await assertCapCutGuiSessionBoundary({
				app: plan.app,
				expectation: sessionExpectation,
				identity: plan.identity,
				inspectSession,
				store: plan.store,
			});
			const processGenerationState = advanceCapCutGuiProcessGeneration({
				afterReport: sessionReportAfter,
				app: plan.app,
				beforeReport: sessionReportBefore,
				state: previous.processGenerationState,
				stepAction: step.action,
			});
			const mainProcessGenerationBefore = getCapCutGuiMainProcessGeneration({
				app: plan.app,
				report: sessionReportBefore,
			});
			const mainProcessGenerationAfter = getCapCutGuiMainProcessGeneration({
				app: plan.app,
				report: sessionReportAfter,
			});
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
			const draftVerifications = await verifyDraftsAfterGuiStep({
				bundles: plan.bundleRun.bundles,
				rootFingerprintAfter,
				rootFingerprintBefore,
				step,
				verifyDraftPhase,
			});
			const capturedEvidence = await requireGuiEvidenceFiles({
				evidencePaths: step.evidencePaths,
				ownerUid: plan.identity.processUid,
			});
			return {
				processGenerationState,
				rootFingerprintAfter,
				sessionExpectation,
				stepResults: [
					...previous.stepResults,
					{
						action: step.action,
						capturedEvidence,
						...(step.caseId === undefined ? {} : { caseId: step.caseId }),
						...(draftVerifications.length > 0 ? { draftVerifications } : {}),
						expectedCheckIds: step.expectedCheckIds,
						mainProcessGenerationAfter,
						mainProcessGenerationBefore,
						rootFingerprintAfter,
						rootFingerprintBefore,
						sequence: step.sequence,
						visualVerificationStatus: "unverified",
					},
				],
			};
		},
		Promise.resolve({
			processGenerationState: { current: null, seenGenerationKeys: [] },
			rootFingerprintAfter: initialRootFingerprint,
			sessionExpectation: {
				containerRequired: false,
				processState: "absent",
			},
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
	const finalSessionReport = await assertCapCutGuiSessionBoundary({
		app: plan.app,
		expectation: executionState.sessionExpectation,
		identity: plan.identity,
		inspectSession,
		store: plan.store,
	});
	assertCapCutGuiProcessGenerationContinuity({
		app: plan.app,
		report: finalSessionReport,
		state: executionState.processGenerationState,
	});
	return {
		rootFingerprintAfter: executionState.rootFingerprintAfter,
		stepResults: executionState.stepResults,
	};
}

async function executeCapCutGuiRegression({
	adapter,
	inspectApp,
	inspectSession,
	plan,
	planPath,
	verifyBundle,
	verifyDraftPhase = verifyCapCutGuiDraftPhase,
}: {
	adapter: CapCutGuiRegressionExecutionAdapter;
	inspectApp: CapCutGuiAppInspector;
	inspectSession: CapCutGuiSessionInspector;
	plan: CapCutGuiRegressionPlan;
	planPath: string;
	verifyBundle: CapCutGuiBundleVerifier;
	verifyDraftPhase?: CapCutGuiDraftPhaseVerifier;
}): Promise<CapCutGuiRegressionExecutionResult> {
	if (plan.mode !== "execute") {
		throw new Error("Only an execute-mode plan can be executed.");
	}
	if (plan.executionSentinel === null) {
		throw new Error("Execute plan is missing its bound execution sentinel.");
	}
	await assertCapCutGuiSessionBoundary({
		app: plan.app,
		expectation: { containerRequired: false, processState: "absent" },
		identity: plan.identity,
		inspectSession,
		store: plan.store,
	});
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
		inspectSession,
		plan,
		verifyBundle,
		verifyDraftPhase,
	});
	const { rootFingerprintAfter, stepResults } = executionState;
	assertExpectedDraftIds({
		actualDraftIds: rootFingerprintAfter.draftIds,
		expectedDraftIds: plan.rootFingerprints.after.expectedDraftIds,
	});
	const finalDraftVerifications = await verifyFinalDrafts({
		bundles: plan.bundleRun.bundles,
		rootFingerprint: rootFingerprintAfter,
		verifyDraftPhase,
	});
	const rootFingerprintAfterFinalVerification =
		await captureCapCutGuiRootFingerprint({
			bundles: plan.bundleRun.bundles,
			canonicalStorePath: plan.store.canonicalStorePath,
			expectedStoreSentinelIntegrity:
				plan.rootFingerprints.before.storeSentinelIntegrity,
			ownerUid: plan.identity.processUid,
			rootMetaInfoPath: plan.store.rootMetaInfo.path,
		});
	assertRootFingerprintContinuity({
		actual: rootFingerprintAfterFinalVerification,
		expected: rootFingerprintAfter,
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
		draftVerifications: [
			...stepResults.flatMap(
				({ draftVerifications }) => draftVerifications ?? []
			),
			...finalDraftVerifications,
		],
		evidenceStatus: "capture-only",
		finalDraftVerifications,
		planPath,
		rootFingerprintAfter,
		runId: plan.bundleRun.runId,
		schema: "qcut.capcut-e2e.gui-regression-result",
		schemaVersion: 3,
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
				inspectSession: inspectCapCutGuiSession,
				plan,
				planPath,
				verifyBundle: createProductionBundleVerifier({
					projectRoot: PROJECT_ROOT,
				}),
				verifyDraftPhase: verifyCapCutGuiDraftPhase,
			})
		: null;
	return { executionResult, plan, planPath };
}
