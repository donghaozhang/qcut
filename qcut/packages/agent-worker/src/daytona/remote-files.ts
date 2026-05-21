import { join } from "node:path";

import { execa } from "execa";

import { OUTPUT_ARCHIVE, TIMEOUT_SECONDS } from "./constants.js";
import { isDaytonaEmptyExitCodeError, quoteShellArg } from "./command.js";
import type { DaytonaSandbox, DaytonaSessionCommandResult } from "./types.js";

const REMOTE_FILE_SIZE_PREFIX = "__QCUT_FILE_SIZE__=";

export async function extractArchive({
	archivePath,
	outputDir,
}: {
	archivePath: string;
	outputDir: string;
}): Promise<void> {
	await execa("tar", ["-xf", archivePath, "-C", outputDir]);
}

export async function downloadOutputDir({
	sandbox,
	outputDir,
	extract,
}: {
	sandbox: DaytonaSandbox;
	outputDir: string;
	extract: (params: {
		archivePath: string;
		outputDir: string;
	}) => Promise<void>;
}): Promise<void> {
	const localArchive = join(outputDir, "qcut-output.tar");
	await sandbox.fs.downloadFile(OUTPUT_ARCHIVE, localArchive, TIMEOUT_SECONDS);
	await extract({ archivePath: localArchive, outputDir });
}

export async function executeShellCommand({
	sandbox,
	sessionId,
	command,
	timeout = 60,
	allowEmptyExitCodeError = false,
}: {
	sandbox: DaytonaSandbox;
	sessionId: string;
	command: string;
	timeout?: number;
	allowEmptyExitCodeError?: boolean;
}): Promise<DaytonaSessionCommandResult> {
	try {
		return await sandbox.process.executeSessionCommand(
			sessionId,
			{
				command,
				runAsync: false,
				suppressInputEcho: true,
			},
			timeout
		);
	} catch (error) {
		if (allowEmptyExitCodeError && isDaytonaEmptyExitCodeError({ error })) {
			return { stdout: "", stderr: "", exitCode: 0 };
		}
		throw error;
	}
}

export async function readRemoteFile({
	sandbox,
	sessionId,
	path,
	allowEmptyExitCodeError = false,
}: {
	sandbox: DaytonaSandbox;
	sessionId: string;
	path: string;
	allowEmptyExitCodeError?: boolean;
}): Promise<string> {
	const result = await executeShellCommand({
		sandbox,
		sessionId,
		command: `cat ${quoteShellArg({ arg: path })} 2>/dev/null || true`,
		allowEmptyExitCodeError,
	});
	return result.stdout ?? result.output ?? "";
}

export async function readRemoteFileFromOffset({
	sandbox,
	sessionId,
	path,
	offset,
	allowEmptyExitCodeError = false,
}: {
	sandbox: DaytonaSandbox;
	sessionId: string;
	path: string;
	offset: number;
	allowEmptyExitCodeError?: boolean;
}): Promise<{ text: string; size: number; truncated: boolean }> {
	const safeOffset = Math.max(0, Math.trunc(offset));
	const result = await executeShellCommand({
		sandbox,
		sessionId,
		command: [
			`file=${quoteShellArg({ arg: path })}`,
			`offset=${safeOffset}`,
			'size=$(wc -c < "$file" 2>/dev/null || printf 0)',
			'case "$size" in ""|*[!0-9]*) size=0 ;; esac',
			`printf '${REMOTE_FILE_SIZE_PREFIX}%s\\n' "$size"`,
			'if [ "$size" -lt "$offset" ]; then cat "$file" 2>/dev/null || true; elif [ "$size" -gt "$offset" ]; then tail -c +$((offset + 1)) "$file" 2>/dev/null || true; fi',
		].join("; "),
		allowEmptyExitCodeError,
	});
	const output = result.stdout ?? result.output ?? "";
	const newlineIndex = output.indexOf("\n");
	if (!output.startsWith(REMOTE_FILE_SIZE_PREFIX) || newlineIndex < 0) {
		return {
			text: output,
			size: Buffer.byteLength(output),
			truncated: safeOffset > 0,
		};
	}
	const size = Number.parseInt(
		output.slice(REMOTE_FILE_SIZE_PREFIX.length, newlineIndex),
		10
	);
	return {
		text: output.slice(newlineIndex + 1),
		size: Number.isFinite(size) ? size : 0,
		truncated: Number.isFinite(size) ? size < safeOffset : safeOffset > 0,
	};
}

export async function remoteFileExists({
	sandbox,
	sessionId,
	path,
}: {
	sandbox: DaytonaSandbox;
	sessionId: string;
	path: string;
}): Promise<boolean> {
	const result = await executeShellCommand({
		sandbox,
		sessionId,
		command: `test -f ${quoteShellArg({ arg: path })} && printf yes || true`,
		allowEmptyExitCodeError: true,
	});
	return (result.stdout ?? result.output ?? "").trim() === "yes";
}
