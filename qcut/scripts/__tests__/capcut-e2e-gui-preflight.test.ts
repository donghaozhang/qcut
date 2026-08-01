import { chmod, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { preflightDisposableCapCutStore } from "../capcut-e2e/disposable-store-guard.js";
import {
	CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
	CAPCUT_GUI_APP_VERSION,
	CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES,
} from "../capcut-e2e/gui-regression-app-profile.js";
import {
	CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT,
	CAPCUT_GUI_APP_TEAM_IDENTIFIER,
	CAPCUT_GUI_CODESIGN_PATH,
} from "../capcut-e2e/gui-regression-app-signature.js";
import { CAPCUT_GUI_EXECUTION_CONFIRMATION } from "../capcut-e2e/gui-regression-execution-sentinel.js";
import { readOwnerUid } from "../capcut-e2e/gui-regression-identity.js";
import { capCutGuiRegressionPreflightTesting } from "../capcut-e2e/gui-regression-preflight.js";
import {
	cleanupGuiFixtures,
	createGuiFixture,
	createIdentity,
	createInfoPlist,
	getFixtureCapCutSystemFontPath,
	getProcessUid,
	preflightFixture,
	preflightOptions,
	writeExecutionSentinel,
} from "./capcut-e2e-gui-fixture.js";

afterEach(cleanupGuiFixtures);

describe("CapCut GUI isolated-session identity", () => {
	it("rejects the peter login before invoking the bundle verifier", async () => {
		const fixture = await createGuiFixture();
		const verifyBundle = vi.fn(fixture.verifyBundle);

		await expect(
			preflightFixture({
				fixture,
				identity: createIdentity({
					homePath: fixture.canonicalHomePath,
					username: "peter",
				}),
				verifyBundle,
			})
		).rejects.toThrow("refuses the peter login");
		expect(verifyBundle).not.toHaveBeenCalled();
	});

	it("rejects a fake HOME when the account database home differs", async () => {
		const fixture = await createGuiFixture();
		const identity = createIdentity({ homePath: fixture.canonicalHomePath });
		identity.userInfoHomePath = join(fixture.canonicalHomePath, "actual-home");

		await expect(preflightFixture({ fixture, identity })).rejects.toThrow(
			"Changing HOME is not isolation"
		);
	});

	it.each([
		"/Users/peter",
		"/tmp/qcut-fake-home",
	])("rejects inherited environment HOME %s", async (environmentHomePath) => {
		const fixture = await createGuiFixture();
		const identity = createIdentity({ homePath: fixture.canonicalHomePath });
		identity.environmentHomePath = environmentHomePath;

		await expect(preflightFixture({ fixture, identity })).rejects.toThrow(
			"Environment HOME must match"
		);
	});

	it("rejects a missing environment HOME", async () => {
		const fixture = await createGuiFixture();
		const identity = createIdentity({ homePath: fixture.canonicalHomePath });
		identity.environmentHomePath = null;

		await expect(preflightFixture({ fixture, identity })).rejects.toThrow(
			"Environment HOME is required"
		);
	});

	it("rejects a username record whose uid differs from the effective uid", async () => {
		const fixture = await createGuiFixture();
		const identity = createIdentity({ homePath: fixture.canonicalHomePath });
		identity.accountUid += 1;

		await expect(preflightFixture({ fixture, identity })).rejects.toThrow(
			"could not verify the process account"
		);
	});

	it("rejects a store or control file owned by another uid", async () => {
		const fixture = await createGuiFixture();
		const readOwner: typeof readOwnerUid = async ({ path }) => {
			if (path === fixture.canonicalStorePath) return getProcessUid() + 1;
			return readOwnerUid({ path });
		};

		await expect(preflightFixture({ fixture, readOwner })).rejects.toThrow(
			"must be owned by process UID"
		);
	});
});

describe("CapCut GUI application and bundle verification", () => {
	it("requires exact CapCut bundle ID and version 8.1.1", () => {
		const parse = capCutGuiRegressionPreflightTesting.parseCapCutAppMetadata;
		expect(parse({ infoPlistText: createInfoPlist() })).toMatchObject({
			bundleIdentifier: CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
			bundleVersion: "8.1.1",
			shortVersion: "8.1.1",
		});
		expect(() =>
			parse({
				infoPlistText: createInfoPlist({ shortVersion: "8.1.2" }),
			})
		).toThrow("requires exact version 8.1.1");
		expect(() =>
			parse({
				infoPlistText: createInfoPlist({ bundleIdentifier: "fake.capcut" }),
			})
		).toThrow("requires bundle ID");
	});

	it("rejects a non-executable CapCut binary", async () => {
		const fixture = await createGuiFixture();
		await chmod(join(fixture.appPath, "Contents", "MacOS", "CapCut"), 0o644);

		await expect(preflightFixture({ fixture })).rejects.toThrow(
			"CapCut executable is not executable"
		);
	});

	it.each([
		CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.english,
		CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.simplifiedChinese,
	])("requires the bundled %s system font", async (fontFileName) => {
		const fixture = await createGuiFixture();
		await rm(
			getFixtureCapCutSystemFontPath({ appPath: fixture.appPath, fontFileName })
		);

		await expect(preflightFixture({ fixture })).rejects.toThrow("system font");
	});

	it("rejects a symlinked bundled system font", async () => {
		const fixture = await createGuiFixture();
		const fontPath = getFixtureCapCutSystemFontPath({
			appPath: fixture.appPath,
			fontFileName: CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.simplifiedChinese,
		});
		await rm(fontPath);
		await symlink(
			getFixtureCapCutSystemFontPath({
				appPath: fixture.appPath,
				fontFileName: CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.english,
			}),
			fontPath,
			"file"
		);

		await expect(preflightFixture({ fixture })).rejects.toThrow(
			"must not be a symbolic link"
		);
	});

	it("rejects bundle ownership mismatch and symlinked bundle paths", async () => {
		const fixture = await createGuiFixture();
		const inspect = capCutGuiRegressionPreflightTesting.inspectBundleRun;

		await expect(
			inspect({
				bundleManifestPath: fixture.bundleManifestPath,
				expectedOwnerUid: getProcessUid() + 1,
				storePath: fixture.canonicalStorePath,
				verifyBundle: fixture.verifyBundle,
			})
		).rejects.toThrow("manifest must be owned");

		if (process.platform !== "win32") {
			const aliasPath = join(
				fixture.canonicalHomePath,
				"bundle-manifest-alias.json"
			);
			await symlink(fixture.bundleManifestPath, aliasPath, "file");
			await expect(
				inspect({
					bundleManifestPath: aliasPath,
					expectedOwnerUid: getProcessUid(),
					storePath: fixture.canonicalStorePath,
					verifyBundle: fixture.verifyBundle,
				})
			).rejects.toThrow("must not be a symbolic link");
		}
	});

	it("rehashes control files and rejects a tampered complete marker", async () => {
		const fixture = await createGuiFixture();
		await writeFile(fixture.bundles[0]?.completeMarkerPath ?? "", "tampered");

		await expect(preflightFixture({ fixture })).rejects.toThrow(
			"complete marker hash no longer matches"
		);
	});

	it("requires every bundle to pass the existing migration verifier", async () => {
		const fixture = await createGuiFixture();
		const verifyBundle = vi.fn(async () => {
			throw new Error("verified asset hash mismatch");
		});

		await expect(preflightFixture({ fixture, verifyBundle })).rejects.toThrow(
			"verified asset hash mismatch"
		);
		expect(verifyBundle).toHaveBeenCalled();
	});

	it("binds verifier output and control-file hashes into the report", async () => {
		const fixture = await createGuiFixture();
		const verifyBundle = vi.fn(fixture.verifyBundle);
		const report = await preflightFixture({ fixture, verifyBundle });

		expect(verifyBundle).toHaveBeenCalledTimes(3);
		expect(report.app).toMatchObject({
			executableIntegrity: {
				sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
			},
			executablePath: join(fixture.appPath, "Contents", "MacOS", "CapCut"),
			signature: {
				cdHash: expect.stringMatching(/^[a-f0-9]{40}$/u),
				codesignPath: CAPCUT_GUI_CODESIGN_PATH,
				designatedRequirement: CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT,
				identifier: CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
				teamIdentifier: CAPCUT_GUI_APP_TEAM_IDENTIFIER,
			},
			systemFonts: {
				english: {
					bytes: expect.any(Number),
					device: expect.any(String),
					inode: expect.any(String),
					modifiedAtMilliseconds: expect.any(Number),
					path: getFixtureCapCutSystemFontPath({
						appPath: fixture.appPath,
						fontFileName: CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.english,
					}),
					sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
				},
				simplifiedChinese: {
					bytes: expect.any(Number),
					device: expect.any(String),
					inode: expect.any(String),
					modifiedAtMilliseconds: expect.any(Number),
					path: getFixtureCapCutSystemFontPath({
						appPath: fixture.appPath,
						fontFileName: CAPCUT_GUI_SYSTEM_FONT_FILE_NAMES.simplifiedChinese,
					}),
					sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
				},
			},
		});
		expect(report.bundleRun.bundles[0]?.verification).toMatchObject({
			completeMarker: { sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) },
			content: fixture.bundles[0]?.content,
			copiedAssets: [
				expect.objectContaining({
					sha256: fixture.bundles[0]?.copiedAssets[0]?.sha256,
				}),
			],
			migrationManifest: {
				sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
			},
			outputDirectory: fixture.bundles[0]?.bundleDirectory,
		});
	});
});

describe("CapCut GUI execute authorization", () => {
	it("requires both the execute flag and the bound execution sentinel", async () => {
		const fixture = await createGuiFixture();
		const identity = createIdentity({ homePath: fixture.canonicalHomePath });
		const baseRuntime = {
			identity,
			inspectApp: fixture.inspectApp,
			platform: "darwin" as const,
			preflightStore: preflightDisposableCapCutStore,
			readOwner: readOwnerUid,
			verifyBundle: fixture.verifyBundle,
		};

		await expect(
			capCutGuiRegressionPreflightTesting.preflightWithRuntime({
				options: preflightOptions({ fixture, mode: "execute" }),
				runtime: baseRuntime,
			})
		).rejects.toThrow("exact confirmation flag");
		await expect(
			preflightFixture({ fixture, identity, mode: "execute" })
		).rejects.toThrow("execution sentinel");

		await writeExecutionSentinel({ fixture });
		const report = await preflightFixture({
			fixture,
			identity,
			mode: "execute",
		});
		expect(report.executionSentinel).toMatchObject({
			runId: fixture.runId,
			uid: getProcessUid(),
			username: "qcut-e2e",
		});
		expect(report.mode).toBe("execute");
		expect(CAPCUT_GUI_EXECUTION_CONFIRMATION).toContain("ISOLATED");
	});
});
