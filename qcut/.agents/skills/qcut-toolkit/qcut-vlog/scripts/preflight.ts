import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveToolchain } from "./runtime";
import type { ToolCommand } from "./types";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REQUIRED_FFMPEG_MAJOR = 8;

export function parseFfmpegMajor({
	versionOutput,
}: {
	versionOutput: string;
}): number {
	const match = versionOutput.match(/^ffmpeg version (?:n)?(\d+)(?:[.\s-]|$)/m);
	if (!match) {
		throw new Error("Could not parse the FFmpeg major version");
	}
	return Number(match[1]);
}

function readVersion({ tool }: { tool: ToolCommand }): string {
	const result = spawnSync(
		tool.executable,
		[...tool.prefixArgs, "-version"],
		{
			cwd: tool.cwd,
			encoding: "utf8",
		}
	);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		const detail = result.stderr.trim();
		throw new Error(
			`FFmpeg version check failed (${result.status ?? "unknown"})${detail ? `: ${detail}` : ""}`
		);
	}
	return result.stdout;
}

export function assertFfmpegMajor({
	versionOutput,
	requiredMajor = REQUIRED_FFMPEG_MAJOR,
}: {
	versionOutput: string;
	requiredMajor?: number;
}): number {
	const actualMajor = parseFfmpegMajor({ versionOutput });
	if (actualMajor < requiredMajor) {
		throw new Error(
			`FFmpeg ${requiredMajor}+ is required for color-managed B-roll; resolved FFmpeg ${actualMajor}`
		);
	}
	return actualMajor;
}

export function runPreflight({
	env = process.env,
}: {
	env?: NodeJS.ProcessEnv;
} = {}) {
	const toolchain = resolveToolchain({
		scriptDirectory: SCRIPT_DIRECTORY,
		env,
	});
	const ffmpegMajor = assertFfmpegMajor({
		versionOutput: readVersion({ tool: toolchain.ffmpeg }),
	});
	return {
		ffmpegMajor,
		ffmpeg: toolchain.ffmpeg.executable,
		ffprobe: toolchain.ffprobe.executable,
		qcut: toolchain.qcut.executable,
		qcutArgs: toolchain.qcut.prefixArgs,
		qcutCwd: toolchain.qcut.cwd,
	};
}

if (import.meta.main) {
	try {
		process.stdout.write(`${JSON.stringify(runPreflight(), null, 2)}\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`qcut-vlog-publish preflight: ${message}\n`);
		process.exitCode = 1;
	}
}
