import { createHash } from "node:crypto";
import {
	mkdir,
	readFile,
	rm,
	symlink,
	truncate,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectCapCutApp } from "../capcut-e2e/gui-regression-app-profile.js";
import { CAPCUT_GUI_EVIDENCE_MAXIMUM_BYTES } from "../capcut-e2e/gui-regression-evidence.js";
import {
	CAPCUT_GUI_ADAPTER_APPLICATION_STATE,
	buildCapCutGuiRegressionPlan,
	type CapCutGuiRegressionPlan,
	capCutGuiRegressionRunnerTesting,
} from "../capcut-e2e/gui-regression-runner.js";
import {
	cleanupGuiFixtures,
	createGuiFixture,
	type GuiFixture,
	preflightFixture,
	writeExecutionSentinel,
} from "./capcut-e2e-gui-fixture.js";
import {
	writeRootDraftIds,
	writeStepEvidenceFiles,
} from "./capcut-e2e-gui-store-fixture.js";

afterEach(cleanupGuiFixtures);

async function createEvidenceHarness({
	adapterStepCount = 1,
}: {
	adapterStepCount?: number;
}): Promise<{
	fixture: GuiFixture;
	plan: CapCutGuiRegressionPlan;
	planPath: string;
}> {
	const fixture = await createGuiFixture();
	await writeExecutionSentinel({ fixture });
	const preflight = await preflightFixture({ fixture, mode: "execute" });
	const completePlan = buildCapCutGuiRegressionPlan({
		evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
		preflight,
	});
	const rootBefore = completePlan.steps[0];
	const rootAfter = completePlan.steps.at(-1);
	if (!rootBefore || !rootAfter) {
		throw new Error("Fixture plan must contain root boundary steps.");
	}
	const adapterSteps = completePlan.steps
		.filter(
			({ action }) =>
				action !== "capture-root-before" && action !== "capture-root-after"
		)
		.slice(0, adapterStepCount);
	const plan = {
		...completePlan,
		steps: [rootBefore, ...adapterSteps, rootAfter],
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

describe("CapCut GUI immutable evidence records", () => {
	it("records same-FD snapshot identity and SHA-256 in the result", async () => {
		const harness = await createEvidenceHarness({});
		const content = "captured evidence is not visual verification";
		const draftIds = harness.fixture.bundles.map(({ draftId }) => draftId);
		const performStep = vi.fn(async ({ step }) => {
			await writeStepEvidenceFiles({
				content,
				evidencePaths: step.evidencePaths,
			});
			await writeRootDraftIds({ draftIds, fixture: harness.fixture });
			return quiescentStepResult();
		});

		const result =
			await capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: inspectCapCutApp,
				plan: harness.plan,
				planPath: harness.planPath,
				verifyBundle: harness.fixture.verifyBundle,
			});
		const record = result.capturedEvidence[0];
		const persisted = JSON.parse(
			await readFile(
				join(harness.plan.evidenceDirectory, "gui-regression-result.json"),
				"utf8"
			)
		) as { capturedEvidence?: unknown };

		expect(record).toMatchObject({
			bytes: Buffer.byteLength(content),
			device: expect.any(String),
			evidenceStatus: "captured",
			inode: expect.any(String),
			modifiedAtMilliseconds: expect.any(Number),
			sha256: createHash("sha256").update(content, "utf8").digest("hex"),
			visualVerificationStatus: "unverified",
		});
		expect(persisted.capturedEvidence).toEqual(result.capturedEvidence);
	});

	it("refuses result persistence after captured evidence is replaced", async () => {
		const harness = await createEvidenceHarness({ adapterStepCount: 2 });
		const draftIds = harness.fixture.bundles.map(({ draftId }) => draftId);
		const firstEvidencePath = harness.plan.steps[1]?.evidencePaths[0];
		if (!firstEvidencePath) throw new Error("Fixture requires evidence.");
		let stepCalls = 0;
		const performStep = vi.fn(async ({ step }) => {
			stepCalls += 1;
			await writeStepEvidenceFiles({
				content: "same bytes",
				evidencePaths: step.evidencePaths,
			});
			if (stepCalls === 1) {
				await writeRootDraftIds({ draftIds, fixture: harness.fixture });
			}
			if (stepCalls === 2) {
				const bytes = await readFile(firstEvidencePath);
				await rm(firstEvidencePath);
				await writeFile(firstEvidencePath, bytes);
			}
			return quiescentStepResult();
		});

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: inspectCapCutApp,
				plan: harness.plan,
				planPath: harness.planPath,
				verifyBundle: harness.fixture.verifyBundle,
			})
		).rejects.toThrow("evidence changed after capture");
		expect(performStep).toHaveBeenCalledTimes(2);
	});

	it.skipIf(process.platform === "win32")(
		"rejects symlink evidence",
		async () => {
			const harness = await createEvidenceHarness({});
			const evidencePath = harness.plan.steps[1]?.evidencePaths[0];
			if (!evidencePath) throw new Error("Fixture requires evidence.");
			const targetPath = join(harness.fixture.canonicalHomePath, "target.bin");
			const draftIds = harness.fixture.bundles.map(({ draftId }) => draftId);
			const performStep = vi.fn(async () => {
				await mkdir(dirname(evidencePath), { recursive: true });
				await writeFile(targetPath, "target", "utf8");
				await symlink(targetPath, evidencePath, "file");
				await writeRootDraftIds({ draftIds, fixture: harness.fixture });
				return quiescentStepResult();
			});

			await expect(
				capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
					adapter: { performStep },
					inspectApp: inspectCapCutApp,
					plan: harness.plan,
					planPath: harness.planPath,
					verifyBundle: harness.fixture.verifyBundle,
				})
			).rejects.toThrow("must not be a symbolic link");
			expect(performStep).toHaveBeenCalledTimes(1);
		}
	);

	it("rejects empty evidence", async () => {
		const harness = await createEvidenceHarness({});
		const evidencePath = harness.plan.steps[1]?.evidencePaths[0];
		if (!evidencePath) throw new Error("Fixture requires evidence.");
		const draftIds = harness.fixture.bundles.map(({ draftId }) => draftId);
		const performStep = vi.fn(async () => {
			await mkdir(dirname(evidencePath), { recursive: true });
			await writeFile(evidencePath, "", "utf8");
			await writeRootDraftIds({ draftIds, fixture: harness.fixture });
			return quiescentStepResult();
		});

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: inspectCapCutApp,
				plan: harness.plan,
				planPath: harness.planPath,
				verifyBundle: harness.fixture.verifyBundle,
			})
		).rejects.toThrow("evidence must be non-empty");
		expect(performStep).toHaveBeenCalledTimes(1);
	});

	it("rejects evidence larger than the bounded snapshot limit", async () => {
		const harness = await createEvidenceHarness({});
		const evidencePath = harness.plan.steps[1]?.evidencePaths[0];
		if (!evidencePath) throw new Error("Fixture requires evidence.");
		const draftIds = harness.fixture.bundles.map(({ draftId }) => draftId);
		const performStep = vi.fn(async () => {
			await mkdir(dirname(evidencePath), { recursive: true });
			await writeFile(evidencePath, "", "utf8");
			await truncate(evidencePath, CAPCUT_GUI_EVIDENCE_MAXIMUM_BYTES + 1);
			await writeRootDraftIds({ draftIds, fixture: harness.fixture });
			return quiescentStepResult();
		});

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: inspectCapCutApp,
				plan: harness.plan,
				planPath: harness.planPath,
				verifyBundle: harness.fixture.verifyBundle,
			})
		).rejects.toThrow(`exceeds ${CAPCUT_GUI_EVIDENCE_MAXIMUM_BYTES} bytes`);
		expect(performStep).toHaveBeenCalledTimes(1);
	});
});
