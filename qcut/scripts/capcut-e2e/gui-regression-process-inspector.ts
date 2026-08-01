import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
import type { CapCutGuiAppReport } from "./gui-regression-app-profile.js";
import {
	assertCapCutGuiFileIdentityUnchanged,
	captureCapCutGuiFileIdentity,
	type CapCutGuiFileIdentity,
} from "./gui-regression-file-identity.js";
import { isSameOrDescendantPath } from "./gui-regression-filesystem.js";

const PROCESS_LINE_PATTERN =
	/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s+(\d{4})\s+(.+?)\s*$/u;

export interface CapCutGuiExecutablePathReport {
	canonicalPath: string;
	identity: CapCutGuiFileIdentity;
}

export interface CapCutGuiProcessExecutableObservation {
	deviceId: string;
	executablePath: string;
	inode: string;
}

export interface CapCutGuiProcessReport {
	canonicalExecutablePath: string;
	executableDeviceId: string;
	executableInode: string;
	executablePath: string;
	pgid: number;
	pid: number;
	ppid: number;
	startIdentity: string;
	uid: number;
}

interface RawProcessRecord {
	executablePath: string;
	pgid: number;
	pid: number;
	ppid: number;
	startIdentity: string;
	uid: number;
}

export type CapCutGuiProcessExecutableInspector = ({
	path,
}: {
	path: string;
}) => Promise<CapCutGuiExecutablePathReport>;

export type CapCutGuiProcessExecutableReader = ({
	expectedPath,
	pid,
}: {
	expectedPath: string;
	pid: number;
}) => Promise<CapCutGuiProcessExecutableObservation>;

export type CapCutGuiProcessTableReader = () => Promise<string>;

function executeTextCommand({
	args,
	command,
	errorMessage,
}: {
	args: string[];
	command: string;
	errorMessage: string;
}): Promise<string> {
	return new Promise((resolvePromise, reject) => {
		execFile(
			command,
			args,
			{
				encoding: "utf8",
				env: { ...process.env, LANG: "C", LC_ALL: "C" },
				maxBuffer: 16 * 1024 * 1024,
			},
			(error, stdout) => {
				if (error) {
					reject(new Error(errorMessage, { cause: error }));
					return;
				}
				resolvePromise(stdout);
			}
		);
	});
}

export function readMacOsProcessTable(): Promise<string> {
	return executeTextCommand({
		args: ["-axo", "pid=,uid=,ppid=,pgid=,lstart=,comm="],
		command: "/bin/ps",
		errorMessage: "Could not inspect the macOS process table.",
	});
}

function normalizeUnsignedInteger({
	label,
	value,
}: {
	label: string;
	value: string;
}): string {
	if (!/^(?:0x[\da-f]+|\d+)$/iu.test(value)) {
		throw new Error(`Invalid ${label} from macOS process inspection.`);
	}
	return BigInt(value).toString();
}

interface LsofTextRecord {
	deviceId?: string;
	inode?: string;
	path?: string;
}

function parseLsofTextRecords({ text }: { text: string }): LsofTextRecord[] {
	const records: LsofTextRecord[] = [];
	let current: LsofTextRecord | null = null;
	for (const line of text.split("\n")) {
		if (line.startsWith("f")) {
			if (current) records.push(current);
			current = {};
			continue;
		}
		if (!current || line.length < 2) continue;
		const value = line.slice(1);
		if (line.startsWith("D")) current.deviceId = value;
		if (line.startsWith("i")) current.inode = value;
		if (line.startsWith("n")) current.path = value;
	}
	if (current) records.push(current);
	return records;
}

export async function readMacOsProcessExecutable({
	expectedPath,
	pid,
}: {
	expectedPath: string;
	pid: number;
}): Promise<CapCutGuiProcessExecutableObservation> {
	const output = await executeTextCommand({
		args: ["-a", "-p", String(pid), "-d", "txt", "-FfDin"],
		command: "/usr/sbin/lsof",
		errorMessage: `Could not bind CapCut PID ${pid} to its executable vnode.`,
	});
	const matches = parseLsofTextRecords({ text: output }).filter(
		({ path }) => path === expectedPath
	);
	if (matches.length !== 1) {
		throw new Error(
			`CapCut PID ${pid} does not have exactly one txt vnode for its ps executable path.`
		);
	}
	const [match] = matches;
	if (!match?.deviceId || !match.inode || !match.path) {
		throw new Error(`CapCut PID ${pid} has incomplete executable vnode data.`);
	}
	return {
		deviceId: normalizeUnsignedInteger({
			label: "executable device ID",
			value: match.deviceId,
		}),
		executablePath: match.path,
		inode: normalizeUnsignedInteger({
			label: "executable inode",
			value: match.inode,
		}),
	};
}

function parseSafeProcessInteger({
	label,
	value,
}: {
	label: string;
	value: string;
}): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw new Error(`Invalid ${label} in macOS process table.`);
	}
	return parsed;
}

function parseProcessTable({ text }: { text: string }): RawProcessRecord[] {
	return text.split("\n").flatMap((line) => {
		if (line.trim().length === 0) return [];
		const match = PROCESS_LINE_PATTERN.exec(line);
		if (!match) {
			throw new Error("Could not parse a macOS process table row.");
		}
		const [
			,
			pidText,
			uidText,
			ppidText,
			pgidText,
			weekday,
			month,
			day,
			time,
			year,
			executablePath,
		] = match;
		if (
			!pidText ||
			!uidText ||
			!ppidText ||
			!pgidText ||
			!weekday ||
			!month ||
			!day ||
			!time ||
			!year ||
			!executablePath
		) {
			throw new Error("macOS process table row is incomplete.");
		}
		return [
			{
				executablePath,
				pgid: parseSafeProcessInteger({ label: "PGID", value: pgidText }),
				pid: parseSafeProcessInteger({ label: "PID", value: pidText }),
				ppid: parseSafeProcessInteger({ label: "PPID", value: ppidText }),
				startIdentity: `${weekday} ${month} ${Number(day)} ${time} ${year}`,
				uid: parseSafeProcessInteger({ label: "UID", value: uidText }),
			},
		];
	});
}

function hasCapCutProcessName({
	executablePath,
}: {
	executablePath: string;
}): boolean {
	return /^CapCut(?: Helper(?: \([^)]+\))?)?$/u.test(basename(executablePath));
}

export function isCapCutRelatedProcess({
	approvedAppPath,
	executablePath,
}: {
	approvedAppPath: string;
	executablePath: string;
}): boolean {
	return (
		hasCapCutProcessName({ executablePath }) ||
		(isAbsolute(executablePath) &&
			isSameOrDescendantPath({
				candidatePath: resolve(executablePath),
				parentPath: approvedAppPath,
			})) ||
		/\/[^/]*CapCut[^/]*\.app\/Contents\//iu.test(executablePath)
	);
}

export async function inspectCanonicalExecutable({
	path,
}: {
	path: string;
}): Promise<CapCutGuiExecutablePathReport> {
	if (!isAbsolute(path)) {
		throw new Error(`CapCut process executable path must be absolute: ${path}`);
	}
	const requestedPath = resolve(path);
	const beforeStats = await lstat(requestedPath, { bigint: true });
	if (beforeStats.isSymbolicLink() || !beforeStats.isFile()) {
		throw new Error(
			`CapCut process executable must be a regular file: ${requestedPath}`
		);
	}
	const beforeIdentity = captureCapCutGuiFileIdentity({ stats: beforeStats });
	const canonicalPath = await realpath(requestedPath);
	const afterStats = await lstat(requestedPath, { bigint: true });
	const canonicalPathAfter = await realpath(requestedPath);
	if (afterStats.isSymbolicLink() || !afterStats.isFile()) {
		throw new Error(
			`CapCut process executable changed type during inspection: ${requestedPath}`
		);
	}
	const identity = captureCapCutGuiFileIdentity({ stats: afterStats });
	assertCapCutGuiFileIdentityUnchanged({
		after: identity,
		before: beforeIdentity,
		label: "CapCut process executable",
	});
	if (canonicalPath !== requestedPath || canonicalPathAfter !== requestedPath) {
		throw new Error(
			`CapCut process executable must not traverse symbolic links: ${requestedPath}`
		);
	}
	return { canonicalPath, identity };
}

function selectCapCutRecords({
	app,
	processTable,
}: {
	app: CapCutGuiAppReport;
	processTable: string;
}): RawProcessRecord[] {
	return parseProcessTable({ text: processTable }).filter(
		({ executablePath }) =>
			isCapCutRelatedProcess({
				approvedAppPath: app.canonicalAppPath,
				executablePath,
			})
	);
}

async function inspectProcessRecords({
	inspectProcessExecutable,
	readProcessExecutable,
	records,
}: {
	inspectProcessExecutable: CapCutGuiProcessExecutableInspector;
	readProcessExecutable: CapCutGuiProcessExecutableReader;
	records: RawProcessRecord[];
}): Promise<CapCutGuiProcessReport[]> {
	return Promise.all(
		records.map(async (record) => {
			const [diskExecutable, runningExecutable] = await Promise.all([
				inspectProcessExecutable({ path: record.executablePath }),
				readProcessExecutable({
					expectedPath: record.executablePath,
					pid: record.pid,
				}),
			]);
			if (
				runningExecutable.executablePath !== record.executablePath ||
				runningExecutable.deviceId !== diskExecutable.identity.deviceId ||
				runningExecutable.inode !== diskExecutable.identity.inode
			) {
				throw new Error(
					`CapCut PID ${record.pid} executable vnode does not match the approved path on disk.`
				);
			}
			return {
				canonicalExecutablePath: diskExecutable.canonicalPath,
				executableDeviceId: runningExecutable.deviceId,
				executableInode: runningExecutable.inode,
				executablePath: record.executablePath,
				pgid: record.pgid,
				pid: record.pid,
				ppid: record.ppid,
				startIdentity: record.startIdentity,
				uid: record.uid,
			};
		})
	);
}

function stableReportKey({
	report,
}: {
	report: CapCutGuiProcessReport;
}): string {
	return JSON.stringify(report);
}

function assertProcessSamplesStable({
	after,
	before,
}: {
	after: readonly CapCutGuiProcessReport[];
	before: readonly CapCutGuiProcessReport[];
}): void {
	const afterKeys = after.map((report) => stableReportKey({ report })).sort();
	const beforeKeys = before.map((report) => stableReportKey({ report })).sort();
	if (JSON.stringify(afterKeys) !== JSON.stringify(beforeKeys)) {
		throw new Error(
			"CapCut process set or generation changed during session inspection."
		);
	}
}

export async function inspectCapCutProcesses({
	app,
	inspectProcessExecutable = inspectCanonicalExecutable,
	readProcessExecutable = readMacOsProcessExecutable,
	readProcessTable = readMacOsProcessTable,
}: {
	app: CapCutGuiAppReport;
	inspectProcessExecutable?: CapCutGuiProcessExecutableInspector;
	readProcessExecutable?: CapCutGuiProcessExecutableReader;
	readProcessTable?: CapCutGuiProcessTableReader;
}): Promise<CapCutGuiProcessReport[]> {
	const beforeRecords = selectCapCutRecords({
		app,
		processTable: await readProcessTable(),
	});
	const before = await inspectProcessRecords({
		inspectProcessExecutable,
		readProcessExecutable,
		records: beforeRecords,
	});
	const afterRecords = selectCapCutRecords({
		app,
		processTable: await readProcessTable(),
	});
	const after = await inspectProcessRecords({
		inspectProcessExecutable,
		readProcessExecutable,
		records: afterRecords,
	});
	assertProcessSamplesStable({ after, before });
	return after;
}

export const capCutGuiProcessInspectorTesting = Object.freeze({
	inspectCapCutProcesses,
	inspectCanonicalExecutable,
	parseLsofTextRecords,
	parseProcessTable,
});
