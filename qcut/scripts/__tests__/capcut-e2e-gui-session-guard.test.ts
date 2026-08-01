import type { BigIntStats } from "node:fs";
import { lstat, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapCutGuiRegressionPreflightReport } from "../capcut-e2e/gui-regression-preflight.js";
import {
	assertCapCutGuiSessionReport,
	capCutGuiSessionGuardTesting,
	getCapCutGuiSessionExpectationAfterStep,
	type CapCutGuiSessionExpectation,
	type CapCutGuiSessionReport,
} from "../capcut-e2e/gui-regression-session-guard.js";
import {
	cleanupGuiFixtures,
	createFixtureSessionInspector,
	createGuiFixture,
	preflightFixture,
	type GuiFixture,
} from "./capcut-e2e-gui-fixture.js";

afterEach(cleanupGuiFixtures);

interface GuardHarness {
	fixture: GuiFixture;
	preflight: CapCutGuiRegressionPreflightReport;
}

function createFileIdentity({
	deviceId = "10",
	inode = "20",
	ownerUid,
}: {
	deviceId?: string;
	inode?: string;
	ownerUid: number;
}) {
	return {
		changedTimeNanoseconds: "1",
		deviceId,
		inode,
		mode: "33261",
		modifiedTimeNanoseconds: "1",
		ownerUid,
	};
}

function processTableRow({
	executablePath,
	pid = 101,
	startIdentity = "Sat Aug 1 12:00:01 2026",
	uid,
}: {
	executablePath: string;
	pid?: number;
	startIdentity?: string;
	uid: number;
}): string {
	return `${pid} ${uid} 1 ${pid} ${startIdentity} ${executablePath}`;
}

async function createGuardHarness(): Promise<GuardHarness> {
	const fixture = await createGuiFixture();
	return {
		fixture,
		preflight: await preflightFixture({ fixture }),
	};
}

async function createReport({
	expectation,
	harness,
}: {
	expectation: CapCutGuiSessionExpectation;
	harness: GuardHarness;
}): Promise<CapCutGuiSessionReport> {
	const { app, identity, store } = harness.preflight;
	return createFixtureSessionInspector()({
		app,
		expectation,
		identity,
		store,
	});
}

function assertReport({
	expectation,
	harness,
	report,
}: {
	expectation: CapCutGuiSessionExpectation;
	harness: GuardHarness;
	report: CapCutGuiSessionReport;
}): void {
	const { app, identity, store } = harness.preflight;
	assertCapCutGuiSessionReport({ app, expectation, identity, report, store });
}

describe("CapCut GUI Aqua session guard", () => {
	it("requires the /dev/console owner to be the process user", async () => {
		const harness = await createGuardHarness();
		const expectation = {
			containerRequired: false,
			processState: "absent",
		} as const;
		const report = await createReport({ expectation, harness });

		report.consoleOwnerUid += 1;

		expect(() => assertReport({ expectation, harness, report })).toThrow(
			"/dev/console login UID"
		);
	});

	it("requires canonical isolated store and container ownership", async () => {
		const harness = await createGuardHarness();
		const expectation = {
			containerRequired: true,
			processState: "present",
		} as const;
		const storeReport = await createReport({ expectation, harness });
		storeReport.store.ownerUid += 1;
		expect(() =>
			assertReport({ expectation, harness, report: storeReport })
		).toThrow("draft store must be canonical and owned");

		const containerReport = await createReport({ expectation, harness });
		containerReport.container.canonicalPath = null;
		containerReport.container.identity = null;
		containerReport.container.ownerUid = null;
		containerReport.container.status = "absent";
		expect(() =>
			assertReport({ expectation, harness, report: containerReport })
		).toThrow("sandbox container must exist after CapCut launches");
	});

	it("allows an absent first-run container only before launch", async () => {
		const harness = await createGuardHarness();
		const expectation = {
			containerRequired: false,
			processState: "absent",
		} as const;
		const report = await createReport({ expectation, harness });
		report.container = {
			canonicalPath: null,
			identity: null,
			ownerUid: null,
			path: report.container.path,
			status: "absent",
		};

		expect(() => assertReport({ expectation, harness, report })).not.toThrow();
	});
});

describe("CapCut GUI process binding", () => {
	it("rejects a CapCut PID owned by another UID", async () => {
		const harness = await createGuardHarness();
		const expectation = {
			containerRequired: true,
			processState: "present",
		} as const;
		const report = await createReport({ expectation, harness });
		const mainProcess = report.processes[0];
		if (!mainProcess)
			throw new Error("Fixture report requires a main process.");
		report.processes = [
			{ ...mainProcess, uid: harness.preflight.identity.processUid + 1 },
		];

		expect(() => assertReport({ expectation, harness, report })).toThrow(
			"not isolated UID"
		);
	});

	it("rejects a CapCut PID outside the approved app bundle", async () => {
		const harness = await createGuardHarness();
		const expectation = {
			containerRequired: true,
			processState: "present",
		} as const;
		const report = await createReport({ expectation, harness });
		const mainProcess = report.processes[0];
		if (!mainProcess)
			throw new Error("Fixture report requires a main process.");
		report.processes = [
			{
				...mainProcess,
				canonicalExecutablePath: "/tmp/CapCut",
				executablePath: "/tmp/CapCut",
			},
		];

		expect(() => assertReport({ expectation, harness, report })).toThrow(
			"approved CapCut application bundle"
		);
	});

	it("requires the approved main process at open boundaries", async () => {
		const harness = await createGuardHarness();
		const expectation = {
			containerRequired: true,
			processState: "present",
		} as const;
		const report = await createReport({ expectation, harness });
		report.processes = [];

		expect(() => assertReport({ expectation, harness, report })).toThrow(
			"main process is not running"
		);
	});

	it("rejects multiple approved main processes", async () => {
		const harness = await createGuardHarness();
		const expectation = {
			containerRequired: true,
			processState: "present",
		} as const;
		const report = await createReport({ expectation, harness });
		const mainProcess = report.processes[0];
		if (!mainProcess)
			throw new Error("Fixture report requires a main process.");
		report.processes = [
			mainProcess,
			{ ...mainProcess, pid: mainProcess.pid + 1 },
		];

		expect(() => assertReport({ expectation, harness, report })).toThrow(
			"Exactly one approved CapCut main process"
		);
	});

	it("rejects every pre-existing CapCut process at closed boundaries", async () => {
		const harness = await createGuardHarness();
		const openExpectation = {
			containerRequired: true,
			processState: "present",
		} as const;
		const report = await createReport({
			expectation: openExpectation,
			harness,
		});
		const closedExpectation = {
			containerRequired: false,
			processState: "absent",
		} as const;

		expect(() =>
			assertReport({ expectation: closedExpectation, harness, report })
		).toThrow("must be completely closed");
	});
});

describe("CapCut GUI session inspection", () => {
	it("parses helper executable paths with spaces without truncation", () => {
		const parsed = capCutGuiSessionGuardTesting.parseProcessTable({
			text: [
				" 101 502 1 101 Sat Aug  1 12:00:01 2026 /Applications/CapCut.app/Contents/MacOS/CapCut",
				" 102 502 101 101 Sat Aug  1 12:00:02 2026 /Applications/CapCut.app/Contents/Frameworks/CapCut Helper (Renderer).app/Contents/MacOS/CapCut Helper (Renderer)",
				" 103 502 1 103 Sat Aug  1 12:00:03 2026 /tmp/CapCut Helperer",
			].join("\n"),
		});

		expect(parsed).toHaveLength(3);
		expect(parsed[1]?.executablePath).toContain("CapCut Helper (Renderer)");
	});

	it("reads console, container, store, and all CapCut process identities from injected runtime", async () => {
		const harness = await createGuardHarness();
		const { app, identity, store } = harness.preflight;
		const containerPath = join(
			identity.userInfoHomePath,
			"Library",
			"Containers",
			"com.lemon.lvoverseas"
		);
		const inspectDirectory = vi.fn(async ({ path }: { path: string }) => ({
			canonicalPath: path,
			identity: createFileIdentity({ ownerUid: identity.processUid }),
			ownerUid: identity.processUid,
			path,
			status: "present" as const,
		}));
		const report = await capCutGuiSessionGuardTesting.inspectSessionWithRuntime(
			{
				app,
				expectation: { containerRequired: true, processState: "present" },
				identity,
				runtime: {
					inspectDirectory,
					inspectProcessExecutable: async ({ path }) => ({
						canonicalPath: path,
						identity: createFileIdentity({ ownerUid: identity.processUid }),
					}),
					platform: "darwin",
					readConsoleStats: async () =>
						({
							isCharacterDevice: () => true,
							isSymbolicLink: () => false,
							uid: BigInt(identity.processUid),
						}) as BigIntStats,
					readProcessExecutable: async ({ expectedPath }) => ({
						deviceId: "10",
						executablePath: expectedPath,
						inode: "20",
					}),
					readProcessTable: async () =>
						processTableRow({
							executablePath: app.executablePath,
							pid: process.pid,
							uid: identity.processUid,
						}),
				},
				store,
			}
		);

		expect(inspectDirectory).toHaveBeenCalledWith({
			allowMissing: true,
			path: containerPath,
		});
		expect(report.processes).toEqual([
			expect.objectContaining({
				canonicalExecutablePath: app.executablePath,
				pgid: process.pid,
				ppid: 1,
				startIdentity: "Sat Aug 1 12:00:01 2026",
				uid: identity.processUid,
			}),
		]);
	});

	it("rejects a process that exits between the two process-table samples", async () => {
		const harness = await createGuardHarness();
		const { app, identity } = harness.preflight;
		const readProcessTable = vi
			.fn()
			.mockResolvedValueOnce(
				processTableRow({
					executablePath: app.executablePath,
					uid: identity.processUid,
				})
			)
			.mockResolvedValueOnce("");

		await expect(
			capCutGuiSessionGuardTesting.inspectCapCutProcesses({
				app,
				inspectProcessExecutable: async ({ path }) => ({
					canonicalPath: path,
					identity: createFileIdentity({
						deviceId: app.executableIntegrity.device,
						inode: app.executableIntegrity.inode,
						ownerUid: identity.processUid,
					}),
				}),
				readProcessExecutable: async ({ expectedPath }) => ({
					deviceId: app.executableIntegrity.device,
					executablePath: expectedPath,
					inode: app.executableIntegrity.inode,
				}),
				readProcessTable,
			})
		).rejects.toThrow("process set or generation changed");
	});

	it("rejects PID reuse or a changed start identity between samples", async () => {
		const harness = await createGuardHarness();
		const { app, identity } = harness.preflight;
		const readProcessTable = vi
			.fn()
			.mockResolvedValueOnce(
				processTableRow({
					executablePath: app.executablePath,
					uid: identity.processUid,
				})
			)
			.mockResolvedValueOnce(
				processTableRow({
					executablePath: app.executablePath,
					startIdentity: "Sat Aug 1 12:00:02 2026",
					uid: identity.processUid,
				})
			);

		await expect(
			capCutGuiSessionGuardTesting.inspectCapCutProcesses({
				app,
				inspectProcessExecutable: async ({ path }) => ({
					canonicalPath: path,
					identity: createFileIdentity({ ownerUid: identity.processUid }),
				}),
				readProcessExecutable: async ({ expectedPath }) => ({
					deviceId: "10",
					executablePath: expectedPath,
					inode: "20",
				}),
				readProcessTable,
			})
		).rejects.toThrow("process set or generation changed");
	});

	it("rejects non-macOS runtimes before inspecting paths", async () => {
		const harness = await createGuardHarness();
		const { app, identity, store } = harness.preflight;
		const runtimeMethod = vi.fn();

		await expect(
			capCutGuiSessionGuardTesting.inspectSessionWithRuntime({
				app,
				expectation: { containerRequired: false, processState: "absent" },
				identity,
				runtime: {
					inspectDirectory: runtimeMethod,
					inspectProcessExecutable: runtimeMethod,
					platform: "linux",
					readConsoleStats: runtimeMethod,
					readProcessExecutable: runtimeMethod,
					readProcessTable: runtimeMethod,
				},
				store,
			})
		).rejects.toThrow("requires macOS");
		expect(runtimeMethod).not.toHaveBeenCalled();
	});

	it("refuses symlinked session directories", async () => {
		const harness = await createGuardHarness();
		const target = join(harness.fixture.canonicalHomePath, "container-target");
		const link = join(harness.fixture.canonicalHomePath, "container-link");
		await mkdir(target);
		await symlink(target, link);

		await expect(
			capCutGuiSessionGuardTesting.inspectCanonicalDirectory({
				allowMissing: false,
				path: link,
			})
		).rejects.toThrow("must be a real directory");
	});

	it("rejects a directory identity race during canonicalization", async () => {
		const harness = await createGuardHarness();
		const beforePath = join(harness.fixture.canonicalHomePath, "directory-a");
		const afterPath = join(harness.fixture.canonicalHomePath, "directory-b");
		await Promise.all([mkdir(beforePath), mkdir(afterPath)]);
		const [beforeStats, afterStats] = await Promise.all([
			lstat(beforePath, { bigint: true }),
			lstat(afterPath, { bigint: true }),
		]);
		const lstatPath = vi
			.fn()
			.mockResolvedValueOnce(beforeStats)
			.mockResolvedValueOnce(afterStats);

		await expect(
			capCutGuiSessionGuardTesting.inspectCanonicalDirectoryWithRuntime({
				allowMissing: false,
				path: beforePath,
				runtime: {
					lstatPath,
					realpathPath: async ({ path }) => path,
				},
			})
		).rejects.toThrow("changed during inspection");
	});

	it("refuses symlinked process executables", async () => {
		const harness = await createGuardHarness();
		const link = join(harness.fixture.canonicalHomePath, "CapCut");
		await symlink(harness.preflight.app.executablePath, link);

		await expect(
			capCutGuiSessionGuardTesting.inspectCanonicalExecutable({ path: link })
		).rejects.toThrow("must be a regular file");
	});
});

describe("CapCut GUI step lifecycle", () => {
	it.each([
		["install-bundle", "absent", false],
		["open-draft-first-time", "present", true],
		["capture-first-open", "present", true],
		["save-and-quit", "absent", true],
		["reopen-draft", "present", true],
		["quit", "absent", true],
	] as const)("maps %s to process=%s container=%s", (stepAction, processState, containerRequired) => {
		expect(
			getCapCutGuiSessionExpectationAfterStep({
				containerWasRequired: stepAction !== "install-bundle",
				stepAction,
			})
		).toEqual({ containerRequired, processState });
	});
});
