import type { BigIntStats } from "node:fs";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { DisposableCapCutStorePreflightReport } from "./disposable-store-guard.js";
import type { CapCutGuiAppReport } from "./gui-regression-app-profile.js";
import type { CapCutGuiStepAction } from "./gui-regression-contract.js";
import { isSameOrDescendantPath } from "./gui-regression-filesystem.js";
import type { CapCutGuiProcessIdentityReport } from "./gui-regression-identity.js";
import {
	capCutGuiProcessInspectorTesting,
	inspectCanonicalExecutable,
	inspectCapCutProcesses,
	isCapCutRelatedProcess,
	readMacOsProcessExecutable,
	readMacOsProcessTable,
	type CapCutGuiProcessExecutableInspector,
	type CapCutGuiProcessExecutableReader,
	type CapCutGuiProcessReport,
	type CapCutGuiProcessTableReader,
} from "./gui-regression-process-inspector.js";
import {
	inspectCanonicalSessionDirectory,
	inspectCanonicalSessionDirectoryWithRuntime,
	type CapCutGuiSessionDirectoryReport,
} from "./gui-regression-session-directory.js";

const CONSOLE_DEVICE_PATH = "/dev/console";
const CAPCUT_CONTAINER_PATH_SEGMENTS = [
	"Library",
	"Containers",
	"com.lemon.lvoverseas",
] as const;
const CAPCUT_STORE_PATH_SEGMENTS = [
	"Movies",
	"CapCut",
	"User Data",
	"Projects",
	"com.lveditor.draft",
] as const;

export type CapCutGuiExpectedProcessState = "absent" | "present";

export interface CapCutGuiSessionExpectation {
	containerRequired: boolean;
	processState: CapCutGuiExpectedProcessState;
}

export type { CapCutGuiSessionDirectoryReport };

export interface CapCutGuiSessionReport {
	consoleDevicePath: typeof CONSOLE_DEVICE_PATH;
	consoleOwnerUid: number;
	container: CapCutGuiSessionDirectoryReport;
	processes: readonly CapCutGuiProcessReport[];
	store: CapCutGuiSessionDirectoryReport & {
		canonicalPath: string;
		ownerUid: number;
		status: "present";
	};
}

interface CapCutGuiSessionRuntime {
	inspectDirectory: ({
		allowMissing,
		path,
	}: {
		allowMissing: boolean;
		path: string;
	}) => Promise<CapCutGuiSessionDirectoryReport>;
	inspectProcessExecutable: CapCutGuiProcessExecutableInspector;
	platform: NodeJS.Platform;
	readConsoleStats: ({ path }: { path: string }) => Promise<BigIntStats>;
	readProcessExecutable: CapCutGuiProcessExecutableReader;
	readProcessTable: CapCutGuiProcessTableReader;
}

export type CapCutGuiSessionInspector = ({
	app,
	expectation,
	identity,
	store,
}: {
	app: CapCutGuiAppReport;
	expectation: CapCutGuiSessionExpectation;
	identity: CapCutGuiProcessIdentityReport;
	store: DisposableCapCutStorePreflightReport;
}) => Promise<CapCutGuiSessionReport>;

async function inspectSessionWithRuntime({
	app,
	expectation: _expectation,
	identity,
	runtime,
	store,
}: {
	app: CapCutGuiAppReport;
	expectation: CapCutGuiSessionExpectation;
	identity: CapCutGuiProcessIdentityReport;
	runtime: CapCutGuiSessionRuntime;
	store: DisposableCapCutStorePreflightReport;
}): Promise<CapCutGuiSessionReport> {
	if (runtime.platform !== "darwin") {
		throw new Error("CapCut GUI session inspection requires macOS.");
	}
	const expectedContainerPath = join(
		identity.userInfoHomePath,
		...CAPCUT_CONTAINER_PATH_SEGMENTS
	);
	const expectedStorePath = join(
		identity.userInfoHomePath,
		...CAPCUT_STORE_PATH_SEGMENTS
	);
	if (store.canonicalStorePath !== expectedStorePath) {
		throw new Error(
			"CapCut draft store is not inside the isolated account home."
		);
	}
	const [consoleStats, container, inspectedStore, processes] =
		await Promise.all([
			runtime.readConsoleStats({ path: CONSOLE_DEVICE_PATH }),
			runtime.inspectDirectory({
				allowMissing: true,
				path: expectedContainerPath,
			}),
			runtime.inspectDirectory({
				allowMissing: false,
				path: expectedStorePath,
			}),
			inspectCapCutProcesses({
				app,
				inspectProcessExecutable: runtime.inspectProcessExecutable,
				readProcessExecutable: runtime.readProcessExecutable,
				readProcessTable: runtime.readProcessTable,
			}),
		]);
	if (consoleStats.isSymbolicLink() || !consoleStats.isCharacterDevice()) {
		throw new Error(
			"CapCut GUI regression requires the real /dev/console character device."
		);
	}
	if (
		inspectedStore.status !== "present" ||
		inspectedStore.canonicalPath === null ||
		inspectedStore.identity === null ||
		inspectedStore.ownerUid === null
	) {
		throw new Error("The isolated CapCut draft store must exist.");
	}
	return {
		consoleDevicePath: CONSOLE_DEVICE_PATH,
		consoleOwnerUid: Number(consoleStats.uid),
		container,
		processes,
		store: {
			canonicalPath: inspectedStore.canonicalPath,
			identity: inspectedStore.identity,
			ownerUid: inspectedStore.ownerUid,
			path: inspectedStore.path,
			status: "present",
		},
	};
}

function assertDirectoryReport({
	expectedOwnerUid,
	expectedPath,
	label,
	report,
	required,
}: {
	expectedOwnerUid: number;
	expectedPath: string;
	label: string;
	report: CapCutGuiSessionDirectoryReport;
	required: boolean;
}): void {
	if (report.path !== expectedPath) {
		throw new Error(`${label} path does not match the isolated account.`);
	}
	if (report.status === "absent") {
		if (required) throw new Error(`${label} must exist after CapCut launches.`);
		if (
			report.canonicalPath !== null ||
			report.identity !== null ||
			report.ownerUid !== null
		) {
			throw new Error(`${label} absent report is inconsistent.`);
		}
		return;
	}
	if (
		report.canonicalPath !== expectedPath ||
		report.identity === null ||
		report.identity.ownerUid !== report.ownerUid ||
		report.ownerUid !== expectedOwnerUid
	) {
		throw new Error(
			`${label} must be canonical and owned by the isolated process UID.`
		);
	}
}

function assertProcessReports({
	app,
	expectedProcessState,
	identity,
	processes,
}: {
	app: CapCutGuiAppReport;
	expectedProcessState: CapCutGuiExpectedProcessState;
	identity: CapCutGuiProcessIdentityReport;
	processes: readonly CapCutGuiProcessReport[];
}): void {
	const seenPids = new Set<number>();
	for (const processReport of processes) {
		if (
			!Number.isSafeInteger(processReport.pid) ||
			processReport.pid <= 0 ||
			seenPids.has(processReport.pid)
		) {
			throw new Error(
				"CapCut process report contains an invalid or duplicate PID."
			);
		}
		seenPids.add(processReport.pid);
		if (
			!Number.isSafeInteger(processReport.ppid) ||
			processReport.ppid < 0 ||
			!Number.isSafeInteger(processReport.pgid) ||
			processReport.pgid <= 0 ||
			!/^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/u.test(
				processReport.startIdentity
			) ||
			!/^\d+$/u.test(processReport.executableDeviceId) ||
			!/^\d+$/u.test(processReport.executableInode)
		) {
			throw new Error(
				`CapCut PID ${processReport.pid} has an invalid OS process generation report.`
			);
		}
		if (processReport.uid !== identity.processUid) {
			throw new Error(
				`CapCut PID ${processReport.pid} belongs to UID ${processReport.uid}, not isolated UID ${identity.processUid}.`
			);
		}
		if (
			processReport.executablePath !== processReport.canonicalExecutablePath ||
			!isSameOrDescendantPath({
				candidatePath: processReport.canonicalExecutablePath,
				parentPath: app.canonicalAppPath,
			}) ||
			!isCapCutRelatedProcess({
				approvedAppPath: app.canonicalAppPath,
				executablePath: processReport.executablePath,
			})
		) {
			throw new Error(
				`CapCut PID ${processReport.pid} does not use the approved CapCut application bundle.`
			);
		}
		if (
			processReport.canonicalExecutablePath === app.executablePath &&
			(processReport.executableDeviceId !== app.executableIntegrity.device ||
				processReport.executableInode !== app.executableIntegrity.inode)
		) {
			throw new Error(
				`CapCut PID ${processReport.pid} main executable vnode does not match the planned application.`
			);
		}
	}
	if (expectedProcessState === "absent" && processes.length > 0) {
		throw new Error(
			"CapCut must be completely closed at this GUI step boundary."
		);
	}
	const mainProcesses = processes.filter(
		({ canonicalExecutablePath }) =>
			canonicalExecutablePath === app.executablePath
	);
	if (mainProcesses.length > 1) {
		throw new Error("Exactly one approved CapCut main process may be running.");
	}
	if (expectedProcessState === "present" && mainProcesses.length !== 1) {
		throw new Error("The approved CapCut main process is not running.");
	}
}

export function getCapCutGuiSessionExpectationAfterStep({
	containerWasRequired,
	stepAction,
}: {
	containerWasRequired: boolean;
	stepAction: CapCutGuiStepAction;
}): CapCutGuiSessionExpectation {
	if (
		stepAction === "capture-root-before" ||
		stepAction === "capture-root-after"
	) {
		throw new Error("Root fingerprint steps are not GUI adapter actions.");
	}
	const processState: CapCutGuiExpectedProcessState =
		stepAction === "install-bundle" ||
		stepAction === "save-and-quit" ||
		stepAction === "quit"
			? "absent"
			: "present";
	return {
		containerRequired: containerWasRequired || processState === "present",
		processState,
	};
}

export function assertCapCutGuiSessionReport({
	app,
	expectation,
	identity,
	report,
	store,
}: {
	app: CapCutGuiAppReport;
	expectation: CapCutGuiSessionExpectation;
	identity: CapCutGuiProcessIdentityReport;
	report: CapCutGuiSessionReport;
	store: DisposableCapCutStorePreflightReport;
}): void {
	if (
		report.consoleDevicePath !== CONSOLE_DEVICE_PATH ||
		report.consoleOwnerUid !== identity.processUid
	) {
		throw new Error(
			"The active macOS /dev/console login UID must equal the isolated process UID."
		);
	}
	assertDirectoryReport({
		expectedOwnerUid: identity.processUid,
		expectedPath: store.canonicalStorePath,
		label: "CapCut draft store",
		report: report.store,
		required: true,
	});
	assertDirectoryReport({
		expectedOwnerUid: identity.processUid,
		expectedPath: join(
			identity.userInfoHomePath,
			...CAPCUT_CONTAINER_PATH_SEGMENTS
		),
		label: "CapCut sandbox container",
		report: report.container,
		required: expectation.containerRequired,
	});
	assertProcessReports({
		app,
		expectedProcessState: expectation.processState,
		identity,
		processes: report.processes,
	});
}

export async function inspectCapCutGuiSession({
	app,
	expectation,
	identity,
	store,
}: {
	app: CapCutGuiAppReport;
	expectation: CapCutGuiSessionExpectation;
	identity: CapCutGuiProcessIdentityReport;
	store: DisposableCapCutStorePreflightReport;
}): Promise<CapCutGuiSessionReport> {
	return inspectSessionWithRuntime({
		app,
		expectation,
		identity,
		runtime: {
			inspectDirectory: inspectCanonicalSessionDirectory,
			inspectProcessExecutable: inspectCanonicalExecutable,
			platform: process.platform,
			readConsoleStats: async ({ path }) => lstat(path, { bigint: true }),
			readProcessExecutable: readMacOsProcessExecutable,
			readProcessTable: readMacOsProcessTable,
		},
		store,
	});
}

export async function assertCapCutGuiSessionBoundary({
	app,
	expectation,
	identity,
	inspectSession,
	store,
}: {
	app: CapCutGuiAppReport;
	expectation: CapCutGuiSessionExpectation;
	identity: CapCutGuiProcessIdentityReport;
	inspectSession: CapCutGuiSessionInspector;
	store: DisposableCapCutStorePreflightReport;
}): Promise<CapCutGuiSessionReport> {
	const report = await inspectSession({ app, expectation, identity, store });
	assertCapCutGuiSessionReport({ app, expectation, identity, report, store });
	return report;
}

export const capCutGuiSessionGuardTesting = Object.freeze({
	inspectCapCutProcesses:
		capCutGuiProcessInspectorTesting.inspectCapCutProcesses,
	inspectCanonicalDirectory: inspectCanonicalSessionDirectory,
	inspectCanonicalDirectoryWithRuntime:
		inspectCanonicalSessionDirectoryWithRuntime,
	inspectCanonicalExecutable:
		capCutGuiProcessInspectorTesting.inspectCanonicalExecutable,
	inspectSessionWithRuntime,
	parseProcessTable: capCutGuiProcessInspectorTesting.parseProcessTable,
});
