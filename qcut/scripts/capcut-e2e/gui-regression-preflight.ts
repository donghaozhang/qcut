import { resolve } from "node:path";
import {
	preflightDisposableCapCutStore,
	type DisposableCapCutStorePreflightReport,
} from "./disposable-store-guard.js";
import {
	inspectCapCutApp,
	parseCapCutAppMetadata,
	type CapCutGuiAppInspector,
	type CapCutGuiAppReport,
} from "./gui-regression-app-profile.js";
import {
	inspectBundleRun,
	type CapCutGuiBundleRunReport,
} from "./gui-regression-bundle-run.js";
import {
	createProductionBundleVerifier,
	type CapCutGuiBundleVerifier,
} from "./gui-regression-bundle-verification.js";
import {
	CAPCUT_GUI_EXECUTION_CONFIRMATION,
	inspectExecutionSentinel,
	type CapCutGuiExecutionSentinel,
} from "./gui-regression-execution-sentinel.js";
import {
	assertDedicatedProcessIdentity,
	readActualProcessIdentity,
	readOwnerUid,
	type CapCutGuiOwnerReader,
	type CapCutGuiProcessIdentity,
	type CapCutGuiProcessIdentityReport,
} from "./gui-regression-identity.js";
import {
	captureCapCutGuiRootFingerprint,
	type CapCutGuiRootFingerprint,
} from "./gui-regression-evidence.js";

export {
	CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
	CAPCUT_GUI_APP_VERSION,
} from "./gui-regression-app-profile.js";
export {
	CAPCUT_GUI_EXECUTION_CONFIRMATION,
	CAPCUT_GUI_EXECUTION_SENTINEL_FILE_NAME,
	CAPCUT_GUI_EXECUTION_SENTINEL_PURPOSE,
	CAPCUT_GUI_EXECUTION_SENTINEL_SCHEMA,
	CAPCUT_GUI_EXECUTION_SENTINEL_VERSION,
} from "./gui-regression-execution-sentinel.js";

export type CapCutGuiRegressionMode = "dry-run" | "execute";

const PROJECT_ROOT = resolve(process.cwd());

export interface CapCutGuiRegressionPreflightReport {
	app: CapCutGuiAppReport;
	bundleRun: CapCutGuiBundleRunReport;
	executionSentinel: CapCutGuiExecutionSentinel | null;
	identity: CapCutGuiProcessIdentityReport;
	mode: CapCutGuiRegressionMode;
	rootFingerprint: CapCutGuiRootFingerprint;
	store: DisposableCapCutStorePreflightReport;
}

export interface CapCutGuiRegressionPreflightOptions {
	bundleManifestPath: string;
	capCutAppPath: string;
	dedicatedTestHomeDirectory: string;
	executionConfirmation?: string;
	mode?: CapCutGuiRegressionMode;
}

interface PreflightRuntime {
	identity: CapCutGuiProcessIdentity;
	inspectApp: CapCutGuiAppInspector;
	platform: NodeJS.Platform;
	preflightStore: typeof preflightDisposableCapCutStore;
	readOwner: CapCutGuiOwnerReader;
	verifyBundle: CapCutGuiBundleVerifier;
}

async function preflightWithRuntime({
	options,
	runtime,
}: {
	options: CapCutGuiRegressionPreflightOptions;
	runtime: PreflightRuntime;
}): Promise<CapCutGuiRegressionPreflightReport> {
	if (runtime.platform !== "darwin") {
		throw new Error("CapCut GUI regression requires macOS.");
	}
	const mode = options.mode ?? "dry-run";
	if (
		mode === "execute" &&
		options.executionConfirmation !== CAPCUT_GUI_EXECUTION_CONFIRMATION
	) {
		throw new Error(
			`Execute mode requires the exact confirmation flag ${CAPCUT_GUI_EXECUTION_CONFIRMATION}.`
		);
	}
	const store = await runtime.preflightStore({
		dedicatedTestHomeDirectory: options.dedicatedTestHomeDirectory,
	});
	const identity = await assertDedicatedProcessIdentity({
		identity: runtime.identity,
		readOwner: runtime.readOwner,
		store,
	});
	const [app, bundleRun] = await Promise.all([
		runtime.inspectApp({ capCutAppPath: options.capCutAppPath }),
		inspectBundleRun({
			bundleManifestPath: options.bundleManifestPath,
			expectedOwnerUid: identity.processUid,
			storePath: store.canonicalStorePath,
			verifyBundle: runtime.verifyBundle,
		}),
	]);
	const rootFingerprint = await captureCapCutGuiRootFingerprint({
		bundles: bundleRun.bundles,
		canonicalStorePath: store.canonicalStorePath,
		ownerUid: identity.processUid,
		rootMetaInfoPath: store.rootMetaInfo.path,
	});
	return {
		app,
		bundleRun,
		executionSentinel:
			mode === "execute"
				? await inspectExecutionSentinel({ bundleRun, identity, store })
				: null,
		identity,
		mode,
		rootFingerprint,
		store,
	};
}

export async function preflightCapCutGuiRegression({
	bundleManifestPath,
	capCutAppPath,
	dedicatedTestHomeDirectory,
	executionConfirmation,
	mode,
}: CapCutGuiRegressionPreflightOptions): Promise<CapCutGuiRegressionPreflightReport> {
	return preflightWithRuntime({
		options: {
			bundleManifestPath,
			capCutAppPath,
			dedicatedTestHomeDirectory,
			...(executionConfirmation === undefined ? {} : { executionConfirmation }),
			...(mode === undefined ? {} : { mode }),
		},
		runtime: {
			identity: readActualProcessIdentity(),
			inspectApp: inspectCapCutApp,
			platform: process.platform,
			preflightStore: preflightDisposableCapCutStore,
			readOwner: readOwnerUid,
			verifyBundle: createProductionBundleVerifier({
				projectRoot: PROJECT_ROOT,
			}),
		},
	});
}

export const capCutGuiRegressionPreflightTesting = Object.freeze({
	inspectBundleRun,
	parseCapCutAppMetadata,
	preflightWithRuntime,
});
