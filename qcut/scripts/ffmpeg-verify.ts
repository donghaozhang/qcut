import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import type { FFmpegTarget } from "./ffmpeg-manifest.js";

interface CommandResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	error: string;
}

const MIN_BINARY_SIZE_BYTES = 1_000_000;
const COMMAND_TIMEOUT_MS = 15_000;

function runCommand({
	binaryPath,
	args,
}: {
	binaryPath: string;
	args: string[];
}): Promise<CommandResult> {
	return new Promise((resolve) => {
		const proc = spawn(binaryPath, args, {
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (result: CommandResult): void => {
			if (settled) return;
			settled = true;
			resolve(result);
		};
		const timeout = setTimeout(() => {
			proc.kill();
			finish({
				exitCode: null,
				stdout,
				stderr,
				error: `timed out after ${COMMAND_TIMEOUT_MS}ms`,
			});
		}, COMMAND_TIMEOUT_MS);

		proc.stdout?.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		proc.on("error", (error: Error) => {
			clearTimeout(timeout);
			finish({ exitCode: null, stdout, stderr, error: error.message });
		});
		proc.on("close", (exitCode: number | null) => {
			clearTimeout(timeout);
			finish({ exitCode, stdout, stderr, error: "" });
		});
	});
}

function assertCommand({
	result,
	label,
}: {
	result: CommandResult;
	label: string;
}): string {
	if (result.error || result.exitCode !== 0) {
		throw new Error(
			`${label} failed (exit=${result.exitCode}, error=${result.error}, stderr=${result.stderr.trim()})`
		);
	}
	return `${result.stdout}\n${result.stderr}`;
}

function assertIncludesAll({
	text,
	values,
	label,
}: {
	text: string;
	values: string[];
	label: string;
}): void {
	const missing = values.filter((value) => !text.includes(value));
	if (missing.length > 0) {
		throw new Error(`${label} is missing: ${missing.join(", ")}`);
	}
}

export async function verifyFFmpegBinaries({
	targetKey,
	target,
	requiredBuildFlags,
	forbiddenBuildFlags,
	ffmpegPath,
	ffprobePath,
	execute,
}: {
	targetKey: string;
	target: FFmpegTarget;
	requiredBuildFlags: string[];
	forbiddenBuildFlags: string[];
	ffmpegPath: string;
	ffprobePath: string;
	execute: boolean;
}): Promise<void> {
	for (const binaryPath of [ffmpegPath, ffprobePath]) {
		const fileStat = await stat(binaryPath);
		if (fileStat.size < MIN_BINARY_SIZE_BYTES) {
			throw new Error(`FFmpeg binary is unexpectedly small: ${binaryPath}`);
		}
	}

	const [ffmpegBuffer, ffprobeBuffer] = await Promise.all([
		readFile(ffmpegPath),
		readFile(ffprobePath),
	]);
	const ffmpegText = ffmpegBuffer.toString("latin1");
	const ffprobeText = ffprobeBuffer.toString("latin1");
	assertIncludesAll({
		text: ffmpegText,
		values: [
			target.versionMarker,
			...requiredBuildFlags,
			...target.hardwareAccelerators,
		],
		label: `${targetKey} ffmpeg binary`,
	});
	for (const forbiddenFlag of forbiddenBuildFlags) {
		if (ffmpegText.includes(forbiddenFlag)) {
			throw new Error(`${targetKey} ffmpeg binary contains ${forbiddenFlag}`);
		}
	}
	assertIncludesAll({
		text: ffprobeText,
		values: [target.versionMarker],
		label: `${targetKey} ffprobe binary`,
	});

	if (!execute) return;

	const [ffmpegVersion, ffprobeVersion, buildConfig, hardwareAccelerators] =
		await Promise.all([
			runCommand({ binaryPath: ffmpegPath, args: ["-version"] }),
			runCommand({ binaryPath: ffprobePath, args: ["-version"] }),
			runCommand({
				binaryPath: ffmpegPath,
				args: ["-hide_banner", "-buildconf"],
			}),
			runCommand({
				binaryPath: ffmpegPath,
				args: ["-hide_banner", "-hwaccels"],
			}),
		]);

	const ffmpegVersionText = assertCommand({
		result: ffmpegVersion,
		label: `${targetKey} ffmpeg -version`,
	});
	const ffprobeVersionText = assertCommand({
		result: ffprobeVersion,
		label: `${targetKey} ffprobe -version`,
	});
	const buildConfigText = assertCommand({
		result: buildConfig,
		label: `${targetKey} ffmpeg -buildconf`,
	});
	const hardwareText = assertCommand({
		result: hardwareAccelerators,
		label: `${targetKey} ffmpeg -hwaccels`,
	});

	assertIncludesAll({
		text: ffmpegVersionText,
		values: [target.versionMarker],
		label: `${targetKey} ffmpeg version output`,
	});
	assertIncludesAll({
		text: ffprobeVersionText,
		values: [target.versionMarker],
		label: `${targetKey} ffprobe version output`,
	});
	assertIncludesAll({
		text: buildConfigText,
		values: requiredBuildFlags,
		label: `${targetKey} FFmpeg build configuration`,
	});
	for (const forbiddenFlag of forbiddenBuildFlags) {
		if (buildConfigText.includes(forbiddenFlag)) {
			throw new Error(
				`${targetKey} FFmpeg build configuration contains ${forbiddenFlag}`
			);
		}
	}
	assertIncludesAll({
		text: hardwareText,
		values: target.hardwareAccelerators,
		label: `${targetKey} FFmpeg hardware accelerators`,
	});
}
