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
	type CapCut81TargetAppGuard,
	createCapCut81TargetAppGuard,
} from "./capcut-8-1-install-guard.js";
import {
	CAPCUT_8_1_WRITEBACK_CHOOSE_DIRECTORY_CHANNEL,
	CAPCUT_8_1_WRITEBACK_COMMIT_CHANNEL,
	CAPCUT_8_1_WRITEBACK_RECOVER_CHANNEL,
	type CapCut81WritebackCommitDto,
	type CapCut81WritebackErrorCode,
	type CapCut81WritebackRecoveryDto,
	type CapCut81WritebackResultDto,
	type CapCut81WritebackSelectionDto,
} from "./jianying-same-profile-writeback-contract.js";

const DEFAULT_CAPCUT_APP_PATH = "/Applications/CapCut.app";
const MAX_CONTENT_BYTES = 64 * 1024 * 1024;
const MAX_ERROR_MESSAGE_LENGTH = 16_384;
const SELECTION_TTL_MILLISECONDS = 15 * 60 * 1000;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

interface RuntimeWritebackResult {
	contentSha256: string;
	mirrorRelativePaths: readonly [string, string, string, string];
	replacedMirrorCount: 4;
	timelineId: string;
	transactionId: string;
	warnings: string[];
}

interface RuntimeRecoveryResult {
	action: "none" | "rolled-back" | "committed-cleanup";
	transactionId?: string;
	warnings: string[];
}

interface SameProfileRuntime {
	write(options: {
		contentBytes: Uint8Array;
		draftDirectory: string;
		expectedSourceSha256: string;
		profileId: string;
	}): Promise<RuntimeWritebackResult>;
	recover(options: { draftDirectory: string }): Promise<RuntimeRecoveryResult>;
}

interface WritebackSelection {
	draftDirectory: string;
	expiresAtUnixMilliseconds: number;
}

export interface JianyingSameProfileWritebackIPCController {
	dispose(): void;
}

export interface SetupJianyingSameProfileWritebackIPCOptions {
	assertTargetAppClosed?: CapCut81TargetAppGuard;
	canonicalizeDraftDirectory?: (directory: string) => Promise<string>;
	chooseDraftDirectory?: (options: {
		mainWindow: BrowserWindow;
	}) => Promise<string | null>;
	getCapCutAppPath?: () => string;
	getMainWindow: () => BrowserWindow | null;
	loadRuntime?: () => Promise<unknown>;
	now?: () => number;
}

class WritebackHandlerError extends Error {
	readonly code: CapCut81WritebackErrorCode;

	constructor({
		code,
		message,
	}: {
		code: CapCut81WritebackErrorCode;
		message: string;
	}) {
		super(message);
		this.name = "WritebackHandlerError";
		this.code = code;
	}
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
		throw new WritebackHandlerError({
			code: "untrusted-sender",
			message: "Writeback channel caller is not the trusted main frame.",
		});
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

function requireSelectionToken({ input }: { input: unknown }): string {
	if (
		!isRecord(input) ||
		!hasExactKeys({ record: input, keys: ["selectionToken"] }) ||
		typeof input.selectionToken !== "string" ||
		input.selectionToken.length === 0 ||
		input.selectionToken.length > 128
	) {
		throw new WritebackHandlerError({
			code: "invalid-request",
			message: "A valid selectionToken is required.",
		});
	}
	return input.selectionToken;
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
		throw new WritebackHandlerError({
			code: "invalid-request",
			message: "contentBase64 must be canonical base64 within 64 MiB.",
		});
	}
	const bytes = Buffer.from(value, "base64");
	if (
		bytes.byteLength === 0 ||
		bytes.byteLength > MAX_CONTENT_BYTES ||
		bytes.toString("base64") !== value
	) {
		throw new WritebackHandlerError({
			code: "invalid-request",
			message: "contentBase64 is not a canonical payload within 64 MiB.",
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
	if (
		!isRecord(input) ||
		!hasExactKeys({
			record: input,
			keys: [
				"contentBase64",
				"expectedSourceSha256",
				"profileId",
				"selectionToken",
			],
		}) ||
		typeof input.contentBase64 !== "string" ||
		typeof input.expectedSourceSha256 !== "string" ||
		!SHA256_PATTERN.test(input.expectedSourceSha256) ||
		typeof input.profileId !== "string" ||
		input.profileId.length === 0 ||
		typeof input.selectionToken !== "string" ||
		input.selectionToken.length === 0 ||
		input.selectionToken.length > 128
	) {
		throw new WritebackHandlerError({
			code: "invalid-request",
			message: "Writeback request fields are invalid.",
		});
	}
	return {
		contentBytes: decodeCanonicalBase64({ value: input.contentBase64 }),
		expectedSourceSha256: input.expectedSourceSha256,
		profileId: input.profileId,
		selectionToken: input.selectionToken,
	};
}

const RUNTIME_ERROR_CODES: Record<string, CapCut81WritebackErrorCode> = {
	PROFILE_MISMATCH: "profile-mismatch",
	CONTENT_INVALID: "content-invalid",
	DRAFT_DIRECTORY_INVALID: "draft-directory-invalid",
	CAPCUT_PROJECT_LOCKED: "capcut-project-locked",
	WRITEBACK_ALREADY_RUNNING: "writeback-already-running",
	RECOVERY_REQUIRED: "recovery-required",
	SOURCE_FILE_UNSAFE: "source-file-unsafe",
	SOURCE_STATE_CHANGED: "source-state-changed",
	MIRROR_CONTENT_MISMATCH: "mirror-content-mismatch",
	TRANSACTION_FAILED: "transaction-failed",
};

function toErrorDto({ error }: { error: unknown }): {
	code: CapCut81WritebackErrorCode;
	message: string;
	name: string;
} {
	if (error instanceof WritebackHandlerError) {
		return {
			code: error.code,
			message: error.message,
			name: error.name,
		};
	}
	const name = error instanceof Error ? error.name : "Error";
	const message = (
		error instanceof Error ? error.message : String(error)
	).slice(0, MAX_ERROR_MESSAGE_LENGTH);
	const runtimeCode =
		isRecord(error) && typeof error.code === "string"
			? RUNTIME_ERROR_CODES[error.code]
			: undefined;
	return {
		code:
			runtimeCode ??
			(name === "CapCutAppRunningError" ? "app-running" : "writeback-failed"),
		message,
		name: name.slice(0, 256),
	};
}

async function loadBundledRuntime(): Promise<unknown> {
	return import(join(__dirname, "jianying-draft-export-runtime.js"));
}

function getRuntimeFunction({
	name,
	runtimeModule,
}: {
	name: string;
	runtimeModule: unknown;
}): unknown {
	if (!isRecord(runtimeModule)) return undefined;
	const defaultExport = isRecord(runtimeModule.default)
		? runtimeModule.default
		: undefined;
	return runtimeModule[name] ?? defaultExport?.[name];
}

function parseRuntime({
	runtimeModule,
}: {
	runtimeModule: unknown;
}): SameProfileRuntime {
	const write = getRuntimeFunction({
		name: "writeCapCut81SameProfileContent",
		runtimeModule,
	});
	const recover = getRuntimeFunction({
		name: "recoverCapCut81SameProfileWriteback",
		runtimeModule,
	});
	if (typeof write !== "function" || typeof recover !== "function") {
		throw new WritebackHandlerError({
			code: "runtime-unavailable",
			message: "Bundled runtime is missing same-profile writeback exports.",
		});
	}
	return {
		write: write as SameProfileRuntime["write"],
		recover: recover as SameProfileRuntime["recover"],
	};
}

export function setupJianyingSameProfileWritebackIPC({
	assertTargetAppClosed = createCapCut81TargetAppGuard(),
	canonicalizeDraftDirectory = realpath,
	chooseDraftDirectory = async ({ mainWindow }) => {
		const result = await dialog.showOpenDialog(mainWindow, {
			title: "Choose the original CapCut 8.1 draft folder",
			properties: ["openDirectory"],
		});
		return result.canceled ? null : (result.filePaths[0] ?? null);
	},
	getCapCutAppPath = () => DEFAULT_CAPCUT_APP_PATH,
	getMainWindow,
	loadRuntime = loadBundledRuntime,
	now = Date.now,
}: SetupJianyingSameProfileWritebackIPCOptions): JianyingSameProfileWritebackIPCController {
	const selections = new Map<string, WritebackSelection>();
	let runtimePromise: Promise<SameProfileRuntime> | null = null;

	function getRuntime(): Promise<SameProfileRuntime> {
		if (runtimePromise === null) {
			runtimePromise = loadRuntime()
				.then((runtimeModule) => parseRuntime({ runtimeModule }))
				.catch((error: unknown) => {
					runtimePromise = null;
					if (error instanceof WritebackHandlerError) throw error;
					throw new WritebackHandlerError({
						code: "runtime-unavailable",
						message: `Bundled writeback runtime is unavailable: ${
							error instanceof Error ? error.message : String(error)
						}`,
					});
				});
		}
		return runtimePromise;
	}

	function getSelection({ selectionToken }: { selectionToken: string }) {
		const selection = selections.get(selectionToken);
		if (selection === undefined) {
			throw new WritebackHandlerError({
				code: "selection-not-found",
				message: "Draft directory selection was not found.",
			});
		}
		if (now() > selection.expiresAtUnixMilliseconds) {
			selections.delete(selectionToken);
			throw new WritebackHandlerError({
				code: "selection-expired",
				message: "Draft directory selection has expired.",
			});
		}
		return selection;
	}

	async function guardTarget({ draftDirectory }: { draftDirectory: string }) {
		await assertTargetAppClosed({
			capCutAppPath: getCapCutAppPath(),
			targetDraftStoreDirectory: draftDirectory,
		});
	}

	ipcMain.handle(
		CAPCUT_8_1_WRITEBACK_CHOOSE_DIRECTORY_CHANNEL,
		async (
			event: IpcMainInvokeEvent
		): Promise<
			CapCut81WritebackResultDto<CapCut81WritebackSelectionDto | null>
		> => {
			try {
				const mainWindow = getMainWindow();
				assertTrustedMainFrame({ event, mainWindow });
				if (mainWindow === null) {
					throw new WritebackHandlerError({
						code: "untrusted-sender",
						message: "The main window is unavailable.",
					});
				}
				const selected = await chooseDraftDirectory({ mainWindow });
				if (selected === null) return { ok: true, value: null };
				const draftDirectory = await canonicalizeDraftDirectory(selected);
				const selectionToken = randomUUID();
				const expiresAtUnixMilliseconds = now() + SELECTION_TTL_MILLISECONDS;
				selections.set(selectionToken, {
					draftDirectory,
					expiresAtUnixMilliseconds,
				});
				return {
					ok: true,
					value: {
						draftDirectory,
						expiresAtUnixMilliseconds,
						selectionToken,
					},
				};
			} catch (error) {
				return { ok: false, error: toErrorDto({ error }) };
			}
		}
	);

	ipcMain.handle(
		CAPCUT_8_1_WRITEBACK_COMMIT_CHANNEL,
		async (
			event: IpcMainInvokeEvent,
			input: unknown
		): Promise<CapCut81WritebackResultDto<CapCut81WritebackCommitDto>> => {
			try {
				assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
				const request = parseCommitRequest({ input });
				const selection = getSelection({
					selectionToken: request.selectionToken,
				});
				await guardTarget({ draftDirectory: selection.draftDirectory });
				const result = await (await getRuntime()).write({
					contentBytes: request.contentBytes,
					draftDirectory: selection.draftDirectory,
					expectedSourceSha256: request.expectedSourceSha256,
					profileId: request.profileId,
				});
				return {
					ok: true,
					value: {
						contentSha256: result.contentSha256,
						mirrorRelativePaths: [...result.mirrorRelativePaths],
						replacedMirrorCount: result.replacedMirrorCount,
						timelineId: result.timelineId,
						transactionId: result.transactionId,
						warnings: [...result.warnings],
					},
				};
			} catch (error) {
				return { ok: false, error: toErrorDto({ error }) };
			}
		}
	);

	ipcMain.handle(
		CAPCUT_8_1_WRITEBACK_RECOVER_CHANNEL,
		async (
			event: IpcMainInvokeEvent,
			input: unknown
		): Promise<CapCut81WritebackResultDto<CapCut81WritebackRecoveryDto>> => {
			try {
				assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
				const selection = getSelection({
					selectionToken: requireSelectionToken({ input }),
				});
				await guardTarget({ draftDirectory: selection.draftDirectory });
				const result = await (await getRuntime()).recover({
					draftDirectory: selection.draftDirectory,
				});
				return {
					ok: true,
					value: {
						action: result.action,
						...(result.transactionId === undefined
							? {}
							: { transactionId: result.transactionId }),
						warnings: [...result.warnings],
					},
				};
			} catch (error) {
				return { ok: false, error: toErrorDto({ error }) };
			}
		}
	);

	return {
		dispose: () => {
			ipcMain.removeHandler(CAPCUT_8_1_WRITEBACK_CHOOSE_DIRECTORY_CHANNEL);
			ipcMain.removeHandler(CAPCUT_8_1_WRITEBACK_COMMIT_CHANNEL);
			ipcMain.removeHandler(CAPCUT_8_1_WRITEBACK_RECOVER_CHANNEL);
			selections.clear();
			runtimePromise = null;
		},
	};
}
