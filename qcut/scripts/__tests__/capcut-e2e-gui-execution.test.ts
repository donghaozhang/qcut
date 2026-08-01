import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES,
	inspectCapCutApp,
} from "../capcut-e2e/gui-regression-app-profile.js";
import type { CapCutGuiStepAction } from "../capcut-e2e/gui-regression-contract.js";
import {
	CAPCUT_GUI_ADAPTER_APPLICATION_STATE,
	CAPCUT_GUI_VISUAL_VERIFICATION_REVIEW_GATE,
	buildCapCutGuiRegressionPlan,
	type CapCutGuiRegressionExecutionAdapter,
	type CapCutGuiRegressionPlan,
	capCutGuiRegressionRunnerTesting,
} from "../capcut-e2e/gui-regression-runner.js";
import {
	cleanupGuiFixtures,
	createGuiFixture,
	getFixtureCapCutSystemFontPath,
	type GuiFixture,
	preflightFixture,
	writeExecutionSentinel,
	writeJson,
} from "./capcut-e2e-gui-fixture.js";
import {
	writeRootDraftIds,
	writeStepEvidenceFiles,
} from "./capcut-e2e-gui-store-fixture.js";

afterEach(cleanupGuiFixtures);

interface ExecutionHarness {
	fixture: GuiFixture;
	plan: CapCutGuiRegressionPlan;
	planPath: string;
}

async function createExecutionHarness({
	adapterAction,
	adapterStepCount = 1,
}: {
	adapterAction?: CapCutGuiStepAction;
	adapterStepCount?: number;
}): Promise<ExecutionHarness> {
	const fixture = await createGuiFixture();
	await writeExecutionSentinel({ fixture });
	const preflight = await preflightFixture({ fixture, mode: "execute" });
	const completePlan = buildCapCutGuiRegressionPlan({
		evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
		preflight,
	});
	const rootBeforeStep = completePlan.steps[0];
	const rootAfterStep = completePlan.steps.at(-1);
	if (!rootBeforeStep || !rootAfterStep) {
		throw new Error("Fixture plan must contain root boundary steps.");
	}
	const adapterSteps = completePlan.steps.filter(
		({ action }) =>
			action !== "capture-root-before" && action !== "capture-root-after"
	);
	const selectedSteps = adapterAction
		? [adapterSteps.find(({ action }) => action === adapterAction)]
		: adapterSteps.slice(0, adapterStepCount);
	if (selectedSteps.some((step) => step === undefined)) {
		throw new Error(`Fixture plan is missing adapter action ${adapterAction}.`);
	}
	const plan: CapCutGuiRegressionPlan = {
		...completePlan,
		steps: [
			rootBeforeStep,
			...(selectedSteps as CapCutGuiRegressionPlan["steps"]),
			rootAfterStep,
		],
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

async function executeHarness({
	adapter,
	harness,
	inspectApp = inspectCapCutApp,
	verifyBundle = harness.fixture.verifyBundle,
}: {
	adapter: CapCutGuiRegressionExecutionAdapter;
	harness: ExecutionHarness;
	inspectApp?: typeof inspectCapCutApp;
	verifyBundle?: GuiFixture["verifyBundle"];
}) {
	return capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
		adapter,
		inspectApp,
		plan: harness.plan,
		planPath: harness.planPath,
		verifyBundle,
	});
}

describe("CapCut GUI per-step TOCTOU guard", () => {
	it("revalidates all source bundles and the app before every step", async () => {
		const harness = await createExecutionHarness({ adapterStepCount: 2 });
		const { fixture } = harness;
		const draftIds = fixture.bundles.map(({ draftId }) => draftId);
		const inspectApp = vi.fn(inspectCapCutApp);
		const verifyBundle = vi.fn(fixture.verifyBundle);
		let stepCalls = 0;
		const performStep = vi.fn(async ({ step }) => {
			stepCalls += 1;
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			await writeRootDraftIds({
				draftIds: stepCalls === 1 ? draftIds.slice(0, 1) : draftIds,
				fixture,
			});
			return quiescentStepResult();
		});

		const result = await executeHarness({
			adapter: { performStep },
			harness,
			inspectApp,
			verifyBundle,
		});

		expect(performStep).toHaveBeenCalledTimes(2);
		expect(inspectApp).toHaveBeenCalledTimes(3);
		expect(verifyBundle).toHaveBeenCalledTimes(9);
		expect(result.stepResults).toHaveLength(2);
	});

	it.each([
		{
			expectedMessage: "application changed after plan creation",
			label: "application",
			mutate: async ({ fixture }: { fixture: GuiFixture }) => {
				await writeFile(
					join(fixture.appPath, "Contents", "MacOS", "CapCut"),
					"changed-between-steps",
					"utf8"
				);
			},
		},
		{
			expectedMessage: "complete marker hash no longer matches",
			label: "source bundle",
			mutate: async ({ fixture }: { fixture: GuiFixture }) => {
				await writeFile(
					fixture.bundles[0]?.completeMarkerPath ?? "",
					"changed-between-steps",
					"utf8"
				);
			},
		},
		{
			expectedMessage: "application changed after plan creation",
			label: "Simplified Chinese system font",
			mutate: async ({ fixture }: { fixture: GuiFixture }) => {
				await writeFile(
					getFixtureCapCutSystemFontPath({
						appPath: fixture.appPath,
						fontFileName: CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.simplifiedChinese,
					}),
					"changed-between-steps",
					"utf8"
				);
			},
		},
		{
			expectedMessage: "execution sentinel does not match",
			label: "execution sentinel",
			mutate: async ({ fixture }: { fixture: GuiFixture }) => {
				await writeExecutionSentinel({
					fixture,
					username: "changed-between-steps",
				});
			},
		},
	])("stops after the $label changes between steps", async ({
		expectedMessage,
		mutate,
	}) => {
		const harness = await createExecutionHarness({ adapterStepCount: 2 });
		let stepCalls = 0;
		const performStep = vi.fn(async ({ step }) => {
			stepCalls += 1;
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			if (stepCalls === 1) await mutate({ fixture: harness.fixture });
			return quiescentStepResult();
		});

		await expect(
			executeHarness({ adapter: { performStep }, harness })
		).rejects.toThrow(expectedMessage);
		expect(performStep).toHaveBeenCalledTimes(1);
	});

	it("binds each step start to the preceding step end fingerprint", async () => {
		const harness = await createExecutionHarness({ adapterStepCount: 2 });
		const { fixture } = harness;
		const draftIds = fixture.bundles.map(({ draftId }) => draftId);
		let inspectionCount = 0;
		const inspectApp = vi.fn(async ({ capCutAppPath }) => {
			inspectionCount += 1;
			if (inspectionCount === 2) {
				await writeRootDraftIds({ draftIds: draftIds.slice(0, 2), fixture });
			}
			return inspectCapCutApp({ capCutAppPath });
		});
		const performStep = vi.fn(async ({ step }) => {
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			await writeRootDraftIds({ draftIds: draftIds.slice(0, 1), fixture });
			return quiescentStepResult();
		});

		await expect(
			executeHarness({ adapter: { performStep }, harness, inspectApp })
		).rejects.toThrow("changed between adapter step boundaries");
		expect(performStep).toHaveBeenCalledTimes(1);
	});

	it("rejects an unexpected draft ID immediately after a step", async () => {
		const harness = await createExecutionHarness({});
		const performStep = vi.fn(async ({ step }) => {
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			await writeRootDraftIds({
				draftIds: ["not-from-any-planned-bundle"],
				fixture: harness.fixture,
			});
			return quiescentStepResult();
		});

		await expect(
			executeHarness({ adapter: { performStep }, harness })
		).rejects.toThrow("unplanned draft_id");
		expect(performStep).toHaveBeenCalledTimes(1);
	});

	it("rejects a planned ID backed by an empty draft directory", async () => {
		const harness = await createExecutionHarness({ adapterStepCount: 2 });
		const bundle = harness.fixture.bundles[0];
		if (!bundle) throw new Error("Fixture requires a planned bundle.");
		const draftDirectory = join(
			harness.fixture.canonicalStorePath,
			bundle.draftFolderName
		);
		const performStep = vi.fn(async ({ step }) => {
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			await mkdir(draftDirectory);
			await writeJson({
				path: harness.fixture.rootMetaInfoPath,
				value: {
					all_draft_store: [
						{
							draft_fold_path: draftDirectory,
							draft_id: bundle.draftId,
							draft_root_path: harness.fixture.canonicalStorePath,
						},
					],
					draft_ids: 1,
					root_path: harness.fixture.canonicalStorePath,
				},
			});
			return quiescentStepResult();
		});

		await expect(
			executeHarness({ adapter: { performStep }, harness })
		).rejects.toThrow("non-empty canonical directory");
		expect(performStep).toHaveBeenCalledTimes(1);
	});

	it("rejects a planned ID mapped to the wrong draft directory", async () => {
		const harness = await createExecutionHarness({ adapterStepCount: 2 });
		const bundle = harness.fixture.bundles[0];
		if (!bundle) throw new Error("Fixture requires a planned bundle.");
		const wrongDirectory = join(
			harness.fixture.canonicalStorePath,
			"wrong-draft-directory"
		);
		const performStep = vi.fn(async ({ step }) => {
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			await mkdir(wrongDirectory);
			await writeFile(join(wrongDirectory, "draft_info.json"), "wrong", "utf8");
			await writeJson({
				path: harness.fixture.rootMetaInfoPath,
				value: {
					all_draft_store: [
						{
							draft_fold_path: wrongDirectory,
							draft_id: bundle.draftId,
							draft_root_path: harness.fixture.canonicalStorePath,
						},
					],
					draft_ids: 1,
					root_path: harness.fixture.canonicalStorePath,
				},
			});
			return quiescentStepResult();
		});

		await expect(
			executeHarness({ adapter: { performStep }, harness })
		).rejects.toThrow("does not map");
		expect(performStep).toHaveBeenCalledTimes(1);
	});

	it("blocks step two when step one leaves an orphan store entry", async () => {
		const harness = await createExecutionHarness({ adapterStepCount: 2 });
		let stepCalls = 0;
		const performStep = vi.fn(async ({ step }) => {
			stepCalls += 1;
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			if (stepCalls === 1) {
				await writeFile(
					join(harness.fixture.canonicalStorePath, "orphan.tmp"),
					"not registered",
					"utf8"
				);
			}
			return quiescentStepResult();
		});

		await expect(
			executeHarness({ adapter: { performStep }, harness })
		).rejects.toThrow("orphan or missing top-level entry");
		expect(performStep).toHaveBeenCalledTimes(1);
	});

	it("blocks step two when step one changes root_path", async () => {
		const harness = await createExecutionHarness({ adapterStepCount: 2 });
		let stepCalls = 0;
		const performStep = vi.fn(async ({ step }) => {
			stepCalls += 1;
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			if (stepCalls === 1) {
				await writeJson({
					path: harness.fixture.rootMetaInfoPath,
					value: {
						all_draft_store: [],
						draft_ids: 0,
						root_path: join(harness.fixture.canonicalStorePath, "wrong-root"),
					},
				});
			}
			return quiescentStepResult();
		});

		await expect(
			executeHarness({ adapter: { performStep }, harness })
		).rejects.toThrow("root_path must match the canonical store path");
		expect(performStep).toHaveBeenCalledTimes(1);
	});

	it("requires an explicit quiescent adapter acknowledgement", async () => {
		const harness = await createExecutionHarness({});
		const performStep = vi.fn(async () => undefined);
		const adapter = {
			performStep:
				performStep as unknown as CapCutGuiRegressionExecutionAdapter["performStep"],
		};

		await expect(executeHarness({ adapter, harness })).rejects.toThrow(
			"operation and application are quiescent"
		);
		expect(performStep).toHaveBeenCalledTimes(1);
	});
});

describe("CapCut GUI capture-only evidence semantics", () => {
	it("cannot promote arbitrary non-empty PNG files to visual verification", async () => {
		const harness = await createExecutionHarness({
			adapterAction: "capture-first-open",
		});
		const draftIds = harness.fixture.bundles.map(({ draftId }) => draftId);
		const performStep = vi.fn(async ({ step }) => {
			await writeStepEvidenceFiles({
				content: "this is not a PNG and proves no visual check",
				evidencePaths: step.evidencePaths,
			});
			await writeRootDraftIds({ draftIds, fixture: harness.fixture });
			return quiescentStepResult();
		});

		const result = await executeHarness({
			adapter: { performStep },
			harness,
		});
		const persisted = JSON.parse(
			await readFile(
				join(harness.plan.evidenceDirectory, "gui-regression-result.json"),
				"utf8"
			)
		) as Record<string, unknown>;

		expect(result).toMatchObject({
			evidenceStatus: "capture-only",
			schemaVersion: 2,
			verifiedCheckIds: [],
			visualVerificationReviewGate: CAPCUT_GUI_VISUAL_VERIFICATION_REVIEW_GATE,
			visualVerificationStatus: "unverified",
		});
		expect(result.stepResults[0]?.expectedCheckIds.length).toBeGreaterThan(0);
		expect(result.capturedEvidence).toEqual(
			harness.plan.steps[1]?.evidencePaths.map((path) =>
				expect.objectContaining({
					bytes: expect.any(Number),
					device: expect.any(String),
					evidenceStatus: "captured",
					inode: expect.any(String),
					modifiedAtMilliseconds: expect.any(Number),
					path,
					sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
					visualVerificationStatus: "unverified",
				})
			)
		);
		expect(persisted).toMatchObject({
			evidenceStatus: "capture-only",
			verifiedCheckIds: [],
			visualVerificationStatus: "unverified",
		});
		expect(persisted.visualVerificationStatus).not.toBe("verified");
	});
});
