import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapCutGuiStepAction } from "../capcut-e2e/gui-regression-contract.js";
import {
	CAPCUT_GUI_ADAPTER_APPLICATION_STATE,
	buildCapCutGuiRegressionPlan,
	type CapCutGuiRegressionExecutionAdapter,
	type CapCutGuiRegressionPlan,
	capCutGuiRegressionRunnerTesting,
} from "../capcut-e2e/gui-regression-runner.js";
import type { CapCutGuiSessionInspector } from "../capcut-e2e/gui-regression-session-guard.js";
import {
	cleanupGuiFixtures,
	createFixtureSessionInspector,
	createGuiFixture,
	preflightFixture,
	type GuiFixture,
	writeExecutionSentinel,
} from "./capcut-e2e-gui-fixture.js";
import {
	writeRootDraftIds,
	writeStepEvidenceFiles,
} from "./capcut-e2e-gui-store-fixture.js";

afterEach(cleanupGuiFixtures);

interface SessionExecutionHarness {
	fixture: GuiFixture;
	plan: CapCutGuiRegressionPlan;
	planPath: string;
}

async function createSessionExecutionHarness({
	adapterAction = "open-draft-first-time",
}: {
	adapterAction?: CapCutGuiStepAction;
}): Promise<SessionExecutionHarness> {
	const fixture = await createGuiFixture();
	await writeExecutionSentinel({ fixture });
	const preflight = await preflightFixture({ fixture, mode: "execute" });
	const completePlan = buildCapCutGuiRegressionPlan({
		evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
		preflight,
	});
	const rootBefore = completePlan.steps[0];
	const rootAfter = completePlan.steps.at(-1);
	const adapterStep = completePlan.steps.find(
		({ action }) => action === adapterAction
	);
	const installSteps = completePlan.steps.filter(
		({ action }) => action === "install-bundle"
	);
	if (!rootBefore || !adapterStep || !rootAfter) {
		throw new Error(`Fixture plan is missing ${adapterAction}.`);
	}
	const plan = {
		...completePlan,
		steps: [rootBefore, ...installSteps, adapterStep, rootAfter],
	};
	await mkdir(plan.evidenceDirectory);
	return {
		fixture,
		plan,
		planPath: join(plan.evidenceDirectory, "gui-regression-plan.json"),
	};
}

function quiescentStepResult() {
	return { applicationState: CAPCUT_GUI_ADAPTER_APPLICATION_STATE } as const;
}

function createSuccessfulStepPerformer({
	harness,
}: {
	harness: SessionExecutionHarness;
}): CapCutGuiRegressionExecutionAdapter["performStep"] {
	const installedDraftIds: string[] = [];
	return async ({ step }) => {
		if (step.action === "install-bundle") {
			const bundle = harness.fixture.bundles.find(
				({ caseId }) => caseId === step.caseId
			);
			if (!bundle)
				throw new Error(`Missing fixture bundle for ${step.caseId}.`);
			installedDraftIds.push(bundle.draftId);
			await writeRootDraftIds({
				draftIds: installedDraftIds,
				fixture: harness.fixture,
			});
		}
		await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
		return quiescentStepResult();
	};
}

async function executeHarness({
	adapter,
	harness,
	inspectSession,
}: {
	adapter: CapCutGuiRegressionExecutionAdapter;
	harness: SessionExecutionHarness;
	inspectSession: CapCutGuiSessionInspector;
}) {
	return capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
		adapter,
		inspectApp: harness.fixture.inspectApp,
		inspectSession,
		plan: harness.plan,
		planPath: harness.planPath,
		verifyBundle: harness.fixture.verifyBundle,
	});
}

describe("CapCut GUI runner session boundaries", () => {
	it("refuses a pre-existing CapCut process before invoking the adapter", async () => {
		const harness = await createSessionExecutionHarness({});
		const fixtureInspector = createFixtureSessionInspector();
		const inspectSession = vi.fn(async (options) =>
			fixtureInspector({
				...options,
				expectation: { containerRequired: true, processState: "present" },
			})
		);
		const performStep = vi.fn(async () => quiescentStepResult());

		await expect(
			executeHarness({ adapter: { performStep }, harness, inspectSession })
		).rejects.toThrow("must be completely closed");
		expect(inspectSession).toHaveBeenCalledTimes(1);
		expect(performStep).not.toHaveBeenCalled();
	});

	it("checks the isolated session before and after every adapter step", async () => {
		const harness = await createSessionExecutionHarness({});
		const inspectSession = vi.fn(createFixtureSessionInspector());
		const performStep = vi.fn(createSuccessfulStepPerformer({ harness }));

		const result = await executeHarness({
			adapter: { performStep },
			harness,
			inspectSession,
		});

		expect(inspectSession).toHaveBeenCalledTimes(10);
		expect(
			inspectSession.mock.calls.map(([{ expectation }]) => expectation)
		).toEqual([
			{ containerRequired: false, processState: "absent" },
			{ containerRequired: false, processState: "absent" },
			{ containerRequired: false, processState: "absent" },
			{ containerRequired: false, processState: "absent" },
			{ containerRequired: false, processState: "absent" },
			{ containerRequired: false, processState: "absent" },
			{ containerRequired: false, processState: "absent" },
			{ containerRequired: false, processState: "absent" },
			{ containerRequired: true, processState: "present" },
			{ containerRequired: true, processState: "present" },
		]);
		expect(
			result.stepResults
				.slice(0, 3)
				.map(({ mainProcessGenerationAfter, mainProcessGenerationBefore }) => ({
					after: mainProcessGenerationAfter,
					before: mainProcessGenerationBefore,
				}))
		).toEqual([
			{ after: null, before: null },
			{ after: null, before: null },
			{ after: null, before: null },
		]);
		expect(result.stepResults.at(-1)).toMatchObject({
			mainProcessGenerationAfter: {
				pid: expect.any(Number),
				startIdentity: expect.stringMatching(/^Sat Aug 1 /u),
			},
			mainProcessGenerationBefore: null,
		});
	});

	it("rejects a foreign-UID process immediately after a launch step", async () => {
		const harness = await createSessionExecutionHarness({});
		const fixtureInspector = createFixtureSessionInspector();
		const inspectSession = vi.fn(async (options) => {
			const report = await fixtureInspector(options);
			if (options.expectation.processState !== "present") return report;
			return {
				...report,
				processes: report.processes.map((processReport) => ({
					...processReport,
					uid: options.identity.processUid + 1,
				})),
			};
		});
		const performStep = vi.fn(createSuccessfulStepPerformer({ harness }));

		await expect(
			executeHarness({ adapter: { performStep }, harness, inspectSession })
		).rejects.toThrow("not isolated UID");
		expect(performStep).toHaveBeenCalledTimes(4);
		expect(inspectSession).toHaveBeenCalledTimes(9);
	});

	it("requires the approved main process after a launch step", async () => {
		const harness = await createSessionExecutionHarness({});
		const fixtureInspector = createFixtureSessionInspector();
		const inspectSession = vi.fn(async (options) => {
			const report = await fixtureInspector(options);
			return options.expectation.processState === "present"
				? { ...report, processes: [] }
				: report;
		});
		const performStep = vi.fn(createSuccessfulStepPerformer({ harness }));

		await expect(
			executeHarness({ adapter: { performStep }, harness, inspectSession })
		).rejects.toThrow("main process is not running");
		expect(performStep).toHaveBeenCalledTimes(4);
	});

	it("rejects a main executable vnode outside the planned app identity", async () => {
		const harness = await createSessionExecutionHarness({});
		const fixtureInspector = createFixtureSessionInspector();
		const inspectSession = vi.fn(async (options) => {
			const report = await fixtureInspector(options);
			if (options.expectation.processState !== "present") return report;
			return {
				...report,
				processes: report.processes.map((processReport) => ({
					...processReport,
					executableInode: "0",
				})),
			};
		});
		const performStep = vi.fn(createSuccessfulStepPerformer({ harness }));

		await expect(
			executeHarness({ adapter: { performStep }, harness, inspectSession })
		).rejects.toThrow("vnode does not match the planned application");
		expect(performStep).toHaveBeenCalledTimes(4);
	});

	it("rejects main-process generation drift across running boundaries", async () => {
		const harness = await createSessionExecutionHarness({});
		const fixtureInspector = createFixtureSessionInspector();
		let inspectionCount = 0;
		const inspectSession = vi.fn(async (options) => {
			inspectionCount += 1;
			const report = await fixtureInspector(options);
			if (inspectionCount !== 10) return report;
			return {
				...report,
				processes: report.processes.map((processReport) => ({
					...processReport,
					startIdentity: "Sat Aug 1 12:00:59 2026",
				})),
			};
		});
		const performStep = vi.fn(createSuccessfulStepPerformer({ harness }));

		await expect(
			executeHarness({ adapter: { performStep }, harness, inspectSession })
		).rejects.toThrow("generation drifted at the final boundary");
		expect(performStep).toHaveBeenCalledTimes(4);
		expect(inspectSession).toHaveBeenCalledTimes(10);
	});
});
