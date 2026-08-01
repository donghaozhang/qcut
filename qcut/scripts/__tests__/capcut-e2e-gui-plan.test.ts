import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectCapCutApp } from "../capcut-e2e/gui-regression-app-profile.js";
import { CAPCUT_GUI_CASE_EXPECTATIONS } from "../capcut-e2e/gui-regression-contract.js";
import { assertRootFingerprintUnchanged } from "../capcut-e2e/gui-regression-evidence.js";
import {
	CAPCUT_GUI_ADAPTER_APPLICATION_STATE,
	buildCapCutGuiRegressionPlan,
	capCutGuiRegressionRunnerTesting,
} from "../capcut-e2e/gui-regression-runner.js";
import {
	cleanupGuiFixtures,
	createInfoPlist,
	createGuiFixture,
	getFixtureCapCutSystemFontPath,
	preflightFixture,
	writeFixtureCapCutApp,
	writeExecutionSentinel,
	writeJson,
} from "./capcut-e2e-gui-fixture.js";
import { CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES } from "../capcut-e2e/gui-regression-app-profile.js";

afterEach(cleanupGuiFixtures);

function quiescentStepResult() {
	return { applicationState: CAPCUT_GUI_ADAPTER_APPLICATION_STATE } as const;
}

describe("CapCut GUI regression plan", () => {
	it("orders install, first-open, save/quit, reopen, export, and fingerprints", async () => {
		const fixture = await createGuiFixture();
		const preflight = await preflightFixture({ fixture });
		const plan = buildCapCutGuiRegressionPlan({
			createdAt: "2026-08-01T00:00:00.000Z",
			evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
			preflight,
		});
		const actions = plan.steps.map(({ action }) => action);

		expect(plan.mode).toBe("dry-run");
		expect(actions.slice(0, 4)).toEqual([
			"capture-root-before",
			"install-bundle",
			"install-bundle",
			"install-bundle",
		]);
		expect(actions.slice(4, 12)).toEqual([
			"open-draft-first-time",
			"capture-first-open",
			"save-and-quit",
			"reopen-draft",
			"capture-reopen",
			"export-video",
			"capture-export",
			"quit",
		]);
		expect(actions.at(-1)).toBe("capture-root-after");
		expect(plan.steps.map(({ sequence }) => sequence)).toEqual(
			Array.from({ length: plan.steps.length }, (_, index) => index + 1)
		);
		expect(plan.rootFingerprints.before).toMatchObject({
			draftCount: 0,
			path: fixture.rootMetaInfoPath,
		});
		expect(plan.rootFingerprints.after.expectedDraftIds).toEqual(
			fixture.bundles.map(({ draftId }) => draftId)
		);
		expect(plan.bundleRun.bundles[0]?.verification.content).toEqual(
			fixture.bundles[0]?.content
		);
	});

	it("binds every required native text, caption, sticker, dissolve, mask, and LUT check to evidence", async () => {
		const fixture = await createGuiFixture();
		const preflight = await preflightFixture({ fixture });
		const plan = buildCapCutGuiRegressionPlan({
			evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
			preflight,
		});
		const expectedCheckIds = CAPCUT_GUI_CASE_EXPECTATIONS.flatMap(
			({ checks }) => checks.map(({ id }) => id)
		).sort();
		const plannedCheckIds = plan.steps
			.flatMap(({ expectedCheckIds: ids }) => ids)
			.sort();

		expect(plannedCheckIds).toEqual(expectedCheckIds);
		expect(plannedCheckIds).toEqual(
			expect.arrayContaining([
				"native-title-cjk-visible",
				"native-caption-cjk-visible",
				"transparent-sticker-reopen",
				"dissolve-mid-frame",
				"ellipse-mask-visible",
				"invert-lut-visible",
			])
		);
	});

	it("does not mutate the store while constructing the dry-run plan", async () => {
		const fixture = await createGuiFixture();
		const before = await readFile(fixture.rootMetaInfoPath, "utf8");
		const preflight = await preflightFixture({ fixture });
		buildCapCutGuiRegressionPlan({
			evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
			preflight,
		});

		expect(await readFile(fixture.rootMetaInfoPath, "utf8")).toBe(before);
	});
});

describe("CapCut GUI execute TOCTOU guard", () => {
	it("refuses a changed root fingerprint before invoking the adapter", async () => {
		const fixture = await createGuiFixture();
		await writeExecutionSentinel({ fixture });
		const preflight = await preflightFixture({ fixture, mode: "execute" });
		const plan = buildCapCutGuiRegressionPlan({
			evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
			preflight,
		});
		await mkdir(plan.evidenceDirectory);
		await writeJson({
			path: fixture.rootMetaInfoPath,
			value: {
				all_draft_store: [{ draft_id: "unexpected-draft" }],
				draft_ids: 1,
				root_path: fixture.canonicalStorePath,
			},
		});
		const performStep = vi.fn(async () => quiescentStepResult());

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: inspectCapCutApp,
				plan,
				planPath: join(plan.evidenceDirectory, "gui-regression-plan.json"),
				verifyBundle: fixture.verifyBundle,
			})
		).rejects.toThrow("unplanned draft_id");
		expect(performStep).not.toHaveBeenCalled();
	});

	it("reverifies all planned bundles before invoking the adapter", async () => {
		const fixture = await createGuiFixture();
		await writeExecutionSentinel({ fixture });
		const preflight = await preflightFixture({ fixture, mode: "execute" });
		const plan = buildCapCutGuiRegressionPlan({
			evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
			preflight,
		});
		await mkdir(plan.evidenceDirectory);
		await writeFile(
			fixture.bundles[0]?.completeMarkerPath ?? "",
			"changed after plan"
		);
		const performStep = vi.fn(async () => quiescentStepResult());

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: inspectCapCutApp,
				plan,
				planPath: join(plan.evidenceDirectory, "gui-regression-plan.json"),
				verifyBundle: fixture.verifyBundle,
			})
		).rejects.toThrow("complete marker hash no longer matches");
		expect(performStep).not.toHaveBeenCalled();
	});

	it("rechecks the CapCut application before invoking the adapter", async () => {
		const fixture = await createGuiFixture();
		await writeExecutionSentinel({ fixture });
		const preflight = await preflightFixture({ fixture, mode: "execute" });
		const plan = buildCapCutGuiRegressionPlan({
			evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
			preflight,
		});
		await mkdir(plan.evidenceDirectory);
		await writeFile(
			join(fixture.appPath, "Contents", "Info.plist"),
			createInfoPlist({ shortVersion: "8.1.2" }),
			"utf8"
		);
		const performStep = vi.fn(async () => quiescentStepResult());

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: inspectCapCutApp,
				plan,
				planPath: join(plan.evidenceDirectory, "gui-regression-plan.json"),
				verifyBundle: fixture.verifyBundle,
			})
		).rejects.toThrow("requires exact version 8.1.1");
		expect(performStep).not.toHaveBeenCalled();
	});

	it("rejects an app-bundle replacement even with the same version", async () => {
		const fixture = await createGuiFixture();
		await writeExecutionSentinel({ fixture });
		const preflight = await preflightFixture({ fixture, mode: "execute" });
		const plan = buildCapCutGuiRegressionPlan({
			evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
			preflight,
		});
		await mkdir(plan.evidenceDirectory);
		await rm(fixture.appPath, { recursive: true });
		await writeFixtureCapCutApp({ appPath: fixture.appPath });
		const performStep = vi.fn(async () => quiescentStepResult());

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: inspectCapCutApp,
				plan,
				planPath: join(plan.evidenceDirectory, "gui-regression-plan.json"),
				verifyBundle: fixture.verifyBundle,
			})
		).rejects.toThrow("application changed after plan creation");
		expect(performStep).not.toHaveBeenCalled();
	});

	it("rejects system font drift with an unchanged app version", async () => {
		const fixture = await createGuiFixture();
		await writeExecutionSentinel({ fixture });
		const preflight = await preflightFixture({ fixture, mode: "execute" });
		const plan = buildCapCutGuiRegressionPlan({
			evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
			preflight,
		});
		await mkdir(plan.evidenceDirectory);
		await writeFile(
			getFixtureCapCutSystemFontPath({
				appPath: fixture.appPath,
				fontFileName: CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.simplifiedChinese,
			}),
			"changed-capcut-zh-hans-font",
			"utf8"
		);
		const performStep = vi.fn(async () => quiescentStepResult());

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: inspectCapCutApp,
				plan,
				planPath: join(plan.evidenceDirectory, "gui-regression-plan.json"),
				verifyBundle: fixture.verifyBundle,
			})
		).rejects.toThrow("application changed after plan creation");
		expect(performStep).not.toHaveBeenCalled();
	});

	it("rejects executable replacement with an unchanged plist and version", async () => {
		const fixture = await createGuiFixture();
		await writeExecutionSentinel({ fixture });
		const preflight = await preflightFixture({ fixture, mode: "execute" });
		const plan = buildCapCutGuiRegressionPlan({
			evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
			preflight,
		});
		await mkdir(plan.evidenceDirectory);
		await writeFile(
			join(fixture.appPath, "Contents", "MacOS", "CapCut"),
			"changed-capcut-executable",
			{ encoding: "utf8", mode: 0o755 }
		);
		const performStep = vi.fn(async () => quiescentStepResult());

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: inspectCapCutApp,
				plan,
				planPath: join(plan.evidenceDirectory, "gui-regression-plan.json"),
				verifyBundle: fixture.verifyBundle,
			})
		).rejects.toThrow("application changed after plan creation");
		expect(performStep).not.toHaveBeenCalled();
	});

	it("rechecks the bound execution sentinel before invoking the adapter", async () => {
		const fixture = await createGuiFixture();
		await writeExecutionSentinel({ fixture });
		const preflight = await preflightFixture({ fixture, mode: "execute" });
		const plan = buildCapCutGuiRegressionPlan({
			evidenceDirectory: join(fixture.canonicalHomePath, "gui-evidence"),
			preflight,
		});
		await mkdir(plan.evidenceDirectory);
		await writeExecutionSentinel({ fixture, username: "changed-user" });
		const performStep = vi.fn(async () => quiescentStepResult());

		await expect(
			capCutGuiRegressionRunnerTesting.executeCapCutGuiRegression({
				adapter: { performStep },
				inspectApp: inspectCapCutApp,
				plan,
				planPath: join(plan.evidenceDirectory, "gui-regression-plan.json"),
				verifyBundle: fixture.verifyBundle,
			})
		).rejects.toThrow("execution sentinel does not match");
		expect(performStep).not.toHaveBeenCalled();
	});

	it.each([
		["path", "/changed/root_meta_info.json"],
		["sha256", "changed"],
		["bytes", 999],
		["inode", "999"],
		["modifiedAtMilliseconds", 999],
	] as const)("compares the %s field exactly", (field, changedValue) => {
		const expected = {
			bytes: 1,
			draftCount: 0,
			draftIds: [],
			inode: "1",
			modifiedAtMilliseconds: 1,
			path: "/root_meta_info.json",
			sha256: "hash",
			storeInventory: [],
			storeInventorySha256: "inventory-hash",
			storePath: "/store",
			storeSentinelIntegrity: {
				bytes: 1,
				device: "1",
				inode: "1",
				modifiedAtMilliseconds: 1,
				path: "/store/.sentinel",
				sha256: "sentinel-hash",
			},
		};
		const actual = { ...expected, [field]: changedValue };

		expect(() => assertRootFingerprintUnchanged({ actual, expected })).toThrow(
			"changed after preflight"
		);
	});
});
