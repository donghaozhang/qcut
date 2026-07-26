import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

export const PLUGIN_NAME = "qcut";
export const MARKETPLACE_NAME = "qcut";
export const OFFICIAL_MARKETPLACE = "Quriosity-agent/qcut";

const OFFICIAL_REPOSITORY_URLS = new Set([
	"https://github.com/Quriosity-agent/qcut.git",
	"https://github.com/Quriosity-agent/qcut",
	"git@github.com:Quriosity-agent/qcut.git",
]);
const execFileAsync = promisify(execFile);

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
}): Promise<string | undefined> {
	try {
		await execFileAsync(candidate, ["--version"], { timeout: 10_000 });
		return candidate;
	} catch {
		return undefined;
	}
}

async function resolveCodexExecutable(): Promise<string> {
	const configured = process.env.CODEX_CLI_PATH;
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
		process.platform === "win32"
			? join(process.env.LOCALAPPDATA ?? "", "Programs", "Codex", "codex.exe")
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

	try {
		await execFileAsync("codex", ["--version"], { timeout: 10_000 });
		return "codex";
	} catch {
		throw new Error("Codex CLI is not installed or is not available on PATH");
	}
}

export function createDefaultCodexRunner(): RunCodex {
	let executable: string | undefined;
	return async ({ args }) => {
		executable ??= await resolveCodexExecutable();
		const { stdout } = await execFileAsync(executable, args, {
			encoding: "utf8",
			maxBuffer: 4 * 1024 * 1024,
			timeout: 120_000,
		});
		return stdout.trim() ? (JSON.parse(stdout) as unknown) : {};
	};
}
