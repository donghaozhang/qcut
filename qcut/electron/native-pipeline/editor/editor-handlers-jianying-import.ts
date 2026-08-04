/**
 * Offline CLI transport for JianYing import inspect/plan/commit (JYI-012).
 *
 * The bundled runtime owns parsing, plan persistence, bundle validation, and
 * inbox persistence. This handler only maps CLI options onto that lifecycle.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { CLIResult, CLIRunOptions } from "../cli/cli-runner/types.js";

interface ImportSessionLike {
	inspect(options: { input: unknown }): Promise<unknown>;
	plan(options: { input: unknown }): Promise<unknown>;
	commitWithMediaGrants(options: { input: unknown }): Promise<{
		mediaGrants: Array<{ grantToken: string }>;
		[key: string]: unknown;
	}>;
	readMediaPayloadChunk(options: { input: unknown }): Promise<unknown>;
	releaseMediaPayloadGrants(options: { input: unknown }): unknown;
	dispose(): void;
}

interface ImportSessionOptions {
	buildIdentity: { appVersion: string; interopSchemaVersion: number };
}

interface ImportSessionConstructor {
	new (options: ImportSessionOptions): ImportSessionLike;
	open?: (
		options: ImportSessionOptions & { storageDirectory: string }
	) => Promise<ImportSessionLike>;
}

interface ImportRuntimeModule {
	JianyingDraftImportSession: ImportSessionConstructor;
	enqueueDesktopImportFromGrants(options: {
		inboxDirectory: string;
		commit: unknown;
		readChunk: (options: { input: unknown }) => Promise<unknown>;
	}): Promise<unknown>;
}

export type LoadImportRuntime = () => Promise<unknown>;

export function resolveBundledImportRuntimePath({
	moduleDirectory = __dirname,
	fileExists = existsSync,
}: {
	moduleDirectory?: string;
	fileExists?: (path: string) => boolean;
} = {}): string {
	const compiledRuntimePath = join(
		moduleDirectory,
		"..",
		"..",
		"jianying-draft-import-runtime.js"
	);
	if (fileExists(compiledRuntimePath)) {
		return compiledRuntimePath;
	}
	return join(
		moduleDirectory,
		"..",
		"..",
		"..",
		"dist",
		"electron",
		"jianying-draft-import-runtime.js"
	);
}

async function loadBundledImportRuntime(): Promise<unknown> {
	const runtimePath = resolveBundledImportRuntimePath();
	return import(runtimePath);
}

function getRuntime({
	runtimeModule,
}: {
	runtimeModule: unknown;
}): ImportRuntimeModule {
	const moduleRecord = runtimeModule as {
		JianyingDraftImportSession?: unknown;
		enqueueDesktopImportFromGrants?: unknown;
		default?: {
			JianyingDraftImportSession?: unknown;
			enqueueDesktopImportFromGrants?: unknown;
		};
	};
	const sessionConstructor =
		moduleRecord.JianyingDraftImportSession ??
		moduleRecord.default?.JianyingDraftImportSession;
	const enqueueDesktopImportFromGrants =
		moduleRecord.enqueueDesktopImportFromGrants ??
		moduleRecord.default?.enqueueDesktopImportFromGrants;
	if (
		typeof sessionConstructor !== "function" ||
		typeof enqueueDesktopImportFromGrants !== "function"
	) {
		throw new Error(
			"Import runtime does not export the complete Jianying import transport."
		);
	}
	return {
		JianyingDraftImportSession:
			sessionConstructor as ImportRuntimeModule["JianyingDraftImportSession"],
		enqueueDesktopImportFromGrants:
			enqueueDesktopImportFromGrants as ImportRuntimeModule["enqueueDesktopImportFromGrants"],
	};
}

export function resolveQCutCliUserDataDirectory({
	environment = process.env,
	homeDirectory = homedir(),
	moduleDirectory = __dirname,
	platform = process.platform,
}: {
	environment?: NodeJS.ProcessEnv;
	homeDirectory?: string;
	moduleDirectory?: string;
	platform?: NodeJS.Platform;
} = {}): string {
	const override = environment.QCUT_USER_DATA_PATH;
	if (override !== undefined) {
		if (!isAbsolute(override) || override.includes("\0")) {
			throw new Error("QCUT_USER_DATA_PATH must be an absolute path.");
		}
		return override;
	}
	const modulePathSegments = moduleDirectory.split(/[\\/]/u);
	const isCompiledElectronRuntime = modulePathSegments.some(
		(segment, index) =>
			segment === "dist" && modulePathSegments[index + 1] === "electron"
	);
	const productDirectory = isCompiledElectronRuntime
		? "QCut AI Video Editor"
		: "qcut";
	if (platform === "darwin") {
		return join(
			homeDirectory,
			"Library",
			"Application Support",
			productDirectory
		);
	}
	if (platform === "win32") {
		return join(
			environment.APPDATA ?? join(homeDirectory, "AppData", "Roaming"),
			productDirectory
		);
	}
	return join(
		environment.XDG_CONFIG_HOME ?? join(homeDirectory, ".config"),
		productDirectory
	);
}

const SUPPORTED_ACTIONS = new Set(["inspect", "plan", "commit"]);

async function createSession({
	action,
	runtime,
	userDataDirectory,
}: {
	action: string;
	runtime: ImportRuntimeModule;
	userDataDirectory: string;
}): Promise<ImportSessionLike> {
	const buildIdentity = { appVersion: "cli", interopSchemaVersion: 1 };
	const SessionConstructor = runtime.JianyingDraftImportSession;
	if (action === "inspect" || SessionConstructor.open === undefined) {
		return new SessionConstructor({ buildIdentity });
	}
	return SessionConstructor.open({
		buildIdentity,
		storageDirectory: join(userDataDirectory, "jianying-import", "plans-cli"),
	});
}

export async function executeJianyingImportCommand({
	options,
	loadRuntime = loadBundledImportRuntime,
	getUserDataDirectory = resolveQCutCliUserDataDirectory,
}: {
	options: CLIRunOptions;
	loadRuntime?: LoadImportRuntime;
	getUserDataDirectory?: () => string;
}): Promise<CLIResult> {
	const action = options.command.split(":")[2] ?? "";
	if (!SUPPORTED_ACTIONS.has(action)) {
		return {
			success: false,
			error: `Unknown jianying-import action: ${action}`,
		};
	}
	const draftPath = options.draftPaths?.[0];
	if (
		action !== "commit" &&
		(draftPath === undefined || draftPath.length === 0)
	) {
		return { success: false, error: `${action} requires --draft <directory>` };
	}
	if (
		action === "commit" &&
		(options.planToken === undefined || options.planToken.length === 0)
	) {
		return { success: false, error: "commit requires --plan-token <token>" };
	}

	let session: ImportSessionLike | undefined;
	try {
		const runtime = getRuntime({ runtimeModule: await loadRuntime() });
		const userDataDirectory = getUserDataDirectory();
		session = await createSession({ action, runtime, userDataDirectory });
		const activeSession = session;
		if (action === "commit") {
			const commit = await activeSession.commitWithMediaGrants({
				input: {
					planToken: options.planToken,
					acceptedWarningFingerprints:
						options.acceptedWarningFingerprints ?? [],
				},
			});
			const grantTokens = commit.mediaGrants.map(
				({ grantToken }) => grantToken
			);
			try {
				const inboxEntry = await runtime.enqueueDesktopImportFromGrants({
					inboxDirectory: join(userDataDirectory, "jianying-import", "inbox"),
					commit,
					readChunk: (chunkOptions) =>
						activeSession.readMediaPayloadChunk(chunkOptions),
				});
				return {
					success: true,
					data: {
						action,
						queuedForDesktop: true,
						localOnly: true,
						inboxEntry,
					},
				};
			} finally {
				activeSession.releaseMediaPayloadGrants({ input: { grantTokens } });
			}
		}
		const result =
			action === "inspect"
				? await activeSession.inspect({ input: { draftPath } })
				: await activeSession.plan({ input: { draftPath } });
		return {
			success: true,
			data: {
				action,
				readOnly: true,
				localOnly: true,
				result,
			},
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	} finally {
		session?.dispose();
	}
}

export async function handleJianyingImportCommand({
	options,
}: {
	options: CLIRunOptions;
	signal?: AbortSignal;
}): Promise<CLIResult> {
	return executeJianyingImportCommand({ options });
}
