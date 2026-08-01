import { isAbsolute, join, resolve } from "node:path";
import {
	CAPCUT_GUI_CASE_EXPECTATIONS,
	buildCapCutGuiRegressionSteps,
} from "./gui-regression-contract.js";
import { isSameOrDescendantPath } from "./gui-regression-filesystem.js";
import {
	CAPCUT_GUI_EXECUTION_CONFIRMATION,
	type CapCutGuiRegressionPreflightReport,
} from "./gui-regression-preflight.js";
import type { CapCutGuiRegressionPlan } from "./gui-regression-runner-contract.js";

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
		schemaVersion: 2,
		steps: buildCapCutGuiRegressionSteps({
			bundles: preflight.bundleRun.bundles,
			evidenceDirectory: canonicalEvidenceDirectory,
		}),
		store: preflight.store,
	};
}
