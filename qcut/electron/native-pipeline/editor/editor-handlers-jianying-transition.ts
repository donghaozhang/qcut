import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CLIRunOptions, CLIResult } from "../cli/cli-runner/types.js";

const REFERENCE_SKILL_PATH = path.join(
	"qcut-toolkit",
	"jianying-transition-reference"
);
const REFERENCE_SCRIPT_PATH = path.join(
	REFERENCE_SKILL_PATH,
	"scripts",
	"inspect-transition.ts"
);
const ALLOWED_REFERENCE_EXTENSIONS = new Set([".md", ".ts", ".yaml", ".yml"]);
const MAX_REPORT_BYTES = 32 * 1024 * 1024;
const REFERENCE_TIMEOUT_MS = 120_000;

const ACTIONS = new Set([
	"categories",
	"inventory",
	"inspect",
	"scan-drafts",
	"classify-package",
	"parity-report",
]);

interface ReferenceProcessResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export type RunReferenceProcess = ({
	executable,
	args,
	signal,
}: {
	executable: string;
	args: string[];
	signal?: AbortSignal;
}) => Promise<ReferenceProcessResult>;

function uniquePaths({
	paths,
}: {
	paths: Array<string | undefined>;
}): string[] {
	return [...new Set(paths.filter((entry): entry is string => Boolean(entry)))];
}

function referenceScriptCandidates(): string[] {
	const explicitSkillDirectory =
		process.env.QCUT_JIANYING_TRANSITION_SKILL_DIR?.trim();
	return uniquePaths({
		paths: [
			explicitSkillDirectory
				? path.join(explicitSkillDirectory, "scripts", "inspect-transition.ts")
				: undefined,
			process.resourcesPath
				? path.join(
						process.resourcesPath,
						"default-skills",
						REFERENCE_SCRIPT_PATH
					)
				: undefined,
			path.join(
				process.cwd(),
				"resources",
				"default-skills",
				REFERENCE_SCRIPT_PATH
			),
			path.join(process.cwd(), ".agents", "skills", REFERENCE_SCRIPT_PATH),
			path.resolve(
				__dirname,
				"../../../resources/default-skills",
				REFERENCE_SCRIPT_PATH
			),
			path.resolve(
				__dirname,
				"../../../../resources/default-skills",
				REFERENCE_SCRIPT_PATH
			),
			path.resolve(__dirname, "../../../.agents/skills", REFERENCE_SCRIPT_PATH),
			path.resolve(
				__dirname,
				"../../../../.agents/skills",
				REFERENCE_SCRIPT_PATH
			),
		],
	});
}

export function resolveJianyingTransitionScript({
	candidates = referenceScriptCandidates(),
}: {
	candidates?: string[];
} = {}): string {
	const scriptPath = candidates.find((candidate) => existsSync(candidate));
	if (scriptPath) return path.resolve(scriptPath);
	throw new Error(
		"Bundled jianying-transition-reference skill was not found. Rebuild QCut with `bun run sync-skills`."
	);
}

function collectReferenceFiles({ directory }: { directory: string }): string[] {
	const files: string[] = [];
	const pending = [directory];
	while (pending.length > 0) {
		const current = pending.pop();
		if (!current) continue;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const entryPath = path.join(current, entry.name);
			if (entry.isSymbolicLink()) {
				throw new Error(
					`Reference skill must not contain symlinks: ${entryPath}`
				);
			}
			if (entry.isDirectory()) {
				pending.push(entryPath);
				continue;
			}
			if (entry.isFile()) files.push(entryPath);
		}
	}
	return files.sort();
}

export function assertReferenceSkillIsSourceOnly({
	scriptPath,
}: {
	scriptPath: string;
}): number {
	const skillDirectory = path.dirname(path.dirname(scriptPath));
	const files = collectReferenceFiles({ directory: skillDirectory });
	const unsupportedFile = files.find(
		(filePath) => !ALLOWED_REFERENCE_EXTENSIONS.has(path.extname(filePath))
	);
	if (unsupportedFile) {
		throw new Error(
			`Refusing to run a reference skill containing non-source assets: ${unsupportedFile}`
		);
	}
	return files.length;
}

function bunExecutable(): string {
	const explicitExecutable = process.env.QCUT_BUN_PATH?.trim();
	if (explicitExecutable) return explicitExecutable;
	const versions = process.versions as NodeJS.ProcessVersions & {
		bun?: string;
	};
	if (versions.bun) return process.execPath;
	const binaryName = process.platform === "win32" ? "bun.exe" : "bun";
	const candidates = [
		process.env.BUN_INSTALL
			? path.join(process.env.BUN_INSTALL, "bin", binaryName)
			: undefined,
		path.join(os.homedir(), ".bun", "bin", binaryName),
	];
	return (
		candidates.find((candidate) => candidate && existsSync(candidate)) ?? "bun"
	);
}

function referenceEnvironment(): NodeJS.ProcessEnv {
	const allowedNames = [
		"APPDATA",
		"BUN_INSTALL",
		"ComSpec",
		"FFMPEG_PATH",
		"HOME",
		"HOMEDRIVE",
		"HOMEPATH",
		"LANG",
		"LC_ALL",
		"LOCALAPPDATA",
		"PATH",
		"PATHEXT",
		"Path",
		"SYSTEMROOT",
		"SystemRoot",
		"TEMP",
		"TMP",
		"TMPDIR",
		"USERPROFILE",
	];
	const environment: NodeJS.ProcessEnv = {};
	for (const name of allowedNames) {
		const value = process.env[name];
		if (value) environment[name] = value;
	}
	return environment;
}

function appendStringFlag({
	args,
	flag,
	value,
}: {
	args: string[];
	flag: string;
	value?: string;
}) {
	if (value) args.push(flag, value);
}

function appendRepeatedFlag({
	args,
	flag,
	values,
}: {
	args: string[];
	flag: string;
	values?: string[];
}) {
	for (const value of values ?? []) args.push(flag, value);
}

export function buildJianyingTransitionArgs({
	action,
	options,
	scriptPath,
}: {
	action: string;
	options: CLIRunOptions;
	scriptPath: string;
}): string[] {
	const args = [scriptPath, action];
	appendStringFlag({ args, flag: "--title", value: options.title });
	appendStringFlag({ args, flag: "--cache-root", value: options.cacheRoot });
	appendStringFlag({
		args,
		flag: "--project-root",
		value: options.projectRoot,
	});
	appendRepeatedFlag({
		args,
		flag: "--database",
		values: options.databasePaths,
	});
	appendRepeatedFlag({ args, flag: "--draft", values: options.draftPaths });
	appendStringFlag({ args, flag: "--path", value: options.packagePath });
	appendRepeatedFlag({
		args,
		flag: "--resource-id",
		values: options.resourceIds,
	});
	appendRepeatedFlag({
		args,
		flag: "--draft-effect-id",
		values: options.draftEffectIds,
	});
	appendRepeatedFlag({
		args,
		flag: "--catalog-effect-id",
		values: options.catalogEffectIds,
	});
	appendStringFlag({
		args,
		flag: "--metadata-md5",
		value: options.metadataMd5,
	});
	appendStringFlag({ args, flag: "--manifest", value: options.manifest });
	appendStringFlag({ args, flag: "--formula", value: options.formula });
	appendStringFlag({ args, flag: "--ffmpeg-path", value: options.ffmpegPath });
	return args;
}

function appendChunk({
	chunks,
	chunk,
	totalBytes,
}: {
	chunks: Buffer[];
	chunk: Buffer;
	totalBytes: number;
}): number {
	const nextTotal = totalBytes + chunk.byteLength;
	if (nextTotal > MAX_REPORT_BYTES) {
		throw new Error(
			`Jianying reference report exceeded ${MAX_REPORT_BYTES} bytes`
		);
	}
	chunks.push(chunk);
	return nextTotal;
}

export const runReferenceProcess: RunReferenceProcess = async ({
	executable,
	args,
	signal,
}) =>
	new Promise<ReferenceProcessResult>((resolve, reject) => {
		const child = spawn(executable, args, {
			env: referenceEnvironment(),
			shell: false,
			signal,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let settled = false;
		let timeout: NodeJS.Timeout;
		const fail = (error: Error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			reject(error);
		};
		timeout = setTimeout(() => {
			child.kill();
			fail(
				new Error(
					`Jianying reference command timed out after ${REFERENCE_TIMEOUT_MS}ms`
				)
			);
		}, REFERENCE_TIMEOUT_MS);
		child.stdout.on("data", (chunk: Buffer) => {
			try {
				stdoutBytes = appendChunk({
					chunks: stdout,
					chunk,
					totalBytes: stdoutBytes,
				});
			} catch (error) {
				child.kill();
				fail(error instanceof Error ? error : new Error(String(error)));
			}
		});
		child.stderr.on("data", (chunk: Buffer) => {
			try {
				stderrBytes = appendChunk({
					chunks: stderr,
					chunk,
					totalBytes: stderrBytes,
				});
			} catch (error) {
				child.kill();
				fail(error instanceof Error ? error : new Error(String(error)));
			}
		});
		child.once("error", (error) => fail(error));
		child.once("close", (exitCode) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve({
				exitCode: exitCode ?? 1,
				stdout: Buffer.concat(stdout).toString("utf8"),
				stderr: Buffer.concat(stderr).toString("utf8"),
			});
		});
	});

function blockedOutputFlag({
	options,
}: {
	options: CLIRunOptions;
}): string | null {
	if (options.outputDirExplicit) return "--output-dir";
	if (options.output) return "--output";
	if (options.exportAfterGenerate) return "--export";
	if (options.includeOutput) return "--include-output";
	if (options.saveIntermediates) return "--save-intermediates";
	return null;
}

function parseReport({ stdout }: { stdout: string }): unknown {
	const value = stdout.trim();
	if (!value)
		throw new Error("Jianying reference script returned no JSON report");
	try {
		return JSON.parse(value) as unknown;
	} catch {
		throw new Error("Jianying reference script returned invalid JSON");
	}
}

function referenceData({
	action,
	report,
	sourceFileCount,
}: {
	action: string;
	report: unknown;
	sourceFileCount: number;
}) {
	return {
		action,
		source: "local-jianying-cache",
		readOnly: true,
		localOnly: true,
		binaryAssetsIncluded: false,
		bundledReferenceSourceFiles: sourceFileCount,
		report,
	};
}

export async function executeJianyingTransitionReference({
	options,
	signal,
	scriptPath = resolveJianyingTransitionScript(),
	runProcess = runReferenceProcess,
}: {
	options: CLIRunOptions;
	signal?: AbortSignal;
	scriptPath?: string;
	runProcess?: RunReferenceProcess;
}): Promise<CLIResult> {
	const action = options.command.split(":")[2] ?? "";
	if (!ACTIONS.has(action)) {
		return {
			success: false,
			error: `Unknown Jianying transition action: ${action}`,
		};
	}
	const blockedFlag = blockedOutputFlag({ options });
	if (blockedFlag) {
		return {
			success: false,
			error: `${blockedFlag} is disabled for local Jianying reference commands; reports are stdout-only and proprietary assets are never exported.`,
		};
	}
	if (action === "inspect" && !options.title) {
		return { success: false, error: "inspect requires --title" };
	}
	if (action === "parity-report" && !(options.title || options.manifest)) {
		return {
			success: false,
			error: "parity-report requires --title or --manifest",
		};
	}

	try {
		const sourceFileCount = assertReferenceSkillIsSourceOnly({ scriptPath });
		const result = await runProcess({
			executable: bunExecutable(),
			args: buildJianyingTransitionArgs({ action, options, scriptPath }),
			signal,
		});
		let report: unknown = null;
		if (result.stdout.trim()) {
			try {
				report = parseReport({ stdout: result.stdout });
			} catch (error) {
				if (result.exitCode === 0) throw error;
			}
		} else if (result.exitCode === 0) {
			report = parseReport({ stdout: result.stdout });
		}
		const data = referenceData({ action, report, sourceFileCount });
		if (result.exitCode !== 0) {
			return {
				success: false,
				error:
					result.stderr.trim() ||
					`Jianying reference script exited with code ${result.exitCode}`,
				data,
			};
		}
		return { success: true, data };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const runtimeHint =
			message.includes("ENOENT") && message.includes("bun")
				? " Install Bun or set QCUT_BUN_PATH to a Bun executable."
				: "";
		return { success: false, error: `${message}${runtimeHint}` };
	}
}

export async function handleJianyingTransitionCommand({
	options,
	signal,
}: {
	options: CLIRunOptions;
	signal?: AbortSignal;
}): Promise<CLIResult> {
	return executeJianyingTransitionReference({ options, signal });
}
