import { assertNonCurrentDraftsUnchanged } from "./gui-regression-draft-boundary.js";
import type {
	CapCutGuiBundleCase,
	CapCutGuiRegressionStep,
} from "./gui-regression-contract.js";
import {
	getDraftVerificationPhase,
	type CapCutGuiDraftPhaseVerification,
	type CapCutGuiDraftPhaseVerifier,
	type CapCutGuiDraftVerificationPhase,
	type CapCutGuiSemanticDraftVerification,
} from "./gui-regression-draft-verification.js";
import type { CapCutGuiRootFingerprint } from "./gui-regression-evidence.js";

function requireCurrentBundle({
	bundles,
	step,
}: {
	bundles: readonly CapCutGuiBundleCase[];
	step: CapCutGuiRegressionStep;
}): CapCutGuiBundleCase {
	if (!step.caseId) {
		throw new Error(`GUI adapter step ${step.action} requires a planned case.`);
	}
	const bundle = bundles.find(({ caseId }) => caseId === step.caseId);
	if (!bundle) throw new Error(`GUI case ${step.caseId} is not planned.`);
	return bundle;
}

function assertReceiptMatchesRequest({
	bundle,
	phase,
	receipt,
}: {
	bundle: CapCutGuiBundleCase;
	phase: CapCutGuiDraftVerificationPhase;
	receipt: CapCutGuiDraftPhaseVerification;
}): void {
	if (receipt.caseId !== bundle.caseId || receipt.phase !== phase) {
		throw new Error(
			`Draft verifier returned a receipt for the wrong case or phase; expected ${bundle.caseId}/${phase}.`
		);
	}
}

export async function verifyDraftsAfterGuiStep({
	bundles,
	rootFingerprintAfter,
	rootFingerprintBefore,
	step,
	verifyDraftPhase,
}: {
	bundles: readonly CapCutGuiBundleCase[];
	rootFingerprintAfter: CapCutGuiRootFingerprint;
	rootFingerprintBefore: CapCutGuiRootFingerprint;
	step: CapCutGuiRegressionStep;
	verifyDraftPhase: CapCutGuiDraftPhaseVerifier;
}): Promise<CapCutGuiDraftPhaseVerification[]> {
	const currentBundle = requireCurrentBundle({ bundles, step });
	assertNonCurrentDraftsUnchanged({
		bundles,
		currentCaseId: currentBundle.caseId,
		rootFingerprintAfter,
		rootFingerprintBefore,
	});
	const phase = getDraftVerificationPhase({ action: step.action });
	if (phase === null) return [];
	if (
		phase === "installed" &&
		!rootFingerprintAfter.draftIds.includes(currentBundle.draftId)
	) {
		throw new Error(
			`${currentBundle.caseId} install step did not register its planned draft ID.`
		);
	}
	const bundlesToVerify =
		phase === "installed"
			? bundles.filter(({ draftId }) =>
					rootFingerprintAfter.draftIds.includes(draftId)
				)
			: [currentBundle];
	return Promise.all(
		bundlesToVerify.map(async (bundle) => {
			const receipt = await verifyDraftPhase({
				bundle,
				phase,
				rootFingerprint: rootFingerprintAfter,
			});
			assertReceiptMatchesRequest({ bundle, phase, receipt });
			return receipt;
		})
	);
}

export async function verifyFinalDrafts({
	bundles,
	rootFingerprint,
	verifyDraftPhase,
}: {
	bundles: readonly CapCutGuiBundleCase[];
	rootFingerprint: CapCutGuiRootFingerprint;
	verifyDraftPhase: CapCutGuiDraftPhaseVerifier;
}): Promise<CapCutGuiSemanticDraftVerification[]> {
	return Promise.all(
		bundles.map(async (bundle) => {
			const receipt = await verifyDraftPhase({
				bundle,
				phase: "final",
				rootFingerprint,
			});
			assertReceiptMatchesRequest({ bundle, phase: "final", receipt });
			if (receipt.status !== "semantic-and-immutable-assets-verified") {
				throw new Error(
					`${bundle.caseId} final receipt did not prove semantics and immutable assets.`
				);
			}
			return receipt;
		})
	);
}
