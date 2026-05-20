import { join } from "node:path";

import { execa } from "execa";

import { OUTPUT_ARCHIVE, TIMEOUT_SECONDS } from "./constants.js";
import { isDaytonaEmptyExitCodeError, quoteShellArg } from "./command.js";
import type { DaytonaSandbox, DaytonaSessionCommandResult } from "./types.js";

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
