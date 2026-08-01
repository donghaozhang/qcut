import { join } from "node:path";
import type { DisposableCapCutStorePreflightReport } from "./disposable-store-guard.js";
import { readRegularFileSnapshot } from "./disposable-store-control-file.js";
import type { CapCutGuiBundleRunReport } from "./gui-regression-bundle-run.js";
import {
	assertExactKeys,
	requireCanonicalPath,
	requireRecord,
} from "./gui-regression-filesystem.js";
import type { CapCutGuiProcessIdentityReport } from "./gui-regression-identity.js";

export const CAPCUT_GUI_EXECUTION_CONFIRMATION =
	"I_AM_IN_AN_ISOLATED_CAPCUT_8_1_1_LOGIN";
export const CAPCUT_GUI_EXECUTION_SENTINEL_FILE_NAME =
	".qcut-capcut-e2e-gui-execution.json";
export const CAPCUT_GUI_EXECUTION_SENTINEL_PURPOSE =
	"qcut-capcut-e2e-gui-only-no-personal-drafts";
export const CAPCUT_GUI_EXECUTION_SENTINEL_SCHEMA =
	"qcut.capcut-e2e.gui-execution";
export const CAPCUT_GUI_EXECUTION_SENTINEL_VERSION = 1;

export interface CapCutGuiExecutionSentinel {
	canonicalHomePath: string;
	canonicalStorePath: string;
	purpose: typeof CAPCUT_GUI_EXECUTION_SENTINEL_PURPOSE;
	runId: string;
	schema: typeof CAPCUT_GUI_EXECUTION_SENTINEL_SCHEMA;
	uid: number;
	username: string;
	version: typeof CAPCUT_GUI_EXECUTION_SENTINEL_VERSION;
}

function getErrorCode({ error }: { error: unknown }): string | null {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return null;
	}
	return typeof error.code === "string" ? error.code : null;
}

export async function inspectExecutionSentinel({
	bundleRun,
	identity,
	store,
}: {
	bundleRun: CapCutGuiBundleRunReport;
	identity: CapCutGuiProcessIdentityReport;
	store: DisposableCapCutStorePreflightReport;
}): Promise<CapCutGuiExecutionSentinel> {
	const sentinelPath = join(
		store.dedicatedTestHomePath,
		CAPCUT_GUI_EXECUTION_SENTINEL_FILE_NAME
	);
	const sentinelFile = await requireCanonicalPath({
		expectedKind: "file",
		label: "CapCut GUI execution sentinel",
		path: sentinelPath,
	}).catch((error: unknown) => {
		if (getErrorCode({ error }) === "ENOENT") {
			throw new Error("CapCut GUI execution sentinel is required.");
		}
		throw error;
	});
	if (Number(sentinelFile.stats.uid) !== identity.processUid) {
		throw new Error(
			"CapCut GUI execution sentinel must be owned by the isolated process user."
		);
	}
	let parsed: unknown;
	try {
		const snapshot = await readRegularFileSnapshot({
			label: "CapCut GUI execution sentinel",
			path: sentinelFile.canonicalPath,
		});
		parsed = JSON.parse(snapshot.bytes.toString("utf8"));
	} catch {
		throw new Error("CapCut GUI execution sentinel must contain valid JSON.");
	}
	const value = requireRecord({
		label: "CapCut GUI execution sentinel",
		value: parsed,
	});
	assertExactKeys({
		expectedKeys: [
			"canonicalHomePath",
			"canonicalStorePath",
			"purpose",
			"runId",
			"schema",
			"uid",
			"username",
			"version",
		],
		label: "CapCut GUI execution sentinel",
		value,
	});
	if (
		value.canonicalHomePath !== store.dedicatedTestHomePath ||
		value.canonicalStorePath !== store.canonicalStorePath ||
		value.purpose !== CAPCUT_GUI_EXECUTION_SENTINEL_PURPOSE ||
		value.runId !== bundleRun.runId ||
		value.schema !== CAPCUT_GUI_EXECUTION_SENTINEL_SCHEMA ||
		value.uid !== identity.processUid ||
		value.username !== identity.username ||
		value.version !== CAPCUT_GUI_EXECUTION_SENTINEL_VERSION
	) {
		throw new Error(
			"CapCut GUI execution sentinel does not match this isolated user, store, and bundle run."
		);
	}
	return {
		canonicalHomePath: store.dedicatedTestHomePath,
		canonicalStorePath: store.canonicalStorePath,
		purpose: CAPCUT_GUI_EXECUTION_SENTINEL_PURPOSE,
		runId: bundleRun.runId,
		schema: CAPCUT_GUI_EXECUTION_SENTINEL_SCHEMA,
		uid: identity.processUid,
		username: identity.username,
		version: CAPCUT_GUI_EXECUTION_SENTINEL_VERSION,
	};
}
