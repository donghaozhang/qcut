/**
 * JianYing draft import IPC handler (JYI-012).
 *
 * Thin, trusted transport over the bundled import runtime
 * (@qcut/jianying-draft-import). All lifecycle logic lives in the runtime's
 * JianyingDraftImportSession; this handler only asserts the trusted main
 * frame, maps typed errors to stable codes, and never throws across IPC.
 */

import { join } from "node:path";
import {
	app,
	type BrowserWindow,
	dialog,
	type IpcMainInvokeEvent,
	ipcMain,
} from "electron";
import { discoverJianyingEffectLibrary } from "./jianying-effect/catalog.js";
import {
	JIANYING_IMPORT_CHOOSE_DIRECTORY_CHANNEL,
	JIANYING_IMPORT_COMMIT_CHANNEL,
	JIANYING_IMPORT_INBOX_ACK_CHANNEL,
	JIANYING_IMPORT_INBOX_LIST_CHANNEL,
	JIANYING_IMPORT_INBOX_READ_CHANNEL,
	JIANYING_IMPORT_INSPECT_CHANNEL,
	JIANYING_IMPORT_MEDIA_CHUNK_CHANNEL,
	JIANYING_IMPORT_MEDIA_RELEASE_CHANNEL,
	JIANYING_IMPORT_PLAN_CHANNEL,
	type JianyingDraftImportErrorCode,
	type JianyingDraftImportResultDto,
} from "./jianying-draft-import-contract.js";

interface ImportSessionLike {
	inspect(options: { input: unknown }): Promise<unknown>;
	plan(options: { input: unknown }): Promise<unknown>;
	commitWithMediaGrants(options: { input: unknown }): Promise<unknown>;
	readMediaPayloadChunk(options: { input: unknown }): Promise<unknown>;
	releaseMediaPayloadGrants(options: { input: unknown }): unknown;
	readPendingDesktopImport(options: {
		entryId: string;
		inboxDirectory: string;
	}): Promise<unknown>;
	dispose(): void;
}

interface LocalJianyingEffectCapability {
	presetId: string;
	name: string;
	packageHash: string;
	adjustParameters: {
		key: string;
		defaultValue: number;
		minimum: number;
		maximum: number;
	}[];
}

interface ImportSessionOptions {
	buildIdentity: { appVersion: string; interopSchemaVersion: number };
	/** Locally installed jianying-local effect packages, for L7 admission. */
	loadLocalJianyingEffects?: () => Promise<
		ReadonlyMap<string, LocalJianyingEffectCapability>
	>;
}

interface PersistentImportSessionOptions extends ImportSessionOptions {
	storageDirectory: string;
}

interface ImportSessionConstructor {
	new (options: ImportSessionOptions): ImportSessionLike;
	open?: (
		options: PersistentImportSessionOptions
	) => Promise<ImportSessionLike>;
}

interface ImportRuntimeModule {
	JianyingDraftImportSession: ImportSessionConstructor;
	listDesktopImports(options: { inboxDirectory: string }): Promise<unknown>;
	deleteDesktopImport(options: {
		inboxDirectory: string;
		entryId: string;
	}): Promise<void>;
}

export interface JianyingDraftImportIPCController {
	dispose: () => void;
}

export interface SetupJianyingDraftImportIPCOptions {
	getMainWindow: () => BrowserWindow | null;
	loadRuntime?: () => Promise<unknown>;
	getAppVersion?: () => string;
	getUserDataDirectory?: () => string;
	loadLocalJianyingEffects?: () => Promise<
		ReadonlyMap<string, LocalJianyingEffectCapability>
	>;
	chooseDraftDirectory?: (options: {
		mainWindow: BrowserWindow;
	}) => Promise<string | null>;
}

class UntrustedJianyingImportSenderError extends Error {
	constructor() {
		super("Import channel caller is not the trusted main frame.");
		this.name = "UntrustedJianyingImportSenderError";
	}
}

class InvalidJianyingImportRequestError extends Error {
	constructor() {
		super("Inbox request requires only entryId.");
		this.name = "InvalidJianyingImportRequestError";
	}
}

const ERROR_CODE_BY_NAME: Record<string, JianyingDraftImportErrorCode> = {
	UntrustedJianyingImportSenderError: "untrusted-sender",
	InvalidJianyingImportRequestError: "invalid-request",
	ImportPlanNotFoundError: "plan-not-found",
	ImportPlanExpiredError: "plan-expired",
	ImportPlanConsumedError: "plan-consumed",
	ImportPlanBuildMismatchError: "plan-build-mismatch",
	ImportPlanStoreFullError: "plan-store-full",
	PersistentImportPlanStoreCorruptError: "plan-store-corrupt",
	PersistentImportPlanStoreUnavailableError: "plan-store-unavailable",
	DesktopImportInboxMalformedError: "inbox-malformed",
	DesktopImportInboxUnavailableError: "inbox-unavailable",
};

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
		throw new UntrustedJianyingImportSenderError();
	}
}

function toErrorDto({ error }: { error: unknown }): {
	code: JianyingDraftImportErrorCode;
	name: string;
	message: string;
} {
	const name = error instanceof Error ? error.name : "Error";
	const message = error instanceof Error ? error.message : String(error);
	const runtimeErrorCode =
		error instanceof Error
			? (error as Error & { code?: unknown }).code
			: undefined;
	// Runtime transport errors carry their own stable codes.
	const sessionCode =
		(name === "ImportSessionError" || name === "MediaPayloadGrantError") &&
		typeof runtimeErrorCode === "string"
			? (runtimeErrorCode as JianyingDraftImportErrorCode)
			: undefined;
	return {
		code: sessionCode ?? ERROR_CODE_BY_NAME[name] ?? "import-failed",
		name: name.slice(0, 256),
		message: message.slice(0, 16_384),
	};
}

/**
 * L7 admission source: only packages that are installed on this machine AND
 * render-verified (`supported`) can back an effect-segment downgrade. The
 * map carries catalog metadata only — no Jianying assets.
 */
async function loadInstalledJianyingEffectCapabilities(): Promise<
	ReadonlyMap<string, LocalJianyingEffectCapability>
> {
	const library = await discoverJianyingEffectLibrary();
	const capabilities = new Map<string, LocalJianyingEffectCapability>();
	for (const definition of library.effects) {
		if (!definition.installed || !definition.supported) continue;
		capabilities.set(definition.resourceId, {
			presetId: definition.id,
			name: definition.name,
			packageHash: definition.packageHash,
			adjustParameters: definition.adjustParameters.map((parameter) => ({
				key: parameter.key,
				defaultValue: parameter.defaultValue,
				minimum: parameter.minimum,
				maximum: parameter.maximum,
			})),
		});
	}
	return capabilities;
}

async function loadBundledImportRuntime(): Promise<unknown> {
	const runtimePath = join(__dirname, "jianying-draft-import-runtime.js");
	return import(runtimePath);
}

function getRuntime({
	runtimeModule,
}: {
	runtimeModule: unknown;
}): ImportRuntimeModule {
	const moduleRecord = runtimeModule as {
		JianyingDraftImportSession?: unknown;
		listDesktopImports?: unknown;
		deleteDesktopImport?: unknown;
		default?: {
			JianyingDraftImportSession?: unknown;
			listDesktopImports?: unknown;
			deleteDesktopImport?: unknown;
		};
	};
	const sessionConstructor =
		moduleRecord.JianyingDraftImportSession ??
		moduleRecord.default?.JianyingDraftImportSession;
	const listDesktopImports =
		moduleRecord.listDesktopImports ?? moduleRecord.default?.listDesktopImports;
	const deleteDesktopImport =
		moduleRecord.deleteDesktopImport ??
		moduleRecord.default?.deleteDesktopImport;
	if (
		typeof sessionConstructor !== "function" ||
		typeof listDesktopImports !== "function" ||
		typeof deleteDesktopImport !== "function"
	) {
		throw new Error(
			"Import runtime does not export the complete Jianying import transport."
		);
	}
	return {
		JianyingDraftImportSession:
			sessionConstructor as ImportRuntimeModule["JianyingDraftImportSession"],
		listDesktopImports:
			listDesktopImports as ImportRuntimeModule["listDesktopImports"],
		deleteDesktopImport:
			deleteDesktopImport as ImportRuntimeModule["deleteDesktopImport"],
	};
}

export function setupJianyingDraftImportIPC({
	getMainWindow,
	loadRuntime = loadBundledImportRuntime,
	getAppVersion = () => app.getVersion(),
	getUserDataDirectory = () => app.getPath("userData"),
	loadLocalJianyingEffects = loadInstalledJianyingEffectCapabilities,
	chooseDraftDirectory = async ({ mainWindow }) => {
		const result = await dialog.showOpenDialog(mainWindow, {
			title: "Choose a JianYing or CapCut draft folder",
			properties: ["openDirectory"],
		});
		return result.canceled ? null : (result.filePaths[0] ?? null);
	},
}: SetupJianyingDraftImportIPCOptions): JianyingDraftImportIPCController {
	let runtimePromise: Promise<ImportRuntimeModule> | null = null;
	let sessionPromise: Promise<ImportSessionLike> | null = null;
	const inboxDirectory = join(
		getUserDataDirectory(),
		"jianying-import",
		"inbox"
	);

	async function getLoadedRuntime(): Promise<ImportRuntimeModule> {
		if (runtimePromise === null) {
			runtimePromise = loadRuntime().then((runtimeModule) =>
				getRuntime({ runtimeModule })
			);
		}
		return runtimePromise;
	}

	async function getSession(): Promise<ImportSessionLike> {
		if (sessionPromise === null) {
			sessionPromise = (async () => {
				const runtime = await getLoadedRuntime();
				const SessionConstructor = runtime.JianyingDraftImportSession;
				const options: PersistentImportSessionOptions = {
					buildIdentity: {
						appVersion: getAppVersion(),
						interopSchemaVersion: 1,
					},
					loadLocalJianyingEffects,
					storageDirectory: join(
						getUserDataDirectory(),
						"jianying-import",
						"plans"
					),
				};
				if (SessionConstructor.open !== undefined) {
					return SessionConstructor.open(options);
				}
				return new SessionConstructor(options);
			})();
		}
		return sessionPromise;
	}

	function getEntryId({ input }: { input: unknown }): string {
		if (
			typeof input !== "object" ||
			input === null ||
			Array.isArray(input) ||
			Object.keys(input).length !== 1 ||
			typeof (input as { entryId?: unknown }).entryId !== "string"
		) {
			throw new InvalidJianyingImportRequestError();
		}
		return (input as { entryId: string }).entryId;
	}

	function registerInbox({
		channel,
		invoke,
	}: {
		channel: string;
		invoke: (options: {
			runtime: ImportRuntimeModule;
			input: unknown;
		}) => Promise<unknown>;
	}): void {
		ipcMain.handle(
			channel,
			async (
				event: IpcMainInvokeEvent,
				input: unknown
			): Promise<JianyingDraftImportResultDto<unknown>> => {
				try {
					assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
					const runtime = await getLoadedRuntime();
					return { ok: true, value: await invoke({ runtime, input }) };
				} catch (error) {
					return { ok: false, error: toErrorDto({ error }) };
				}
			}
		);
	}

	function register({
		channel,
		invoke,
	}: {
		channel: string;
		invoke: (options: {
			session: ImportSessionLike;
			input: unknown;
		}) => Promise<unknown> | unknown;
	}): void {
		ipcMain.handle(
			channel,
			async (
				event: IpcMainInvokeEvent,
				input: unknown
			): Promise<JianyingDraftImportResultDto<unknown>> => {
				try {
					assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
					const session = await getSession();
					return { ok: true, value: await invoke({ session, input }) };
				} catch (error) {
					return { ok: false, error: toErrorDto({ error }) };
				}
			}
		);
	}

	ipcMain.handle(
		JIANYING_IMPORT_CHOOSE_DIRECTORY_CHANNEL,
		async (
			event: IpcMainInvokeEvent
		): Promise<JianyingDraftImportResultDto<string | null>> => {
			try {
				const mainWindow = getMainWindow();
				assertTrustedMainFrame({ event, mainWindow });
				if (mainWindow === null) throw new UntrustedJianyingImportSenderError();
				return {
					ok: true,
					value: await chooseDraftDirectory({ mainWindow }),
				};
			} catch (error) {
				return { ok: false, error: toErrorDto({ error }) };
			}
		}
	);

	register({
		channel: JIANYING_IMPORT_INSPECT_CHANNEL,
		invoke: ({ session, input }) => session.inspect({ input }),
	});
	registerInbox({
		channel: JIANYING_IMPORT_INBOX_LIST_CHANNEL,
		invoke: ({ runtime }) => runtime.listDesktopImports({ inboxDirectory }),
	});
	register({
		channel: JIANYING_IMPORT_INBOX_READ_CHANNEL,
		invoke: ({ session, input }) =>
			session.readPendingDesktopImport({
				inboxDirectory,
				entryId: getEntryId({ input }),
			}),
	});
	registerInbox({
		channel: JIANYING_IMPORT_INBOX_ACK_CHANNEL,
		invoke: async ({ runtime, input }) => {
			const entryId = getEntryId({ input });
			await runtime.deleteDesktopImport({ inboxDirectory, entryId });
			return { entryId };
		},
	});
	register({
		channel: JIANYING_IMPORT_PLAN_CHANNEL,
		invoke: ({ session, input }) => session.plan({ input }),
	});
	register({
		channel: JIANYING_IMPORT_COMMIT_CHANNEL,
		invoke: ({ session, input }) => session.commitWithMediaGrants({ input }),
	});
	register({
		channel: JIANYING_IMPORT_MEDIA_CHUNK_CHANNEL,
		invoke: ({ session, input }) => session.readMediaPayloadChunk({ input }),
	});
	register({
		channel: JIANYING_IMPORT_MEDIA_RELEASE_CHANNEL,
		invoke: ({ session, input }) =>
			session.releaseMediaPayloadGrants({ input }),
	});

	return {
		dispose: () => {
			for (const channel of [
				JIANYING_IMPORT_CHOOSE_DIRECTORY_CHANNEL,
				JIANYING_IMPORT_INSPECT_CHANNEL,
				JIANYING_IMPORT_PLAN_CHANNEL,
				JIANYING_IMPORT_INBOX_LIST_CHANNEL,
				JIANYING_IMPORT_INBOX_READ_CHANNEL,
				JIANYING_IMPORT_INBOX_ACK_CHANNEL,
				JIANYING_IMPORT_COMMIT_CHANNEL,
				JIANYING_IMPORT_MEDIA_CHUNK_CHANNEL,
				JIANYING_IMPORT_MEDIA_RELEASE_CHANNEL,
			]) {
				ipcMain.removeHandler(channel);
			}
			sessionPromise
				?.then((session) => session.dispose())
				.catch(() => undefined);
			sessionPromise = null;
			runtimePromise = null;
		},
	};
}
