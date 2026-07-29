import { spawn } from "node:child_process";
import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	statSync,
} from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { finished } from "node:stream/promises";
import type { CommandResult, ToolCommand, Toolchain } from "./types";

function hasPipelineScript({ directory }: { directory: string }): boolean {
	const packagePath = join(directory, "package.json");
	if (!existsSync(packagePath)) return false;
	try {
		const packageData = JSON.parse(readFileSync(packagePath, "utf8")) as {
			scripts?: Record<string, unknown>;
		};
		const pipeline = packageData.scripts?.pipeline;
		return typeof pipeline === "string" && pipeline.trim().length > 0;
	} catch {
		return false;
	}
}

function findPipelineRepository({
	start,
}: {
	start: string;
}): string | undefined {
	let current = resolve(start);
	const root = parse(current).root;
	while (true) {
		if (hasPipelineScript({ directory: current })) return current;
		if (current === root) return;
		current = dirname(current);
	}
}

function resolvePipelineRepository({
	scriptDirectory,
	env,
}: {
	scriptDirectory: string;
	env: NodeJS.ProcessEnv;
}): string | undefined {
	const override = env.QCUT_VLOG_REPO;
	if (!override) return findPipelineRepository({ start: scriptDirectory });

	const repositoryRoot = resolve(override);
	if (!hasPipelineScript({ directory: repositoryRoot })) {
		throw new Error(
			`QCUT_VLOG_REPO must point to a repository with a pipeline script: ${repositoryRoot}`
		);
	}
	return repositoryRoot;
}

function resolveOverride({
	value,
	name,
}: {
	value?: string;
	name: string;
}): string | undefined {
	if (!value) return;
	const pathLike = value.includes("/") || value.includes("\\");
	if (pathLike && !existsSync(value)) {
		throw new Error(`${name} does not exist: ${value}`);
	}
	return pathLike ? resolve(value) : (Bun.which(value) ?? value);
}

function stagedMediaBinary({
	repositoryRoot,
	name,
}: {
	repositoryRoot?: string;
	name: "ffmpeg" | "ffprobe";
}): string | undefined {
	if (!repositoryRoot) return;
	const executable = process.platform === "win32" ? `${name}.exe` : name;
	const candidate = join(
		repositoryRoot,
		"electron",
		"resources",
		"ffmpeg",
		`${process.platform}-${process.arch}`,
		executable
	);
	return existsSync(candidate) ? candidate : undefined;
}

function requireExecutable({
	name,
	candidates,
}: {
	name: string;
	candidates: Array<string | undefined>;
}): string {
	for (const candidate of candidates) {
		if (candidate) return candidate;
	}
	throw new Error(
		`${name} was not found. Install QCut/FFmpeg or set its QCUT_VLOG_*_BIN override.`
	);
}

export function resolveToolchain({
	scriptDirectory,
	env = process.env,
}: {
	scriptDirectory: string;
	env?: NodeJS.ProcessEnv;
}): Toolchain {
	const repositoryRoot = resolvePipelineRepository({
		scriptDirectory,
		env,
	});
	const qcutOverride = resolveOverride({
		value: env.QCUT_VLOG_QCUT_BIN,
		name: "QCUT_VLOG_QCUT_BIN",
	});
	let qcut: ToolCommand;
	if (qcutOverride) {
		qcut = { executable: qcutOverride, prefixArgs: [] };
	} else if (repositoryRoot) {
		qcut = {
			executable: requireExecutable({
				name: "Bun",
				candidates: [Bun.which("bun"), process.execPath],
			}),
			prefixArgs: ["run", "pipeline"],
			cwd: repositoryRoot,
		};
	} else {
		qcut = {
			executable: requireExecutable({
				name: "QCut CLI",
				candidates: [Bun.which("qcut"), Bun.which("qcut-pipeline")],
			}),
			prefixArgs: [],
		};
	}

	const ffmpeg = requireExecutable({
		name: "FFmpeg",
		candidates: [
			resolveOverride({
				value: env.QCUT_VLOG_FFMPEG_BIN,
				name: "QCUT_VLOG_FFMPEG_BIN",
			}),
			stagedMediaBinary({ repositoryRoot, name: "ffmpeg" }),
			Bun.which("ffmpeg"),
		],
	});
	const ffprobe = requireExecutable({
		name: "FFprobe",
		candidates: [
			resolveOverride({
				value: env.QCUT_VLOG_FFPROBE_BIN,
				name: "QCUT_VLOG_FFPROBE_BIN",
			}),
			stagedMediaBinary({ repositoryRoot, name: "ffprobe" }),
			Bun.which("ffprobe"),
		],
	});

	return {
		qcut,
		ffmpeg: { executable: ffmpeg, prefixArgs: [] },
		ffprobe: { executable: ffprobe, prefixArgs: [] },
	};
}

function quoteArgument({ value }: { value: string }): string {
	if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function renderCommand({ command }: { command: string[] }): string {
	return command.map((value) => quoteArgument({ value })).join(" ");
}

export async function runCommand({
	tool,
	args,
	logPath,
	echoOutput = true,
	env = process.env,
}: {
	tool: ToolCommand;
	args: string[];
	logPath: string;
	echoOutput?: boolean;
	env?: NodeJS.ProcessEnv;
}): Promise<CommandResult> {
	mkdirSync(dirname(logPath), { recursive: true });
	const command = [tool.executable, ...tool.prefixArgs, ...args];
	const logStream = createWriteStream(logPath, { flags: "w" });
	logStream.write(`$ ${renderCommand({ command })}\n`);
	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];
	const startedAt = new Date().toISOString();
	const child = spawn(tool.executable, [...tool.prefixArgs, ...args], {
		cwd: tool.cwd,
		env,
		stdio: ["ignore", "pipe", "pipe"],
	});

	child.stdout.on("data", (chunk: Buffer) => {
		stdoutChunks.push(chunk);
		logStream.write(chunk);
		if (echoOutput) process.stdout.write(chunk);
	});
	child.stderr.on("data", (chunk: Buffer) => {
		stderrChunks.push(chunk);
		logStream.write(chunk);
		if (echoOutput) process.stderr.write(chunk);
	});

	const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
		child.once("error", rejectExit);
		child.once("close", (code) => resolveExit(code ?? 1));
	});
	logStream.end();
	await finished(logStream);
	const finishedAt = new Date().toISOString();
	const stdout = Buffer.concat(stdoutChunks).toString("utf8");
	const stderr = Buffer.concat(stderrChunks).toString("utf8");
	const result: CommandResult = {
		exitCode,
		stdout,
		stderr,
		startedAt,
		finishedAt,
		logPath,
		command,
	};
	if (exitCode !== 0) {
		const detail = stderr.trim().split("\n").slice(-3).join(" | ");
		throw new Error(
			`Command failed (${exitCode}): ${renderCommand({ command })}${detail ? `: ${detail}` : ""}`
		);
	}
	return result;
}

export async function probeDuration({
	tool,
	filePath,
	logPath,
	echoOutput = false,
	env = process.env,
}: {
	tool: ToolCommand;
	filePath: string;
	logPath: string;
	echoOutput?: boolean;
	env?: NodeJS.ProcessEnv;
}): Promise<number> {
	const result = await runCommand({
		tool,
		args: [
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"json",
			filePath,
		],
		logPath,
		echoOutput,
		env,
	});
	const parsed = JSON.parse(result.stdout) as {
		format?: { duration?: string };
	};
	const duration = Number(parsed.format?.duration);
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error(`Could not determine duration: ${filePath}`);
	}
	return duration;
}

export function isArtifactFresh({
	artifact,
	dependencies,
}: {
	artifact: string;
	dependencies: string[];
}): boolean {
	if (!existsSync(artifact)) return false;
	const artifactTime = statSync(artifact).mtimeMs;
	for (const dependency of dependencies) {
		if (
			!existsSync(dependency) ||
			statSync(dependency).mtimeMs >= artifactTime
		) {
			return false;
		}
	}
	return true;
}

export function readJsonFile({ filePath }: { filePath: string }): unknown {
	if (!existsSync(filePath)) return [];
	return JSON.parse(readFileSync(filePath, "utf8"));
}
