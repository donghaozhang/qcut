import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

export interface CodexPluginRecord {
	pluginId: string;
	name: string;
	marketplaceName: string;
	version?: string;
	installed?: boolean;
	enabled?: boolean;
	marketplaceSource?: {
		sourceType?: string;
		source?: string;
	};
}

export interface CodexPluginList {
	installed?: CodexPluginRecord[];
	available?: CodexPluginRecord[];
}

export type RunCodex = ({ args }: { args: string[] }) => Promise<unknown>;

export interface CodexInvocation {
	executable: string;
	prefixArgs: string[];
}

export class CodexCliUnavailableError extends Error {
	constructor() {
		super("Codex CLI is not installed or is not available on PATH");
		this.name = "CodexCliUnavailableError";
	}
}

export const PLUGIN_NAME = "qcut";
export const MARKETPLACE_NAME = "qcut";
export const OFFICIAL_MARKETPLACE = "Quriosity-agent/qcut";

const OFFICIAL_REPOSITORY_URLS = new Set([
	"https://github.com/Quriosity-agent/qcut.git",
	"https://github.com/Quriosity-agent/qcut",
	"git@github.com:Quriosity-agent/qcut.git",
]);
const execFileAsync = promisify(execFile);

export function createCodexInvocation({
	candidate,
	platform = process.platform,
	commandProcessor = process.env.ComSpec ?? "cmd.exe",
	powerShell = "powershell.exe",
}: {
	candidate: string;
	platform?: NodeJS.Platform;
	commandProcessor?: string;
	powerShell?: string;
}): CodexInvocation {
	const extension = extname(candidate).toLowerCase();
	if (platform === "win32" && (extension === ".cmd" || extension === ".bat")) {
		return {
			executable: commandProcessor,
			prefixArgs: ["/d", "/s", "/c", candidate],
		};
	}
	if (platform === "win32" && extension === ".ps1") {
		return {
			executable: powerShell,
			prefixArgs: [
				"-NoLogo",
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				candidate,
			],
		};
	}
	return { executable: candidate, prefixArgs: [] };
}

export function parseCodexOutput({ stdout }: { stdout: string }): unknown {
	const output = stdout.trim();
	if (!output) return {};
	try {
		return JSON.parse(output) as unknown;
	} catch {
		throw new Error("Codex CLI returned invalid JSON output");
	}
}

export function findInstalledPlugin({
	list,
}: {
	list: CodexPluginList;
}): CodexPluginRecord | undefined {
	return list.installed?.find(({ name }) => name === PLUGIN_NAME);
}

export function findAvailablePlugin({
	list,
}: {
	list: CodexPluginList;
}): CodexPluginRecord | undefined {
	return list.available?.find(({ name }) => name === PLUGIN_NAME);
}

export function isOfficialGitMarketplace({
	record,
}: {
	record: CodexPluginRecord;
}): boolean {
	return (
		record.marketplaceSource?.sourceType === "git" &&
		OFFICIAL_REPOSITORY_URLS.has(record.marketplaceSource.source ?? "")
	);
}

async function validateCodexExecutable({
	candidate,
}: {
	candidate: string;
}): Promise<CodexInvocation | undefined> {
	const invocation = createCodexInvocation({ candidate });
	try {
		await execFileAsync(
			invocation.executable,
			[...invocation.prefixArgs, "--version"],
			{ timeout: 10_000 }
		);
		return invocation;
	} catch {
		return undefined;
	}
}

async function findWindowsPathCandidates(): Promise<string[]> {
	try {
		const { stdout } = await execFileAsync("where.exe", ["codex"], {
			encoding: "utf8",
			timeout: 10_000,
		});
		return stdout
			.split(/\r?\n/)
			.map((candidate) => candidate.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
}

async function resolveCodexInvocation(): Promise<CodexInvocation> {
	const configured = process.env.CODEX_CLI_PATH;
	const appData = process.env.APPDATA;
	const localAppData = process.env.LOCALAPPDATA;
	const absoluteCandidates = [
		configured,
		process.platform === "darwin"
			? "/Applications/ChatGPT.app/Contents/Resources/codex"
			: undefined,
		process.platform === "darwin"
			? "/Applications/Codex.app/Contents/Resources/codex"
			: undefined,
		process.platform === "darwin"
			? join(
					homedir(),
					"Applications",
					"ChatGPT.app",
					"Contents",
					"Resources",
					"codex"
				)
			: undefined,
		"/opt/homebrew/bin/codex",
		"/usr/local/bin/codex",
		join(homedir(), ".local", "bin", "codex"),
		process.platform === "win32" && localAppData
			? join(localAppData, "Programs", "Codex", "codex.exe")
			: undefined,
		process.platform === "win32" && appData
			? join(appData, "npm", "codex.cmd")
			: undefined,
		process.platform === "win32" && appData
			? join(appData, "npm", "codex.ps1")
			: undefined,
	].filter((candidate): candidate is string => Boolean(candidate));

	const existingCandidates = absoluteCandidates.filter((candidate) =>
		existsSync(candidate)
	);
	const validatedCandidates = await Promise.all(
		existingCandidates.map((candidate) =>
			validateCodexExecutable({ candidate })
		)
	);
	const resolvedCandidate = validatedCandidates.find(Boolean);
	if (resolvedCandidate) return resolvedCandidate;

	const pathCandidates =
		process.platform === "win32"
			? await findWindowsPathCandidates()
			: ["codex"];
	const validatedPathCandidates = await Promise.all(
		pathCandidates.map((candidate) => validateCodexExecutable({ candidate }))
	);
	const resolvedPathCandidate = validatedPathCandidates.find(Boolean);
	if (resolvedPathCandidate) return resolvedPathCandidate;
	throw new CodexCliUnavailableError();
}

export function createDefaultCodexRunner(): RunCodex {
	let invocation: CodexInvocation | undefined;
	return async ({ args }) => {
		invocation ??= await resolveCodexInvocation();
		const { stdout } = await execFileAsync(
			invocation.executable,
			[...invocation.prefixArgs, ...args],
			{
				encoding: "utf8",
				maxBuffer: 4 * 1024 * 1024,
				timeout: 120_000,
			}
		);
		return parseCodexOutput({ stdout });
	};
}
