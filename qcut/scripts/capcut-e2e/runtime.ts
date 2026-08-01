import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";

const EXPECTED_FFMPEG_VERSION = "8.1.2";
const COMMAND_TIMEOUT_MILLISECONDS = 120_000;
const MAXIMUM_COMMAND_OUTPUT_BYTES = 4 * 1024 * 1024;

export type CapCutE2eTool = "ffmpeg" | "ffprobe";

interface SpawnedProcess {
	exited: Promise<number>;
	kill(signal?: NodeJS.Signals | number): void;
	stderr: ReadableStream<Uint8Array>;
	stdout: ReadableStream<Uint8Array>;
}

interface BunRuntime {
	spawn(
		command: string[],
		options: {
			stderr: "pipe";
			stdin: "ignore";
			stdout: "pipe";
		}
	): SpawnedProcess;
}

export interface CommandResult {
	stderr: string;
	stdout: string;
}

export interface ToolVersionReport {
	banner: string;
	path: string;
	version: typeof EXPECTED_FFMPEG_VERSION;
}

function getBunRuntime(): BunRuntime {
	const runtime = (globalThis as { Bun?: BunRuntime }).Bun;
	if (!runtime) {
		throw new Error("The CapCut E2E fixture pipeline must run with Bun.");
	}
	return runtime;
}

async function readProcessOutput({
	stream,
}: {
	stream: ReadableStream<Uint8Array>;
}): Promise<string> {
	const value = await new Response(stream).text();
	if (Buffer.byteLength(value) > MAXIMUM_COMMAND_OUTPUT_BYTES) {
		throw new Error("Command output exceeded the fixture pipeline limit.");
	}
	return value;
}

export async function runCommand({
	args,
	command,
	timeoutMilliseconds = COMMAND_TIMEOUT_MILLISECONDS,
}: {
	args: string[];
	command: string;
	timeoutMilliseconds?: number;
}): Promise<CommandResult> {
	const child = getBunRuntime().spawn([command, ...args], {
		stderr: "pipe",
		stdin: "ignore",
		stdout: "pipe",
	});
	const stdoutPromise = readProcessOutput({ stream: child.stdout });
	const stderrPromise = readProcessOutput({ stream: child.stderr });
	let timeout: NodeJS.Timeout | undefined;
	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => {
			child.kill("SIGKILL");
			reject(
				new Error(
					`${command} timed out after ${timeoutMilliseconds} milliseconds.`
				)
			);
		}, timeoutMilliseconds);
	});

	try {
		const exitCode = await Promise.race([child.exited, timeoutPromise]);
		const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
		if (exitCode !== 0) {
			throw new Error(
				`${command} exited with ${exitCode}: ${stderr.trim() || stdout.trim()}`
			);
		}
		return { stderr, stdout };
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

export function getBundledTargetKey({
	arch = process.arch,
	platform = process.platform,
}: {
	arch?: string;
	platform?: string;
} = {}): string {
	const targetKey = `${platform}-${arch}`;
	if (
		targetKey !== "darwin-arm64" &&
		targetKey !== "darwin-x64" &&
		targetKey !== "linux-x64" &&
		targetKey !== "win32-x64"
	) {
		throw new Error(
			`QCut has no bundled FFmpeg 8.1.2 target for ${targetKey}.`
		);
	}
	return targetKey;
}

export async function resolveBundledToolPath({
	projectRoot,
	targetKey = getBundledTargetKey(),
	tool,
}: {
	projectRoot: string;
	targetKey?: string;
	tool: CapCutE2eTool;
}): Promise<string> {
	const binaryName = targetKey.startsWith("win32-") ? `${tool}.exe` : tool;
	const toolPath = join(
		projectRoot,
		"electron",
		"resources",
		"ffmpeg",
		targetKey,
		binaryName
	);
	const toolStats = await stat(toolPath).catch(() => null);
	if (!toolStats?.isFile()) {
		throw new Error(
			`Bundled ${tool} is missing at ${toolPath}. Stage the ${targetKey} FFmpeg target first.`
		);
	}
	return toolPath;
}

export async function requireBundledToolVersion({
	tool,
	toolPath,
}: {
	tool: CapCutE2eTool;
	toolPath: string;
}): Promise<ToolVersionReport> {
	const { stdout, stderr } = await runCommand({
		args: ["-version"],
		command: toolPath,
	});
	const banner = `${stdout}\n${stderr}`
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean);
	if (!banner) {
		throw new Error(`${tool} returned an empty version banner.`);
	}
	const versionPattern = new RegExp(
		`^${tool} version n?${EXPECTED_FFMPEG_VERSION.replaceAll(".", "\\.")}(?:[-+\\s]|$)`,
		"i"
	);
	if (!versionPattern.test(banner)) {
		throw new Error(
			`CapCut E2E fixtures require bundled ${tool} ${EXPECTED_FFMPEG_VERSION}; received ${banner}.`
		);
	}
	return {
		banner,
		path: toolPath,
		version: EXPECTED_FFMPEG_VERSION,
	};
}

export async function runFfmpeg({
	args,
	ffmpegPath,
}: {
	args: string[];
	ffmpegPath: string;
}): Promise<void> {
	await runCommand({ args, command: ffmpegPath });
}

export async function probeMedia({
	ffprobePath,
	mediaPath,
}: {
	ffprobePath: string;
	mediaPath: string;
}): Promise<unknown> {
	const { stdout } = await runCommand({
		args: [
			"-v",
			"error",
			"-show_format",
			"-show_streams",
			"-of",
			"json",
			mediaPath,
		],
		command: ffprobePath,
	});
	return JSON.parse(stdout) as unknown;
}

export function sha256File({
	filePath,
}: {
	filePath: string;
}): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash("sha256");
		const stream = createReadStream(filePath);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}
