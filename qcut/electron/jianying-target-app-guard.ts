import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";

const PROCESS_LIST_EXECUTABLE = "/bin/ps";
const PROCESS_LIST_ARGUMENTS = ["-axo", "pid=,comm="];
const PROCESS_LIST_MAX_BUFFER_BYTES = 1024 * 1024;
const PROCESS_LIST_TIMEOUT_MILLISECONDS = 5_000;

export interface JianyingTargetAppGuardContext {
	outputParentDirectory: string;
	sourceProjectDirectory: string;
}

export type JianyingTargetAppGuard = (
	context: JianyingTargetAppGuardContext
) => Promise<void>;

type ProcessTableReader = () => Promise<string>;
type PathCanonicalizer = (path: string) => Promise<string>;

export class JianyingAppRunningError extends Error {
	constructor() {
		super(
			"Jianying Professional is running. Quit it before exporting a draft."
		);
		this.name = "JianyingAppRunningError";
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

function readProcessExecutablePath({
	processLine,
}: {
	processLine: string;
}): string | undefined {
	const executablePath = /^\s*\d+\s+(.+?)\s*$/u.exec(processLine)?.[1];
	return executablePath !== undefined && isAbsolute(executablePath)
		? executablePath
		: undefined;
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

export function createJianyingTargetAppGuard({
	appPath,
	canonicalizePath = realpath,
	readProcessTable = readProcessTableDefault,
}: {
	appPath: string;
	canonicalizePath?: PathCanonicalizer;
	readProcessTable?: ProcessTableReader;
}): JianyingTargetAppGuard {
	return async () => {
		const [canonicalAppPath, processTable] = await Promise.all([
			canonicalizePath(appPath),
			readProcessTable(),
		]);
		const executablePaths = processTable
			.split(/\r?\n/u)
			.flatMap((processLine) => {
				const executablePath = readProcessExecutablePath({ processLine });
				return executablePath === undefined ? [] : [executablePath];
			});
		const canonicalExecutablePaths = await Promise.all(
			executablePaths.map((executablePath) =>
				canonicalizePath(executablePath).catch(() => executablePath)
			)
		);
		if (
			canonicalExecutablePaths.some((executablePath) =>
				isInsideDirectory({
					candidatePath: executablePath,
					directoryPath: canonicalAppPath,
				})
			)
		) {
			throw new JianyingAppRunningError();
		}
	};
}
