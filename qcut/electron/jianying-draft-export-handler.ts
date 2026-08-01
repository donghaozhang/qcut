import { mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
	app,
	ipcMain,
	type BrowserWindow,
	type IpcMainInvokeEvent,
} from "electron";
import { getFFprobePath } from "./ffmpeg/paths.js";
import {
	type CapCut81MigrationRuntimeInstaller,
	createCommittedCapCut81BundleInstaller,
} from "./capcut-8-1-install-handler.js";
import {
	type CapCut81TargetAppGuard,
	createCapCut81TargetAppGuard,
} from "./capcut-8-1-install-guard.js";
import {
	CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
	CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
	CAPCUT_8_1_MIGRATION_PLAN_CHANNEL,
	type CapCut81MigrationCommitDto,
	type CapCut81MigrationInstallDto,
	type CapCut81MigrationPlanDto,
	type JianyingDraftExportErrorCode,
	type JianyingDraftExportErrorDto,
	type JianyingDraftExportResultDto,
} from "./jianying-draft-export-contract.js";

const MAX_ERROR_MESSAGE_LENGTH = 16_384;
const MAX_ERROR_DETAIL_COUNT = 256;
const CAPCUT_DRAFT_EXPORT_PATH_PARTS = [
	"QCut",
	"Exports",
	"CapCut Drafts",
] as const;
const CAPCUT_ALLOWED_SOURCE_PATH_PARTS = ["QCut", "Projects"] as const;
const CAPCUT_DRAFT_STORE_PATH_PARTS = [
	"CapCut",
	"User Data",
	"Projects",
	"com.lveditor.draft",
] as const;
const DEFAULT_CAPCUT_APP_PATH = "/Applications/CapCut.app";

interface RuntimePlan {
	blockerFingerprints: readonly string[];
	canCommit: boolean;
	expiresAtUnixMilliseconds: number;
	issueSetFingerprint: string;
	issues: ReadonlyArray<{
		code: string;
		elementId?: string;
		mediaId?: string;
		message: string;
		severity: "error" | "info" | "warning";
		trackId?: string;
	}>;
	planToken: string;
	requestFingerprint: string;
	warningFingerprints: readonly string[];
}

interface RuntimeCommitResult {
	completeMarkerPath: string;
	contentSha256: string;
	copiedAssets: readonly unknown[];
	draftDirectory: string;
	draftFolderName: string;
	draftStoreDirectory: string;
	durability: "best-effort" | "fsync-complete";
	durabilityWarnings: readonly string[];
	ffprobeVersion: {
		banner: string;
		major: 8;
		version: string;
	};
	generatedAssets: readonly unknown[];
	ids: {
		draftId: string;
		placeholderId: string;
		projectId: string;
		timelineId: string;
	};
	manifestPath: string;
	outputDirectory: string;
	timelineMaterialsSize: number;
}

interface CapCut81MigrationExportSessionLike {
	commit({ input }: { input: unknown }): Promise<RuntimeCommitResult>;
	dispose(): void;
	plan({ input }: { input: unknown }): Promise<RuntimePlan>;
}

interface CapCut81MigrationExportSessionConstructor {
	new (options: {
		allowedSourceRootDirectory: string;
		capCutAppPath: string;
		ffprobePath: string;
		outputParentDirectory: string;
	}): CapCut81MigrationExportSessionLike;
}

type DirectoryWriter = ({
	directoryPath,
}: {
	directoryPath: string;
}) => Promise<void>;

interface SetupJianyingDraftExportIPCOptions {
	assertTargetAppClosed?: CapCut81TargetAppGuard;
	ensureDirectory?: DirectoryWriter;
	getCapCutAppPath?: () => string;
	getCapCutDraftStoreDirectory?: () => string;
	getDocumentsDirectory?: () => string;
	getMainWindow: () => BrowserWindow | null;
	loadRuntime?: () => Promise<unknown>;
	resolveFfprobePath?: () => Promise<string>;
}

export interface JianyingDraftExportIPCController {
	dispose(): void;
}

class UntrustedJianyingDraftSenderError extends Error {
	constructor() {
		super(
			"JianYing draft export is only available to the main application frame."
		);
		this.name = "UntrustedJianyingDraftSenderError";
	}
}

class JianyingDraftExportDisposedError extends Error {
	constructor() {
		super("JianYing draft export IPC has been disposed.");
		this.name = "JianyingDraftExportDisposedError";
	}
}

class JianyingDraftRuntimeUnavailableError extends Error {
	constructor({ cause }: { cause: unknown }) {
		super(
			`The bundled JianYing draft export runtime is unavailable: ${
				cause instanceof Error ? cause.message : String(cause)
			}`
		);
		this.name = "JianyingDraftRuntimeUnavailableError";
	}
}

async function ensureDirectoryDefault({
	directoryPath,
}: {
	directoryPath: string;
}): Promise<void> {
	await mkdir(directoryPath, { mode: 0o700, recursive: true });
}

async function resolveTrustedFfprobePath(): Promise<string> {
	const candidatePath = await getFFprobePath();
	if (!isAbsolute(candidatePath)) {
		throw new Error("QCut's FFprobe resolver did not return an absolute path.");
	}
	return realpath(candidatePath);
}

async function loadBundledRuntime(): Promise<unknown> {
	const runtimePath = join(__dirname, "jianying-draft-export-runtime.js");
	return import(runtimePath);
}

function getRuntimeExport({
	exportName,
	runtimeModule,
}: {
	exportName: string;
	runtimeModule: unknown;
}): unknown {
	if (typeof runtimeModule !== "object" || runtimeModule === null) {
		throw new Error("The bundled runtime did not export a module object.");
	}
	const moduleRecord = runtimeModule as Record<string, unknown>;
	const defaultExport =
		typeof moduleRecord.default === "object" && moduleRecord.default !== null
			? (moduleRecord.default as Record<string, unknown>)
			: undefined;
	return moduleRecord[exportName] ?? defaultExport?.[exportName];
}

function getRuntimeConstructor({
	runtimeModule,
}: {
	runtimeModule: unknown;
}): CapCut81MigrationExportSessionConstructor {
	const sessionConstructor = getRuntimeExport({
		exportName: "CapCut81MigrationExportSession",
		runtimeModule,
	});
	if (typeof sessionConstructor !== "function") {
		throw new Error(
			"The bundled runtime is missing CapCut81MigrationExportSession."
		);
	}
	return sessionConstructor as CapCut81MigrationExportSessionConstructor;
}

function getRuntimeInstaller({
	runtimeModule,
}: {
	runtimeModule: unknown;
}): CapCut81MigrationRuntimeInstaller {
	const installer = getRuntimeExport({
		exportName: "installTrustedCapCut81MigrationBundle",
		runtimeModule,
	});
	if (typeof installer !== "function") {
		throw new Error(
			"The bundled runtime is missing installTrustedCapCut81MigrationBundle."
		);
	}
	return installer as CapCut81MigrationRuntimeInstaller;
}

function assertTrustedMainFrame({
	event,
	mainWindow,
}: {
	event: IpcMainInvokeEvent;
	mainWindow: BrowserWindow | null;
}): void {
	if (
		!mainWindow ||
		mainWindow.isDestroyed() ||
		mainWindow.webContents.isDestroyed() ||
		event.sender !== mainWindow.webContents ||
		event.senderFrame === null ||
		event.senderFrame !== mainWindow.webContents.mainFrame
	) {
		throw new UntrustedJianyingDraftSenderError();
	}
}

function toPlanDto({ plan }: { plan: RuntimePlan }): CapCut81MigrationPlanDto {
	return {
		blockerFingerprints: [...plan.blockerFingerprints],
		canCommit: plan.canCommit,
		expiresAtUnixMilliseconds: plan.expiresAtUnixMilliseconds,
		issues: plan.issues.map((issue) => ({
			code: issue.code,
			...(issue.elementId === undefined ? {} : { elementId: issue.elementId }),
			...(issue.mediaId === undefined ? {} : { mediaId: issue.mediaId }),
			message: issue.message,
			severity: issue.severity,
			...(issue.trackId === undefined ? {} : { trackId: issue.trackId }),
		})),
		issueSetFingerprint: plan.issueSetFingerprint,
		planToken: plan.planToken,
		requestFingerprint: plan.requestFingerprint,
		warningFingerprints: [...plan.warningFingerprints],
	};
}

function toCommitDto({
	result,
}: {
	result: RuntimeCommitResult;
}): CapCut81MigrationCommitDto {
	return {
		assetCount: result.copiedAssets.length + result.generatedAssets.length,
		completeMarkerPath: result.completeMarkerPath,
		contentSha256: result.contentSha256,
		draftDirectory: result.draftDirectory,
		draftFolderName: result.draftFolderName,
		draftStoreDirectory: result.draftStoreDirectory,
		durability: result.durability,
		durabilityWarnings: [...result.durabilityWarnings],
		ffprobeVersion: { ...result.ffprobeVersion },
		ids: { ...result.ids },
		manifestPath: result.manifestPath,
		outputDirectory: result.outputDirectory,
		timelineMaterialsSize: result.timelineMaterialsSize,
	};
}

function getErrorCode({
	errorName,
	fallbackCode,
}: {
	errorName: string;
	fallbackCode: JianyingDraftExportErrorCode;
}): JianyingDraftExportErrorCode {
	const errorCodesByName: Record<string, JianyingDraftExportErrorCode> = {
		CapCut81InstallConsumedError: "install-consumed",
		CapCut81InstallDisposedError: "disposed",
		CapCut81InstallNotCommittedError: "install-not-committed",
		CapCut81MigrationPlanBlockedError: "plan-blocked",
		CapCut81MigrationPlanConsumedError: "plan-consumed",
		CapCut81MigrationPlanExpiredError: "plan-expired",
		CapCut81MigrationPlanNotFoundError: "plan-not-found",
		CapCut81MigrationPlanStateChangedError: "plan-state-changed",
		CapCut81MigrationWarningAcceptanceError: "warnings-not-accepted",
		CapCutAppRunningError: "app-running",
		InvalidCapCut81InstallRequestError: "invalid-install",
		JianyingDraftExportDisposedError: "disposed",
		JianyingDraftRuntimeUnavailableError: "runtime-unavailable",
		StandaloneJianyingDraftCommitValidationError: "invalid-commit",
		StandaloneJianyingDraftPlanBlockedError: "plan-blocked",
		StandaloneJianyingDraftPlanConsumedError: "plan-consumed",
		StandaloneJianyingDraftPlanExpiredError: "plan-expired",
		StandaloneJianyingDraftPlanNotFoundError: "plan-not-found",
		StandaloneJianyingDraftPlanStateChangedError: "plan-state-changed",
		StandaloneJianyingDraftRequestValidationError: "invalid-request",
		StandaloneJianyingDraftWarningAcceptanceError: "warnings-not-accepted",
		UntrustedJianyingDraftSenderError: "untrusted-sender",
	};
	return errorCodesByName[errorName] ?? fallbackCode;
}

function copyStringArray({ value }: { value: unknown }): string[] | undefined {
	if (!Array.isArray(value) || value.length > MAX_ERROR_DETAIL_COUNT) {
		return undefined;
	}
	const strings = value.filter(
		(entry): entry is string =>
			typeof entry === "string" && entry.length > 0 && entry.length <= 4096
	);
	return strings.length === value.length ? strings : undefined;
}

function copyValidationIssues({
	value,
}: {
	value: unknown;
}): Array<{ message: string; path: string }> | undefined {
	if (!Array.isArray(value) || value.length > MAX_ERROR_DETAIL_COUNT) {
		return undefined;
	}
	const issues: Array<{ message: string; path: string }> = [];
	for (const issue of value) {
		if (typeof issue !== "object" || issue === null) return undefined;
		const record = issue as Record<string, unknown>;
		if (
			typeof record.message !== "string" ||
			record.message.length > MAX_ERROR_MESSAGE_LENGTH ||
			typeof record.path !== "string" ||
			record.path.length > 4096
		) {
			return undefined;
		}
		issues.push({ message: record.message, path: record.path });
	}
	return issues;
}

function toErrorDto({
	error,
	fallbackCode,
}: {
	error: unknown;
	fallbackCode: JianyingDraftExportErrorCode;
}): JianyingDraftExportErrorDto {
	const errorRecord =
		typeof error === "object" && error !== null
			? (error as Record<string, unknown>)
			: undefined;
	const name =
		error instanceof Error && error.name ? error.name.slice(0, 256) : "Error";
	const message = (
		error instanceof Error ? error.message : String(error)
	).slice(0, MAX_ERROR_MESSAGE_LENGTH);
	const blockerFingerprints = copyStringArray({
		value: errorRecord?.blockerFingerprints,
	});
	const requiredWarningFingerprints = copyStringArray({
		value: errorRecord?.requiredWarningFingerprints,
	});
	const issues = copyValidationIssues({ value: errorRecord?.issues });
	const hasDetails =
		blockerFingerprints !== undefined ||
		requiredWarningFingerprints !== undefined ||
		issues !== undefined;

	return {
		code: getErrorCode({ errorName: name, fallbackCode }),
		...(hasDetails
			? {
					details: {
						...(blockerFingerprints === undefined
							? {}
							: { blockerFingerprints }),
						...(issues === undefined ? {} : { issues }),
						...(requiredWarningFingerprints === undefined
							? {}
							: { requiredWarningFingerprints }),
					},
				}
			: {}),
		message,
		name,
	};
}

function success<Value>({
	value,
}: {
	value: Value;
}): JianyingDraftExportResultDto<Value> {
	return { ok: true, value };
}

function failure<Value>({
	error,
	fallbackCode = "export-failed",
}: {
	error: unknown;
	fallbackCode?: JianyingDraftExportErrorCode;
}): JianyingDraftExportResultDto<Value> {
	return { error: toErrorDto({ error, fallbackCode }), ok: false };
}

export function setupJianyingDraftExportIPC({
	assertTargetAppClosed = createCapCut81TargetAppGuard(),
	ensureDirectory = ensureDirectoryDefault,
	getCapCutAppPath = () => DEFAULT_CAPCUT_APP_PATH,
	getCapCutDraftStoreDirectory = () =>
		join(app.getPath("videos"), ...CAPCUT_DRAFT_STORE_PATH_PARTS),
	getDocumentsDirectory = () => app.getPath("documents"),
	getMainWindow,
	loadRuntime = loadBundledRuntime,
	resolveFfprobePath = resolveTrustedFfprobePath,
}: SetupJianyingDraftExportIPCOptions): JianyingDraftExportIPCController {
	let disposed = false;
	let session: CapCut81MigrationExportSessionLike | null = null;
	let sessionPromise: Promise<CapCut81MigrationExportSessionLike> | null = null;
	let runtimeModulePromise: Promise<unknown> | null = null;

	const getRuntimeModule = (): Promise<unknown> => {
		if (disposed) {
			return Promise.reject(new JianyingDraftExportDisposedError());
		}
		if (!runtimeModulePromise) {
			runtimeModulePromise = loadRuntime().catch((error: unknown) => {
				runtimeModulePromise = null;
				throw error;
			});
		}
		return runtimeModulePromise;
	};

	const createSession =
		async (): Promise<CapCut81MigrationExportSessionLike> => {
			try {
				const documentsDirectory = getDocumentsDirectory();
				const capCutAppPath = getCapCutAppPath();
				const outputParentDirectory = join(
					documentsDirectory,
					...CAPCUT_DRAFT_EXPORT_PATH_PARTS
				);
				const allowedSourceRootDirectory = join(
					documentsDirectory,
					...CAPCUT_ALLOWED_SOURCE_PATH_PARTS
				);
				const [runtimeModule, ffprobePath] = await Promise.all([
					getRuntimeModule(),
					resolveFfprobePath(),
					ensureDirectory({ directoryPath: outputParentDirectory }),
				]);
				if (!isAbsolute(ffprobePath)) {
					throw new Error("The trusted FFprobe path must be absolute.");
				}
				const SessionConstructor = getRuntimeConstructor({ runtimeModule });
				const createdSession = new SessionConstructor({
					allowedSourceRootDirectory,
					capCutAppPath,
					ffprobePath,
					outputParentDirectory,
				});
				if (disposed) {
					createdSession.dispose();
					throw new JianyingDraftExportDisposedError();
				}
				session = createdSession;
				return createdSession;
			} catch (error) {
				if (error instanceof JianyingDraftExportDisposedError) throw error;
				throw new JianyingDraftRuntimeUnavailableError({ cause: error });
			}
		};

	const getSession = (): Promise<CapCut81MigrationExportSessionLike> => {
		if (disposed) {
			return Promise.reject(new JianyingDraftExportDisposedError());
		}
		if (!sessionPromise) {
			sessionPromise = createSession().catch((error: unknown) => {
				sessionPromise = null;
				throw error;
			});
		}
		return sessionPromise;
	};

	const committedBundleInstaller = createCommittedCapCut81BundleInstaller({
		assertTargetAppClosed,
		getCapCutAppPath,
		getRuntimeInstaller: async () => {
			try {
				return getRuntimeInstaller({
					runtimeModule: await getRuntimeModule(),
				});
			} catch (error) {
				if (
					error instanceof JianyingDraftExportDisposedError ||
					error instanceof JianyingDraftRuntimeUnavailableError
				) {
					throw error;
				}
				throw new JianyingDraftRuntimeUnavailableError({ cause: error });
			}
		},
		getTargetDraftStoreDirectory: getCapCutDraftStoreDirectory,
	});

	ipcMain.handle(
		CAPCUT_8_1_MIGRATION_PLAN_CHANNEL,
		async (
			event: IpcMainInvokeEvent,
			input: unknown
		): Promise<JianyingDraftExportResultDto<CapCut81MigrationPlanDto>> => {
			try {
				assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
				const activeSession = await getSession();
				return success({
					value: toPlanDto({ plan: await activeSession.plan({ input }) }),
				});
			} catch (error) {
				return failure({ error });
			}
		}
	);

	ipcMain.handle(
		CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
		async (
			event: IpcMainInvokeEvent,
			input: unknown
		): Promise<JianyingDraftExportResultDto<CapCut81MigrationCommitDto>> => {
			try {
				assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
				const activeSession = await getSession();
				const result = await activeSession.commit({ input });
				committedBundleInstaller.recordCommittedOutput({
					outputDirectory: result.outputDirectory,
				});
				return success({
					value: toCommitDto({ result }),
				});
			} catch (error) {
				return failure({ error });
			}
		}
	);

	ipcMain.handle(
		CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
		async (
			event: IpcMainInvokeEvent,
			input: unknown
		): Promise<JianyingDraftExportResultDto<CapCut81MigrationInstallDto>> => {
			try {
				assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
				return success({
					value: await committedBundleInstaller.install({ input }),
				});
			} catch (error) {
				return failure({ error, fallbackCode: "install-failed" });
			}
		}
	);

	return {
		dispose: () => {
			if (disposed) return;
			disposed = true;
			ipcMain.removeHandler(CAPCUT_8_1_MIGRATION_PLAN_CHANNEL);
			ipcMain.removeHandler(CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL);
			ipcMain.removeHandler(CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL);
			committedBundleInstaller.dispose();
			session?.dispose();
			session = null;
			sessionPromise = null;
			runtimeModulePromise = null;
		},
	};
}
