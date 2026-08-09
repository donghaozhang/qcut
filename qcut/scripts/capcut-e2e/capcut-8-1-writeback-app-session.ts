import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { userInfo } from "node:os";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { CapCutGuiAppInspector } from "./gui-regression-app-profile.js";
import {
	inspectCapCutApp,
	type CapCutGuiAppReport,
} from "./gui-regression-app-profile.js";
import { CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_FILE_NAME } from "./capcut-8-1-writeback-app-receipt-contract.js";
import {
	requireAppReceiptSha256,
	requireSafeAppReceiptId,
} from "./capcut-8-1-writeback-app-receipt-fields.js";
import { loadCapCut81WritebackAppReceipt } from "./capcut-8-1-writeback-app-receipt.js";
import {
	buildCapCut81WritebackAppIdentity,
	writeCapCut81WritebackAppSessionPlan,
	writeCapCut81WritebackAppSessionResult,
} from "./capcut-8-1-writeback-app-session-artifacts.js";
import {
	assertCapCut81WritebackDraftDirectoryBinding,
	assertDraftBelongsToDedicatedStore,
	captureCapCut81WritebackAppPhase,
	captureCapCut81WritebackDraftDirectoryBinding,
} from "./capcut-8-1-writeback-app-session-draft.js";
import {
	captureCapCut81WritebackAppProcessBoundary,
	type CapCut81WritebackAppProcessInspector,
} from "./capcut-8-1-writeback-app-session-process.js";
import {
	assertCapCut81WritebackDedicatedUser,
	assertCapCut81WritebackSessionDirectory,
	assertCapCut81WritebackStoreRegistration,
	requireCapCut81WritebackSessionLocation,
} from "./capcut-8-1-writeback-app-session-environment.js";
import {
	CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_FILE_NAME,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA_VERSION,
	readCapCut81WritebackAppSessionState,
	type CapCut81WritebackAppSessionState,
	writeCapCut81WritebackAppSessionState,
} from "./capcut-8-1-writeback-app-session-state.js";
import { loadCapCut81WritebackRuntime } from "./capcut-8-1-writeback-verification-runtime.js";
import {
	parseJsonRecord,
	readRegularFileSnapshot,
} from "./disposable-store-control-file.js";

export type CapCut81WritebackAppSessionBoundary =
	| "opened"
	| "saved"
	| "reopened"
	| "final";

export interface CapCut81WritebackAppSessionDependencies {
	inspectApp: CapCutGuiAppInspector;
	inspectProcesses?: CapCut81WritebackAppProcessInspector;
	loadRuntime: typeof loadCapCut81WritebackRuntime;
	now: () => Date;
	readUserIdentity: () => { homeDirectory: string; uid: number };
}

const DEFAULT_DEPENDENCIES: CapCut81WritebackAppSessionDependencies = {
	inspectApp: inspectCapCutApp,
	loadRuntime: loadCapCut81WritebackRuntime,
	now: () => new Date(),
	readUserIdentity: () => {
		const info = userInfo();
		return { homeDirectory: info.homedir, uid: info.uid };
	},
};

async function inspectBoundApp({
	dependencies,
	state,
}: {
	dependencies: CapCut81WritebackAppSessionDependencies;
	state: CapCut81WritebackAppSessionState;
}): Promise<CapCutGuiAppReport> {
	const app = await dependencies.inspectApp({ capCutAppPath: state.appPath });
	if (
		app.canonicalAppPath !== state.appPath ||
		app.appDirectoryIdentity.device !== state.appDirectoryIdentity.device ||
		app.appDirectoryIdentity.inode !== state.appDirectoryIdentity.inode ||
		!isDeepStrictEqual(buildCapCut81WritebackAppIdentity({ app }), state.app)
	) {
		throw new Error(
			"CapCut 8.1.1 application identity changed during capture."
		);
	}
	return app;
}

async function assertImmutableSessionInputs({
	dependencies,
	sessionDirectory,
	state,
}: {
	dependencies: CapCut81WritebackAppSessionDependencies;
	sessionDirectory: string;
	state: CapCut81WritebackAppSessionState;
}): Promise<CapCutGuiAppReport> {
	const { canonicalHomeDirectory } = await assertCapCut81WritebackDedicatedUser(
		{
			dedicatedTestHomeDirectory: state.dedicatedTestHomeDirectory,
			readUserIdentity: dependencies.readUserIdentity,
		}
	);
	await assertCapCut81WritebackSessionDirectory({
		homeDirectory: canonicalHomeDirectory,
		sessionDirectory,
	});
	assertDraftBelongsToDedicatedStore({
		dedicatedTestHomeDirectory: canonicalHomeDirectory,
		draftDirectory: state.draftBinding.canonicalPath,
	});
	await assertCapCut81WritebackStoreRegistration({
		draftDirectory: state.draftBinding.canonicalPath,
		homeDirectory: canonicalHomeDirectory,
	});
	await assertCapCut81WritebackDraftDirectoryBinding({
		binding: state.draftBinding,
	});
	const planSnapshot = await readRegularFileSnapshot({
		label: "CapCut writeback app session plan",
		path: join(
			sessionDirectory,
			CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_FILE_NAME
		),
	});
	const currentPlanSha256 = createHash("sha256")
		.update(planSnapshot.bytes)
		.digest("hex");
	if (currentPlanSha256 !== state.planSha256) {
		throw new Error("CapCut writeback app session plan changed.");
	}
	return inspectBoundApp({ dependencies, state });
}

export async function createCapCut81WritebackAppSession({
	appPath,
	caseId,
	dedicatedTestHomeDirectory,
	dependencies = DEFAULT_DEPENDENCIES,
	draftDirectory,
	outputContentSha256,
	profileId,
	runId = randomUUID(),
	sessionDirectory,
}: {
	appPath: string;
	caseId: string;
	dedicatedTestHomeDirectory: string;
	dependencies?: CapCut81WritebackAppSessionDependencies;
	draftDirectory: string;
	outputContentSha256: string;
	profileId: string;
	runId?: string;
	sessionDirectory: string;
}): Promise<{ planPath: string; statePath: string }> {
	requireSafeAppReceiptId({
		label: "CapCut app session caseId",
		value: caseId,
	});
	requireSafeAppReceiptId({
		label: "CapCut app session profileId",
		value: profileId,
	});
	requireSafeAppReceiptId({ label: "CapCut app session runId", value: runId });
	requireAppReceiptSha256({
		label: "CapCut app session output digest",
		value: outputContentSha256,
	});
	const { canonicalHomeDirectory } = await assertCapCut81WritebackDedicatedUser(
		{
			dedicatedTestHomeDirectory,
			readUserIdentity: dependencies.readUserIdentity,
		}
	);
	const requestedSessionDirectory = requireCapCut81WritebackSessionLocation({
		homeDirectory: canonicalHomeDirectory,
		sessionDirectory,
	});
	const draftBinding = await captureCapCut81WritebackDraftDirectoryBinding({
		draftDirectory,
	});
	assertDraftBelongsToDedicatedStore({
		dedicatedTestHomeDirectory: canonicalHomeDirectory,
		draftDirectory: draftBinding.canonicalPath,
	});
	await assertCapCut81WritebackStoreRegistration({
		draftDirectory: draftBinding.canonicalPath,
		homeDirectory: canonicalHomeDirectory,
	});
	const [app, runtime] = await Promise.all([
		dependencies.inspectApp({ capCutAppPath: appPath }),
		dependencies.loadRuntime(),
	]);
	if (runtime.profileId !== profileId) {
		throw new Error(
			"CapCut writeback app session profile does not match the runtime."
		);
	}
	await captureCapCut81WritebackAppProcessBoundary({
		app,
		expectedState: "absent",
		inspectProcesses: dependencies.inspectProcesses,
	});
	const rootSnapshot = await readRegularFileSnapshot({
		label: "CapCut writeback root draft_info.json",
		maximumBytes: 256 * 1024 * 1024,
		path: join(draftBinding.canonicalPath, "draft_info.json"),
	});
	const root = parseJsonRecord({
		bytes: rootSnapshot.bytes,
		label: "CapCut writeback root draft_info.json",
	});
	if (typeof root.id !== "string" || root.id.length === 0) {
		throw new Error("CapCut writeback root timeline ID is missing.");
	}
	const activeMirrorRelativePaths = runtime.buildActiveContentMirrorPaths({
		timelineId: root.id,
	});
	const capturedAtIso = dependencies.now().toISOString();
	const preOpen = await captureCapCut81WritebackAppPhase({
		activeMirrorRelativePaths,
		activeMirrorTemplates: runtime.activeContentMirrorTemplates,
		capturedAtIso,
		draftBinding,
		phase: "pre-open",
	});
	if (preOpen.activeMirrors[0].sha256 !== outputContentSha256) {
		throw new Error(
			"CapCut writeback app session does not match the expected writeback output."
		);
	}
	await mkdir(requestedSessionDirectory, { mode: 0o700 });
	const canonicalSessionDirectory =
		await assertCapCut81WritebackSessionDirectory({
			homeDirectory: canonicalHomeDirectory,
			sessionDirectory: requestedSessionDirectory,
		});
	const appIdentity = buildCapCut81WritebackAppIdentity({ app });
	const { planPath, planSha256 } = await writeCapCut81WritebackAppSessionPlan({
		activeMirrorTemplates: runtime.activeContentMirrorTemplates,
		app: appIdentity,
		caseId,
		createdAtIso: capturedAtIso,
		preOpen,
		profileId,
		runId,
		sessionDirectory: canonicalSessionDirectory,
	});
	const state: CapCut81WritebackAppSessionState = {
		activeMirrorRelativePaths,
		activeMirrorTemplates: runtime.activeContentMirrorTemplates,
		app: appIdentity,
		appDirectoryIdentity: {
			device: app.appDirectoryIdentity.device,
			inode: app.appDirectoryIdentity.inode,
		},
		appPath: app.canonicalAppPath,
		caseId,
		createdAtIso: capturedAtIso,
		dedicatedTestHomeDirectory: canonicalHomeDirectory,
		draftBinding,
		lastCapturedAtIso: capturedAtIso,
		openProcessGenerationSha256: null,
		outputContentSha256,
		planSha256,
		preOpen,
		profileId,
		reopenProcessGenerationSha256: null,
		reopened: null,
		runId,
		saved: null,
		schema: CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA,
		schemaVersion: CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_SCHEMA_VERSION,
		stage: "awaiting-open",
	};
	const statePath = join(
		canonicalSessionDirectory,
		CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_FILE_NAME
	);
	await writeCapCut81WritebackAppSessionState({
		initial: true,
		state,
		statePath,
	});
	return { planPath, statePath };
}

export async function advanceCapCut81WritebackAppSession({
	boundary,
	dependencies = DEFAULT_DEPENDENCIES,
	sessionDirectory,
}: {
	boundary: CapCut81WritebackAppSessionBoundary;
	dependencies?: CapCut81WritebackAppSessionDependencies;
	sessionDirectory: string;
}): Promise<{
	receiptPath?: string;
	stage: CapCut81WritebackAppSessionState["stage"];
}> {
	const statePath = join(
		resolve(sessionDirectory),
		CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_FILE_NAME
	);
	const state = await readCapCut81WritebackAppSessionState({ statePath });
	const app = await assertImmutableSessionInputs({
		dependencies,
		sessionDirectory: resolve(sessionDirectory),
		state,
	});
	const capturedAtIso = dependencies.now().toISOString();
	if (Date.parse(capturedAtIso) < Date.parse(state.lastCapturedAtIso)) {
		throw new Error("CapCut writeback app session clock moved backwards.");
	}
	if (boundary === "opened") {
		if (state.stage !== "awaiting-open") {
			throw new Error(
				"CapCut writeback app session is not awaiting first open."
			);
		}
		const processBoundary = await captureCapCut81WritebackAppProcessBoundary({
			app,
			expectedState: "present",
			inspectProcesses: dependencies.inspectProcesses,
		});
		if (!processBoundary.generationSha256) {
			throw new Error("CapCut first-open process generation is missing.");
		}
		const next = {
			...state,
			lastCapturedAtIso: capturedAtIso,
			openProcessGenerationSha256: processBoundary.generationSha256,
			stage: "awaiting-save-and-quit" as const,
		};
		await writeCapCut81WritebackAppSessionState({
			initial: false,
			state: next,
			statePath,
		});
		return { stage: next.stage };
	}
	if (boundary === "saved") {
		if (state.stage !== "awaiting-save-and-quit") {
			throw new Error(
				"CapCut writeback app session is not awaiting save and quit."
			);
		}
		await captureCapCut81WritebackAppProcessBoundary({
			app,
			expectedState: "absent",
			inspectProcesses: dependencies.inspectProcesses,
		});
		const saved = await captureCapCut81WritebackAppPhase({
			activeMirrorRelativePaths: state.activeMirrorRelativePaths,
			activeMirrorTemplates: state.activeMirrorTemplates,
			capturedAtIso,
			draftBinding: state.draftBinding,
			phase: "saved",
		});
		const next = {
			...state,
			lastCapturedAtIso: capturedAtIso,
			saved,
			stage: "awaiting-reopen" as const,
		};
		await writeCapCut81WritebackAppSessionState({
			initial: false,
			state: next,
			statePath,
		});
		return { stage: next.stage };
	}
	if (boundary === "reopened") {
		if (state.stage !== "awaiting-reopen" || !state.saved) {
			throw new Error("CapCut writeback app session is not awaiting reopen.");
		}
		const processBoundary = await captureCapCut81WritebackAppProcessBoundary({
			app,
			expectedState: "present",
			inspectProcesses: dependencies.inspectProcesses,
		});
		if (
			!processBoundary.generationSha256 ||
			processBoundary.generationSha256 === state.openProcessGenerationSha256
		) {
			throw new Error("CapCut reopen must use a distinct process generation.");
		}
		const reopened = await captureCapCut81WritebackAppPhase({
			activeMirrorRelativePaths: state.activeMirrorRelativePaths,
			activeMirrorTemplates: state.activeMirrorTemplates,
			capturedAtIso,
			draftBinding: state.draftBinding,
			phase: "reopened",
		});
		if (!isDeepStrictEqual(reopened.activeMirrors, state.saved.activeMirrors)) {
			throw new Error("CapCut reopened mirrors differ from the saved state.");
		}
		const next = {
			...state,
			lastCapturedAtIso: capturedAtIso,
			reopenProcessGenerationSha256: processBoundary.generationSha256,
			reopened,
			stage: "awaiting-final-quit" as const,
		};
		await writeCapCut81WritebackAppSessionState({
			initial: false,
			state: next,
			statePath,
		});
		return { stage: next.stage };
	}
	if (
		boundary !== "final" ||
		state.stage !== "awaiting-final-quit" ||
		!state.saved ||
		!state.reopened ||
		!state.openProcessGenerationSha256 ||
		!state.reopenProcessGenerationSha256
	) {
		throw new Error("CapCut writeback app session is not awaiting final quit.");
	}
	await captureCapCut81WritebackAppProcessBoundary({
		app,
		expectedState: "absent",
		inspectProcesses: dependencies.inspectProcesses,
	});
	const finalPhase = await captureCapCut81WritebackAppPhase({
		activeMirrorRelativePaths: state.activeMirrorRelativePaths,
		activeMirrorTemplates: state.activeMirrorTemplates,
		capturedAtIso,
		draftBinding: state.draftBinding,
		phase: "reopened",
	});
	if (
		!isDeepStrictEqual(finalPhase.activeMirrors, state.reopened.activeMirrors)
	) {
		throw new Error("CapCut mirrors changed during final quit.");
	}
	const processBoundaries = {
		finalProcessState: "absent" as const,
		initialProcessState: "absent" as const,
		openProcessGenerationSha256: state.openProcessGenerationSha256,
		reopenProcessGenerationSha256: state.reopenProcessGenerationSha256,
		saveAndQuitProcessState: "absent" as const,
	};
	const generatedAtIso = dependencies.now().toISOString();
	const { receiptPath } = await writeCapCut81WritebackAppSessionResult({
		app: state.app,
		caseId: state.caseId,
		completedAtIso: capturedAtIso,
		generatedAtIso,
		phases: [state.preOpen, state.saved, state.reopened],
		planSha256: state.planSha256,
		processBoundaries,
		profileId: state.profileId,
		runId: state.runId,
		sessionDirectory: resolve(sessionDirectory),
	});
	await loadCapCut81WritebackAppReceipt({
		expected: {
			activeMirrorTemplates: state.activeMirrorTemplates,
			caseId: state.caseId,
			outputContentSha256: state.outputContentSha256,
			profileId: state.profileId,
		},
		path: receiptPath,
	});
	const completedState = {
		...state,
		lastCapturedAtIso: generatedAtIso,
		stage: "complete" as const,
	};
	await writeCapCut81WritebackAppSessionState({
		initial: false,
		state: completedState,
		statePath,
	});
	return { receiptPath, stage: "complete" };
}
