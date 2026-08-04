import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	CAPCUT_8_1_WRITEBACK_APP_RECEIPT_FILE_NAME,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_FILE_NAME,
	CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_FILE_NAME,
} from "../capcut-e2e/capcut-8-1-writeback-app-receipt-contract";
import {
	advanceCapCut81WritebackAppSession,
	createCapCut81WritebackAppSession,
	type CapCut81WritebackAppSessionDependencies,
} from "../capcut-e2e/capcut-8-1-writeback-app-session";
import {
	CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_FILE_NAME,
	readCapCut81WritebackAppSessionState,
} from "../capcut-e2e/capcut-8-1-writeback-app-session-state";
import type { WritebackRuntime } from "../capcut-e2e/capcut-8-1-writeback-verification-runtime";
import {
	CAPCUT_E2E_SENTINEL_FILE_NAME,
	CAPCUT_E2E_SENTINEL_PURPOSE,
	CAPCUT_E2E_SENTINEL_SCHEMA,
	CAPCUT_E2E_SENTINEL_VERSION,
} from "../capcut-e2e/disposable-store-guard";
import type { CapCutGuiAppReport } from "../capcut-e2e/gui-regression-app-profile";
import {
	CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
	CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT,
	CAPCUT_GUI_APP_SIGNING_AUTHORITIES,
	CAPCUT_GUI_APP_TEAM_IDENTIFIER,
	CAPCUT_GUI_CODESIGN_PATH,
} from "../capcut-e2e/gui-regression-app-signature";
import type { CapCutGuiProcessReport } from "../capcut-e2e/gui-regression-process-inspector";

const PROFILE_ID = "capcut-desktop-8.1-plaintext";
const ACTIVE_MIRROR_TEMPLATES = [
	"draft_info.json",
	"template-2.tmp",
	"Timelines/{timelineId}/draft_info.json",
	"Timelines/{timelineId}/template-2.tmp",
] as const;
const ACTIVE_MIRROR_RELATIVE_PATHS = [
	"draft_info.json",
	"template-2.tmp",
	"Timelines/timeline-1/draft_info.json",
	"Timelines/timeline-1/template-2.tmp",
] as const;

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

function buildDraftBytes({ revision }: { revision: number }): Buffer {
	return Buffer.from(
		JSON.stringify({
			id: "timeline-1",
			tracks: [
				{
					segments: [
						{
							id: "video-1",
							qcut_unknown_sentinel: {
								token: "jyi-015-controlled-sentinel-v1",
								nested: { enabled: true, values: ["alpha", 17, null] },
							},
							revision,
						},
					],
					type: "video",
				},
			],
		}),
		"utf8"
	);
}

async function writeActiveMirrors({
	bytes,
	draftDirectory,
}: {
	bytes: Buffer;
	draftDirectory: string;
}): Promise<void> {
	await Promise.all(
		ACTIVE_MIRROR_RELATIVE_PATHS.map((relativePath) =>
			writeFile(join(draftDirectory, relativePath), bytes)
		)
	);
}

function buildAppReport(): CapCutGuiAppReport {
	const appPath = "/Applications/CapCut 8.1.1.app";
	const executablePath = join(appPath, "Contents", "MacOS", "CapCut");
	const baseIntegrity = {
		bytes: 1024,
		device: "10",
		inode: "20",
		modifiedAtMilliseconds: 1_754_352_000_000,
		sha256: "a".repeat(64),
	};
	return {
		appDirectoryIdentity: {
			device: "10",
			inode: "11",
			modifiedAtMilliseconds: 1_754_352_000_000,
		},
		bundleIdentifier: CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
		bundleVersion: "8.1.1",
		canonicalAppPath: appPath,
		executableIntegrity: baseIntegrity,
		executablePath,
		infoPlistIntegrity: {
			...baseIntegrity,
			inode: "21",
			sha256: "b".repeat(64),
		},
		infoPlistPath: join(appPath, "Contents", "Info.plist"),
		shortVersion: "8.1.1",
		signature: {
			authorities: CAPCUT_GUI_APP_SIGNING_AUTHORITIES,
			cdHash: "c".repeat(40),
			codesignPath: CAPCUT_GUI_CODESIGN_PATH,
			designatedRequirement: CAPCUT_GUI_APP_DESIGNATED_REQUIREMENT,
			identifier: CAPCUT_GUI_APP_BUNDLE_IDENTIFIER,
			teamIdentifier: CAPCUT_GUI_APP_TEAM_IDENTIFIER,
		},
		systemFonts: {
			english: {
				...baseIntegrity,
				inode: "22",
				path: join(
					appPath,
					"Contents",
					"Resources",
					"Font",
					"SystemFont",
					"en.ttf"
				),
			},
			simplifiedChinese: {
				...baseIntegrity,
				inode: "23",
				path: join(
					appPath,
					"Contents",
					"Resources",
					"Font",
					"SystemFont",
					"zh-hans.ttf"
				),
			},
		},
	};
}

function buildProcess({
	app,
	pid,
	startIdentity,
	uid,
}: {
	app: CapCutGuiAppReport;
	pid: number;
	startIdentity: string;
	uid: number;
}): CapCutGuiProcessReport {
	return {
		canonicalExecutablePath: app.executablePath,
		executableDeviceId: app.executableIntegrity.device,
		executableInode: app.executableIntegrity.inode,
		executablePath: app.executablePath,
		pgid: pid,
		pid,
		ppid: 1,
		startIdentity,
		uid,
	};
}

async function createFixture() {
	const canonicalTemporaryDirectory = await realpath(tmpdir());
	const homeDirectory = await mkdtemp(
		join(canonicalTemporaryDirectory, "qcut-capcut-app-session-")
	);
	temporaryDirectories.push(homeDirectory);
	const storeDirectory = join(
		homeDirectory,
		"Movies",
		"CapCut",
		"User Data",
		"Projects",
		"com.lveditor.draft"
	);
	const draftDirectory = join(storeDirectory, "writeback-case");
	await mkdir(join(draftDirectory, "Timelines", "timeline-1"), {
		recursive: true,
	});
	await writeFile(
		join(storeDirectory, CAPCUT_E2E_SENTINEL_FILE_NAME),
		`${JSON.stringify({
			canonicalStorePath: storeDirectory,
			purpose: CAPCUT_E2E_SENTINEL_PURPOSE,
			schema: CAPCUT_E2E_SENTINEL_SCHEMA,
			version: CAPCUT_E2E_SENTINEL_VERSION,
		})}\n`
	);
	await writeFile(
		join(storeDirectory, "root_meta_info.json"),
		`${JSON.stringify({
			all_draft_store: [
				{
					draft_fold_path: draftDirectory,
					draft_root_path: storeDirectory,
				},
			],
			root_path: storeDirectory,
		})}\n`
	);
	const preOpenBytes = buildDraftBytes({ revision: 1 });
	await writeActiveMirrors({ bytes: preOpenBytes, draftDirectory });
	return {
		draftDirectory,
		homeDirectory,
		outputContentSha256: createHash("sha256")
			.update(preOpenBytes)
			.digest("hex"),
		sessionDirectory: join(homeDirectory, "writeback-app-evidence"),
	};
}

function createDependencies({
	app,
	getProcessGeneration,
	homeDirectory,
	timestamps,
}: {
	app: CapCutGuiAppReport;
	getProcessGeneration: () => "absent" | "first" | "second";
	homeDirectory: string;
	timestamps: string[];
}): CapCut81WritebackAppSessionDependencies {
	const uid = process.getuid?.();
	if (uid === undefined) throw new Error("Test requires a POSIX UID.");
	let timestampIndex = 0;
	const runtime = {
		activeContentMirrorTemplates: ACTIVE_MIRROR_TEMPLATES,
		buildActiveContentMirrorPaths: () => ACTIVE_MIRROR_RELATIVE_PATHS,
		profileId: PROFILE_ID,
	} as unknown as WritebackRuntime;
	return {
		inspectApp: async () => app,
		inspectProcesses: async () => {
			const generation = getProcessGeneration();
			if (generation === "absent") return [];
			return [
				buildProcess({
					app,
					pid: generation === "first" ? 101 : 202,
					startIdentity:
						generation === "first" ? "first-start" : "second-start",
					uid,
				}),
			];
		},
		loadRuntime: async () => runtime,
		now: () => {
			const value = timestamps[timestampIndex];
			timestampIndex += 1;
			if (!value) throw new Error("Test timestamp sequence was exhausted.");
			return new Date(value);
		},
		readUserIdentity: () => ({ homeDirectory, uid }),
	};
}

describe("CapCut 8.1 writeback app session", () => {
	it("binds five process and draft boundaries into path-free evidence", async () => {
		const fixture = await createFixture();
		const app = buildAppReport();
		let processGeneration: "absent" | "first" | "second" = "absent";
		const dependencies = createDependencies({
			app,
			getProcessGeneration: () => processGeneration,
			homeDirectory: fixture.homeDirectory,
			timestamps: [
				"2026-08-05T00:00:00.000Z",
				"2026-08-05T01:00:00.000Z",
				"2026-08-05T02:00:00.000Z",
				"2026-08-05T03:00:00.000Z",
				"2026-08-05T04:00:00.000Z",
				"2026-08-05T04:00:01.000Z",
			],
		});
		await createCapCut81WritebackAppSession({
			appPath: app.canonicalAppPath,
			caseId: "writeback-case",
			dedicatedTestHomeDirectory: fixture.homeDirectory,
			dependencies,
			draftDirectory: fixture.draftDirectory,
			outputContentSha256: fixture.outputContentSha256,
			profileId: PROFILE_ID,
			runId: "session-run-1",
			sessionDirectory: fixture.sessionDirectory,
		});

		processGeneration = "first";
		await expect(
			advanceCapCut81WritebackAppSession({
				boundary: "opened",
				dependencies,
				sessionDirectory: fixture.sessionDirectory,
			})
		).resolves.toEqual({ stage: "awaiting-save-and-quit" });
		await writeActiveMirrors({
			bytes: buildDraftBytes({ revision: 2 }),
			draftDirectory: fixture.draftDirectory,
		});
		processGeneration = "absent";
		await advanceCapCut81WritebackAppSession({
			boundary: "saved",
			dependencies,
			sessionDirectory: fixture.sessionDirectory,
		});
		processGeneration = "second";
		await advanceCapCut81WritebackAppSession({
			boundary: "reopened",
			dependencies,
			sessionDirectory: fixture.sessionDirectory,
		});
		processGeneration = "absent";
		const finalResult = await advanceCapCut81WritebackAppSession({
			boundary: "final",
			dependencies,
			sessionDirectory: fixture.sessionDirectory,
		});

		expect(finalResult).toEqual({
			receiptPath: join(
				fixture.sessionDirectory,
				CAPCUT_8_1_WRITEBACK_APP_RECEIPT_FILE_NAME
			),
			stage: "complete",
		});
		const state = await readCapCut81WritebackAppSessionState({
			statePath: join(
				fixture.sessionDirectory,
				CAPCUT_8_1_WRITEBACK_APP_SESSION_STATE_FILE_NAME
			),
		});
		expect(state.stage).toBe("complete");
		const evidenceText = (
			await Promise.all(
				[
					CAPCUT_8_1_WRITEBACK_APP_SESSION_PLAN_FILE_NAME,
					CAPCUT_8_1_WRITEBACK_APP_SESSION_RESULT_FILE_NAME,
					CAPCUT_8_1_WRITEBACK_APP_RECEIPT_FILE_NAME,
				].map((fileName) =>
					readFile(join(fixture.sessionDirectory, fileName), "utf8")
				)
			)
		).join("\n");
		expect(evidenceText).not.toContain(fixture.homeDirectory);
		expect(evidenceText).not.toContain(fixture.draftDirectory);
		expect(evidenceText).not.toContain(app.canonicalAppPath);
	});

	it("rejects a reopen that reuses the original process generation", async () => {
		const fixture = await createFixture();
		const app = buildAppReport();
		let processGeneration: "absent" | "first" | "second" = "absent";
		const dependencies = createDependencies({
			app,
			getProcessGeneration: () => processGeneration,
			homeDirectory: fixture.homeDirectory,
			timestamps: [
				"2026-08-05T00:00:00.000Z",
				"2026-08-05T01:00:00.000Z",
				"2026-08-05T02:00:00.000Z",
				"2026-08-05T03:00:00.000Z",
			],
		});
		await createCapCut81WritebackAppSession({
			appPath: app.canonicalAppPath,
			caseId: "writeback-case",
			dedicatedTestHomeDirectory: fixture.homeDirectory,
			dependencies,
			draftDirectory: fixture.draftDirectory,
			outputContentSha256: fixture.outputContentSha256,
			profileId: PROFILE_ID,
			runId: "session-run-2",
			sessionDirectory: fixture.sessionDirectory,
		});
		processGeneration = "first";
		await advanceCapCut81WritebackAppSession({
			boundary: "opened",
			dependencies,
			sessionDirectory: fixture.sessionDirectory,
		});
		processGeneration = "absent";
		await advanceCapCut81WritebackAppSession({
			boundary: "saved",
			dependencies,
			sessionDirectory: fixture.sessionDirectory,
		});
		processGeneration = "first";

		await expect(
			advanceCapCut81WritebackAppSession({
				boundary: "reopened",
				dependencies,
				sessionDirectory: fixture.sessionDirectory,
			})
		).rejects.toThrow("distinct process generation");
	});

	it("rejects a draft directory replaced between app boundaries", async () => {
		const fixture = await createFixture();
		const app = buildAppReport();
		const dependencies = createDependencies({
			app,
			getProcessGeneration: () => "first",
			homeDirectory: fixture.homeDirectory,
			timestamps: ["2026-08-05T00:00:00.000Z"],
		});
		await createCapCut81WritebackAppSession({
			appPath: app.canonicalAppPath,
			caseId: "writeback-case",
			dedicatedTestHomeDirectory: fixture.homeDirectory,
			dependencies: {
				...dependencies,
				inspectProcesses: async () => [],
			},
			draftDirectory: fixture.draftDirectory,
			outputContentSha256: fixture.outputContentSha256,
			profileId: PROFILE_ID,
			runId: "session-run-3",
			sessionDirectory: fixture.sessionDirectory,
		});
		await rename(fixture.draftDirectory, `${fixture.draftDirectory}.original`);
		await mkdir(fixture.draftDirectory);

		await expect(
			advanceCapCut81WritebackAppSession({
				boundary: "opened",
				dependencies,
				sessionDirectory: fixture.sessionDirectory,
			})
		).rejects.toThrow("directory identity changed");
	});
});
