import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readRegularFileSnapshot } from "../capcut-e2e/disposable-store-control-file.js";
import { CAPCUT_E2E_SENTINEL_FILE_NAME } from "../capcut-e2e/disposable-store-guard.js";
import { verifyCapCutGuiDraftPhase } from "../capcut-e2e/gui-regression-draft-verification.js";
import {
	CAPCUT_GUI_ADAPTER_APPLICATION_STATE,
	buildCapCutGuiRegressionPlan,
	type CapCutGuiRegressionPlan,
	capCutGuiRegressionRunnerTesting,
} from "../capcut-e2e/gui-regression-runner.js";
import {
	cleanupGuiFixtures,
	createFixtureSessionInspector,
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

async function createInventoryHarness({
	adapterStepCount = 2,
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

describe("CapCut GUI physical store inventory", () => {
	it.each([
		{
			label: "identity with identical bytes",
			mutate: async ({ sentinelPath }: { sentinelPath: string }) => {
				const bytes = await readFile(sentinelPath);
				await rm(sentinelPath);
				await writeFile(sentinelPath, bytes);
			},
		},
		{
			label: "contents",
			mutate: async ({ sentinelPath }: { sentinelPath: string }) => {
				await writeFile(sentinelPath, "{}", "utf8");
			},
		},
		{
			label: "file type",
			mutate: async ({ sentinelPath }: { sentinelPath: string }) => {
				await rm(sentinelPath);
				await mkdir(sentinelPath);
			},
		},
	])("blocks step two after step one changes store sentinel $label", async ({
		mutate,
	}) => {
		const harness = await createInventoryHarness({});
		const sentinelPath = join(
			harness.fixture.canonicalStorePath,
			CAPCUT_E2E_SENTINEL_FILE_NAME
		);
		let stepCalls = 0;
		const performStep = vi.fn(async ({ step }) => {
			stepCalls += 1;
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			if (stepCalls === 1) await mutate({ sentinelPath });
			return quiescentStepResult();
		});

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: harness.fixture.inspectApp,
				inspectSession: createFixtureSessionInspector(),
				plan: harness.plan,
				planPath: harness.planPath,
				verifyBundle: harness.fixture.verifyBundle,
			})
		).rejects.toThrow(/disposable-store sentinel|regular file/iu);
		expect(performStep).toHaveBeenCalledTimes(1);
	});

	it("hash-binds same-size draft file contents between steps", async () => {
		const harness = await createInventoryHarness({});
		const bundle = harness.fixture.bundles[0];
		if (!bundle) throw new Error("Fixture requires a planned bundle.");
		const draftFile = join(
			harness.fixture.canonicalStorePath,
			bundle.draftFolderName,
			"draft_info.json"
		);
		let mutated = false;
		const verifyDraftPhase = vi.fn(async (request) => {
			const receipt = await verifyCapCutGuiDraftPhase(request);
			if (!mutated && request.phase === "installed") {
				const original = await readFile(draftFile);
				const replacement = Buffer.from(original);
				replacement[0] = replacement[0] === 0x7b ? 0x5b : 0x7b;
				await writeFile(draftFile, replacement);
				mutated = true;
			}
			return receipt;
		});
		const performStep = vi.fn(async ({ step }) => {
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			await writeRootDraftIds({
				draftIds: [bundle.draftId],
				fixture: harness.fixture,
			});
			return quiescentStepResult();
		});

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: harness.fixture.inspectApp,
				inspectSession: createFixtureSessionInspector(),
				plan: harness.plan,
				planPath: harness.planPath,
				verifyBundle: harness.fixture.verifyBundle,
				verifyDraftPhase,
			})
		).rejects.toThrow("changed between adapter step boundaries");
		expect(performStep).toHaveBeenCalledTimes(1);
		expect(verifyDraftPhase).toHaveBeenCalledTimes(1);
	});

	it("accepts and hashes a legitimate inventory file larger than 1 MiB", async () => {
		const harness = await createInventoryHarness({ adapterStepCount: 3 });
		const draftIds = harness.fixture.bundles.map(({ draftId }) => draftId);
		const largeFile = join(
			harness.fixture.canonicalStorePath,
			harness.fixture.bundles[0]?.draftFolderName ?? "missing",
			"large-source.bin"
		);
		let installedDraftCount = 0;
		const performStep = vi.fn(async ({ step }) => {
			installedDraftCount += 1;
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			await writeRootDraftIds({
				draftIds: draftIds.slice(0, installedDraftCount),
				fixture: harness.fixture,
			});
			if (installedDraftCount === 1) {
				await writeFile(largeFile, Buffer.alloc(1024 * 1024 + 1, 7));
			}
			return quiescentStepResult();
		});

		const result =
			await capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: harness.fixture.inspectApp,
				inspectSession: createFixtureSessionInspector(),
				plan: harness.plan,
				planPath: harness.planPath,
				verifyBundle: harness.fixture.verifyBundle,
				verifyDraftPhase: async (request) =>
					request.phase === "installed"
						? {
								caseId: request.bundle.caseId,
								directoryCount: 0,
								draftDirectory: join(
									request.rootFingerprint.storePath,
									request.bundle.verification.draftFolderName
								),
								fileCount: 0,
								installedInventorySha256: "0".repeat(64),
								phase: "installed",
								sourceInventorySha256: "0".repeat(64),
								status: "source-byte-equivalent",
							}
						: verifyCapCutGuiDraftPhase(request),
			});
		const entry = result.rootFingerprintAfter.storeInventory.find(
			({ relativePath }) => relativePath.endsWith("large-source.bin")
		);

		expect(entry).toMatchObject({
			bytes: String(1024 * 1024 + 1),
			sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
			type: "file",
		});
	});

	it("keeps the regular-file helper default limit at 1 MiB", async () => {
		const fixture = await createGuiFixture();
		const largeControlFile = join(
			fixture.canonicalHomePath,
			"oversized-control.bin"
		);
		await writeFile(largeControlFile, Buffer.alloc(1024 * 1024 + 1));

		await expect(
			readRegularFileSnapshot({
				label: "Oversized default control file",
				path: largeControlFile,
			})
		).rejects.toThrow("exceeds 1048576 bytes");
	});

	it("fails closed on excessive inventory depth", async () => {
		const harness = await createInventoryHarness({});
		const bundle = harness.fixture.bundles[0];
		if (!bundle) throw new Error("Fixture requires a planned bundle.");
		const nestedDirectory = join(
			harness.fixture.canonicalStorePath,
			bundle.draftFolderName,
			...Array.from({ length: 65 }, (_, index) => `nested-${index}`)
		);
		const performStep = vi.fn(async ({ step }) => {
			await writeStepEvidenceFiles({ evidencePaths: step.evidencePaths });
			await writeRootDraftIds({
				draftIds: [bundle.draftId],
				fixture: harness.fixture,
			});
			await mkdir(nestedDirectory, { recursive: true });
			await writeFile(join(nestedDirectory, "leaf.bin"), "leaf", "utf8");
			return quiescentStepResult();
		});

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: harness.fixture.inspectApp,
				inspectSession: createFixtureSessionInspector(),
				plan: harness.plan,
				planPath: harness.planPath,
				verifyBundle: harness.fixture.verifyBundle,
			})
		).rejects.toThrow("exceeds maximum depth 64");
		expect(performStep).toHaveBeenCalledTimes(1);
	});
});
