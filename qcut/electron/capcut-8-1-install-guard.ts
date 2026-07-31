import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

const PROCESS_LIST_EXECUTABLE = "/bin/ps";
const PROCESS_LIST_ARGUMENTS = ["-axo", "pid=,comm="];
const PROCESS_LIST_MAX_BUFFER_BYTES = 1024 * 1024;
const PROCESS_LIST_TIMEOUT_MILLISECONDS = 5_000;

export interface CapCut81TargetAppGuardContext {
	capCutAppPath: string;
	targetDraftStoreDirectory: string;
}

export type CapCut81TargetAppGuard = ({
	capCutAppPath,
	targetDraftStoreDirectory,
}: CapCut81TargetAppGuardContext) => Promise<void>;

type ProcessTableReader = () => Promise<string>;

interface CreateCapCut81TargetAppGuardOptions {
	readProcessTable?: ProcessTableReader;
}

export class CapCutAppRunningError extends Error {
	constructor() {
		super("CapCut is running. Quit CapCut before installing the draft.");
		this.name = "CapCutAppRunningError";
	}
}

function readProcessTableDefault(): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(
			PROCESS_LIST_EXECUTABLE,
			PROCESS_LIST_ARGUMENTS,
			{
				encoding: "utf8",
				maxBuffer: PROCESS_LIST_MAX_BUFFER_BYTES,
				timeout: PROCESS_LIST_TIMEOUT_MILLISECONDS,
				windowsHide: true,
			},
			(error, stdout) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(stdout);
			}
		);
	});
}

function getProcessExecutablePath({
	processLine,
}: {
	processLine: string;
}): string | undefined {
	const match = /^\s*\d+\s+(.+?)\s*$/.exec(processLine);
	const executablePath = match?.[1];
	if (!executablePath || !isAbsolute(executablePath)) {
		return undefined;
	}
	return executablePath;
}

function isInsideDirectory({
	candidatePath,
	directoryPath,
}: {
	candidatePath: string;
	directoryPath: string;
}): boolean {
	const relativePath = relative(directoryPath, candidatePath);
	return (
		relativePath !== "" &&
		relativePath !== ".." &&
		!relativePath.startsWith(`..${sep}`) &&
		!isAbsolute(relativePath)
	);
}

export function createCapCut81TargetAppGuard({
	readProcessTable = readProcessTableDefault,
}: CreateCapCut81TargetAppGuardOptions = {}): CapCut81TargetAppGuard {
	return async ({ capCutAppPath }) => {
		const [canonicalAppPath, processTable] = await Promise.all([
			realpath(capCutAppPath),
			readProcessTable(),
		]);
		const executablePaths = processTable
			.split(/\r?\n/u)
			.flatMap((processLine) => {
				const executablePath = getProcessExecutablePath({ processLine });
				return executablePath === undefined ? [] : [executablePath];
			});
		const canonicalExecutablePaths = await Promise.all(
			executablePaths.map((executablePath) =>
				realpath(executablePath).catch(() => executablePath)
			)
		);
		const isRunning = canonicalExecutablePaths.some((executablePath) =>
			isInsideDirectory({
				candidatePath: executablePath,
				directoryPath: canonicalAppPath,
			})
		);
		if (isRunning) {
			throw new CapCutAppRunningError();
		}
	};
}
