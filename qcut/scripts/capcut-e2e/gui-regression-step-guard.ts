import type { DisposableCapCutStorePreflightReport } from "./disposable-store-guard.js";
import type {
	CapCutGuiAppInspector,
	CapCutGuiAppReport,
} from "./gui-regression-app-profile.js";
import {
	reverifyPlannedGuiBundles,
	type CapCutGuiBundleVerifier,
} from "./gui-regression-bundle-verification.js";
import type { CapCutGuiBundleRunReport } from "./gui-regression-bundle-run.js";
import {
	assertRootFingerprintContinuity,
	captureCapCutGuiRootFingerprint,
	type CapCutGuiRootFingerprint,
} from "./gui-regression-evidence.js";
import {
	inspectExecutionSentinel,
	type CapCutGuiExecutionSentinel,
} from "./gui-regression-execution-sentinel.js";
import type { CapCutGuiProcessIdentityReport } from "./gui-regression-identity.js";

function assertAppReportUnchanged({
	actual,
	expected,
}: {
	actual: CapCutGuiAppReport;
	expected: CapCutGuiAppReport;
}): void {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			"CapCut application changed after plan creation; GUI adapter execution is refused."
		);
	}
}

function assertExecutionSentinelUnchanged({
	actual,
	expected,
}: {
	actual: CapCutGuiExecutionSentinel;
	expected: CapCutGuiExecutionSentinel;
}): void {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			"CapCut GUI execution sentinel changed after plan creation; GUI adapter execution is refused."
		);
	}
}

export async function assertCapCutGuiStepBoundary({
	app,
	bundleRun,
	executionSentinel,
	expectedRootFingerprint,
	identity,
	inspectApp,
	store,
	verifyBundle,
}: {
	app: CapCutGuiAppReport;
	bundleRun: CapCutGuiBundleRunReport;
	executionSentinel: CapCutGuiExecutionSentinel;
	expectedRootFingerprint: CapCutGuiRootFingerprint;
	identity: CapCutGuiProcessIdentityReport;
	inspectApp: CapCutGuiAppInspector;
	store: DisposableCapCutStorePreflightReport;
	verifyBundle: CapCutGuiBundleVerifier;
}): Promise<CapCutGuiRootFingerprint> {
	await assertCapCutGuiImmutableInputsBoundary({
		app,
		bundleRun,
		executionSentinel,
		identity,
		inspectApp,
		store,
		verifyBundle,
	});
	const rootFingerprintAtBoundary = await captureCapCutGuiRootFingerprint({
		bundles: bundleRun.bundles,
		canonicalStorePath: store.canonicalStorePath,
		expectedStoreSentinelIntegrity:
			expectedRootFingerprint.storeSentinelIntegrity,
		ownerUid: identity.processUid,
		rootMetaInfoPath: store.rootMetaInfo.path,
	});
	assertRootFingerprintContinuity({
		actual: rootFingerprintAtBoundary,
		expected: expectedRootFingerprint,
	});
	return rootFingerprintAtBoundary;
}

export async function assertCapCutGuiImmutableInputsBoundary({
	app,
	bundleRun,
	executionSentinel,
	identity,
	inspectApp,
	store,
	verifyBundle,
}: {
	app: CapCutGuiAppReport;
	bundleRun: CapCutGuiBundleRunReport;
	executionSentinel: CapCutGuiExecutionSentinel;
	identity: CapCutGuiProcessIdentityReport;
	inspectApp: CapCutGuiAppInspector;
	store: DisposableCapCutStorePreflightReport;
	verifyBundle: CapCutGuiBundleVerifier;
}): Promise<void> {
	await reverifyPlannedGuiBundles({
		bundles: bundleRun.bundles,
		verifyBundle,
	});
	const appAtBoundary = await inspectApp({
		capCutAppPath: app.canonicalAppPath,
	});
	assertAppReportUnchanged({ actual: appAtBoundary, expected: app });
	const sentinelAtBoundary = await inspectExecutionSentinel({
		bundleRun,
		identity,
		store,
	});
	assertExecutionSentinelUnchanged({
		actual: sentinelAtBoundary,
		expected: executionSentinel,
	});
}
