import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import {
	type BrowserWindow,
	dialog,
	type IpcMainInvokeEvent,
	ipcMain,
} from "electron";
import {
	JIANYING_11_3_PROJECT_EXPORT_CHOOSE_CHANNEL,
	JIANYING_11_3_PROJECT_EXPORT_COMMIT_CHANNEL,
	JIANYING_11_3_PROJECT_EXPORT_PROFILE_IDS,
	type Jianying113ProjectExportCommitDto,
	type Jianying113ProjectExportSelectionDto,
	type JianyingProjectExportErrorCode,
	type JianyingProjectExportResultDto,
} from "./jianying-project-export-contract.js";
import {
	createJianyingTargetAppGuard,
	JianyingAppRunningError,
	type JianyingTargetAppGuard,
} from "./jianying-target-app-guard.js";

const DEFAULT_JIANYING_APP_PATH = "/Applications/VideoFusion-macOS.app";
const MAX_CONTENT_BYTES = 64 * 1024 * 1024;
const SELECTION_TTL_MILLISECONDS = 15 * 60 * 1000;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

interface ProjectExportSelection {
	expiresAtUnixMilliseconds: number;
	projectDirectory: string;
}

interface ProjectExportRuntime {
	write(options: {
		assertTargetAppClosed: (context: {
			projectDirectory: string;
		}) => Promise<void>;
		contentBytes: Uint8Array;
		expectedSourceSha256: string;
		profileId: string;
		projectDirectory: string;
	}): Promise<Jianying113ProjectExportCommitDto>;
}

export interface JianyingProjectExportIPCController {
	dispose(): void;
}

export interface SetupJianyingProjectExportIPCOptions {
	assertTargetAppClosed?: JianyingTargetAppGuard;
	canonicalizeDirectory?: (directory: string) => Promise<string>;
	chooseSourceProjectDirectory?: (options: {
		mainWindow: BrowserWindow;
	}) => Promise<string | null>;
	getMainWindow: () => BrowserWindow | null;
	loadRuntime?: () => Promise<unknown>;
	now?: () => number;
}

class ProjectExportHandlerError extends Error {
	readonly code: JianyingProjectExportErrorCode;

	constructor({
		code,
		message,
	}: {
		code: JianyingProjectExportErrorCode;
		message: string;
	}) {
		super(message);
		this.name = "ProjectExportHandlerError";
		this.code = code;
	}
}

function readRecord({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function hasExactKeys({
	record,
	keys,
}: {
	record: Record<string, unknown>;
	keys: readonly string[];
}): boolean {
	const actual = Object.keys(record).sort();
	const expected = [...keys].sort();
	return (
		actual.length === expected.length &&
		actual.every((key, index) => key === expected[index])
	);
}

function assertTrustedMainFrame({
	event,
	mainWindow,
}: {
	event: IpcMainInvokeEvent;
	mainWindow: BrowserWindow | null;
}): BrowserWindow {
	if (
		mainWindow === null ||
		mainWindow.isDestroyed() ||
		mainWindow.webContents.isDestroyed() ||
		event.sender !== mainWindow.webContents ||
		event.senderFrame === null ||
		event.senderFrame !== mainWindow.webContents.mainFrame
	) {
		throw new ProjectExportHandlerError({
			code: "untrusted-sender",
			message: "Jianying export caller is not the trusted main frame.",
		});
	}
	return mainWindow;
}

function decodeCanonicalBase64({ value }: { value: string }): Uint8Array {
	if (
		value.length === 0 ||
		value.length > Math.ceil(MAX_CONTENT_BYTES / 3) * 4 ||
		value.length % 4 !== 0 ||
		!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
			value
		)
	) {
		throw new ProjectExportHandlerError({
			code: "invalid-request",
			message:
				"Jianying export content must be canonical base64 within 64 MiB.",
		});
	}
	const bytes = Buffer.from(value, "base64");
	if (
		bytes.byteLength === 0 ||
		bytes.byteLength > MAX_CONTENT_BYTES ||
		bytes.toString("base64") !== value
	) {
		throw new ProjectExportHandlerError({
			code: "invalid-request",
			message: "Jianying export content payload is invalid.",
		});
	}
	return new Uint8Array(bytes);
}

function parseCommitRequest({ input }: { input: unknown }): {
	contentBytes: Uint8Array;
	expectedSourceSha256: string;
	profileId: string;
	selectionToken: string;
} {
	const record = readRecord({ value: input });
	if (
		record === undefined ||
		!hasExactKeys({
			record,
			keys: [
				"contentBase64",
				"expectedSourceSha256",
				"profileId",
				"selectionToken",
			],
		}) ||
		typeof record.contentBase64 !== "string" ||
		typeof record.expectedSourceSha256 !== "string" ||
		!SHA256_PATTERN.test(record.expectedSourceSha256) ||
		typeof record.profileId !== "string" ||
		!JIANYING_11_3_PROJECT_EXPORT_PROFILE_IDS.some(
			(profileId) => profileId === record.profileId
		) ||
		typeof record.selectionToken !== "string" ||
		record.selectionToken.length === 0 ||
		record.selectionToken.length > 128
	) {
		throw new ProjectExportHandlerError({
			code: "invalid-request",
			message: "Jianying project export request fields are invalid.",
		});
	}
	return {
		contentBytes: decodeCanonicalBase64({ value: record.contentBase64 }),
		expectedSourceSha256: record.expectedSourceSha256,
		profileId: record.profileId,
		selectionToken: record.selectionToken,
	};
}

const RUNTIME_ERROR_CODES: Record<string, JianyingProjectExportErrorCode> = {
	CONTENT_INVALID: "invalid-request",
	JIANYING_PROJECT_LOCKED: "jianying-project-locked",
	PROFILE_MISMATCH: "invalid-request",
	PROJECT_DIRECTORY_INVALID: "invalid-request",
	RECOVERY_REQUIRED: "recovery-required",
	SOURCE_FILE_UNSAFE: "source-file-unsafe",
	SOURCE_STATE_CHANGED: "source-state-changed",
	TRANSACTION_FAILED: "writeback-failed",
	WRITEBACK_ALREADY_RUNNING: "writeback-already-running",
};

function toErrorDto({ error }: { error: unknown }): {
	code: JianyingProjectExportErrorCode;
	message: string;
	name: string;
} {
	if (error instanceof ProjectExportHandlerError) {
		return { code: error.code, message: error.message, name: error.name };
	}
	const message = error instanceof Error ? error.message : String(error);
	const runtimeCode = readRecord({ value: error })?.code;
	const mappedRuntimeCode =
		typeof runtimeCode === "string"
			? RUNTIME_ERROR_CODES[runtimeCode]
			: undefined;
	const code =
		mappedRuntimeCode ??
		(error instanceof JianyingAppRunningError
			? "app-running"
			: /locked/iu.test(message)
				? "jianying-project-locked"
				: "writeback-failed");
	return {
		code,
		message: message.slice(0, 16_384),
		name: (error instanceof Error ? error.name : "Error").slice(0, 256),
	};
}

async function loadBundledRuntime(): Promise<unknown> {
	return import(join(__dirname, "jianying-draft-export-runtime.js"));
}

function parseRuntime({
	runtimeModule,
}: {
	runtimeModule: unknown;
}): ProjectExportRuntime {
	const record = readRecord({ value: runtimeModule });
	const defaultExport = readRecord({ value: record?.default });
	const write =
		record?.writeJianying113RegisteredProjectContent ??
		defaultExport?.writeJianying113RegisteredProjectContent;
	if (typeof write !== "function") {
		throw new ProjectExportHandlerError({
			code: "runtime-unavailable",
			message:
				"Bundled runtime is missing Jianying registered-project writeback support.",
		});
	}
	return { write: write as ProjectExportRuntime["write"] };
}

export function setupJianyingProjectExportIPC({
	assertTargetAppClosed = createJianyingTargetAppGuard({
		appPath: DEFAULT_JIANYING_APP_PATH,
	}),
	canonicalizeDirectory = realpath,
	chooseSourceProjectDirectory = async ({ mainWindow }) => {
		const result = await dialog.showOpenDialog(mainWindow, {
			title: "Choose the registered Jianying Professional project to update",
			properties: ["openDirectory"],
		});
		return result.canceled ? null : (result.filePaths[0] ?? null);
	},
	getMainWindow,
	loadRuntime = loadBundledRuntime,
	now = Date.now,
}: SetupJianyingProjectExportIPCOptions): JianyingProjectExportIPCController {
	const selections = new Map<string, ProjectExportSelection>();
	let runtimePromise: Promise<ProjectExportRuntime> | null = null;
	const getRuntime = (): Promise<ProjectExportRuntime> => {
		if (runtimePromise === null) {
			runtimePromise = loadRuntime()
				.then((runtimeModule) => parseRuntime({ runtimeModule }))
				.catch((error: unknown) => {
					runtimePromise = null;
					throw error;
				});
		}
		return runtimePromise;
	};

	ipcMain.handle(
		JIANYING_11_3_PROJECT_EXPORT_CHOOSE_CHANNEL,
		async (
			event: IpcMainInvokeEvent
		): Promise<
			JianyingProjectExportResultDto<Jianying113ProjectExportSelectionDto | null>
		> => {
			try {
				const mainWindow = assertTrustedMainFrame({
					event,
					mainWindow: getMainWindow(),
				});
				const source = await chooseSourceProjectDirectory({ mainWindow });
				if (source === null) return { ok: true, value: null };
				const projectDirectory = await canonicalizeDirectory(source);
				const selectionToken = randomUUID();
				const expiresAtUnixMilliseconds = now() + SELECTION_TTL_MILLISECONDS;
				selections.set(selectionToken, {
					expiresAtUnixMilliseconds,
					projectDirectory,
				});
				return {
					ok: true,
					value: {
						expiresAtUnixMilliseconds,
						projectDirectory,
						selectionToken,
					},
				};
			} catch (error) {
				return { ok: false, error: toErrorDto({ error }) };
			}
		}
	);

	ipcMain.handle(
		JIANYING_11_3_PROJECT_EXPORT_COMMIT_CHANNEL,
		async (
			event: IpcMainInvokeEvent,
			input: unknown
		): Promise<
			JianyingProjectExportResultDto<Jianying113ProjectExportCommitDto>
		> => {
			try {
				assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
				const request = parseCommitRequest({ input });
				const selection = selections.get(request.selectionToken);
				if (selection === undefined) {
					throw new ProjectExportHandlerError({
						code: "selection-not-found",
						message: "Jianying export selection was not found.",
					});
				}
				if (now() > selection.expiresAtUnixMilliseconds) {
					selections.delete(request.selectionToken);
					throw new ProjectExportHandlerError({
						code: "selection-expired",
						message: "Jianying export selection has expired.",
					});
				}
				selections.delete(request.selectionToken);
				const result = await (await getRuntime()).write({
					assertTargetAppClosed: ({ projectDirectory }) =>
						assertTargetAppClosed({
							outputParentDirectory: projectDirectory,
							sourceProjectDirectory: projectDirectory,
						}),
					contentBytes: request.contentBytes,
					expectedSourceSha256: request.expectedSourceSha256,
					profileId: request.profileId,
					projectDirectory: selection.projectDirectory,
				});
				return { ok: true, value: result };
			} catch (error) {
				return { ok: false, error: toErrorDto({ error }) };
			}
		}
	);

	return {
		dispose: () => {
			ipcMain.removeHandler(JIANYING_11_3_PROJECT_EXPORT_CHOOSE_CHANNEL);
			ipcMain.removeHandler(JIANYING_11_3_PROJECT_EXPORT_COMMIT_CHANNEL);
			selections.clear();
			runtimePromise = null;
		},
	};
}
