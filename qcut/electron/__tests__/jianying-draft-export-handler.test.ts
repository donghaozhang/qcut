import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { CapCutAppRunningError } from "../capcut-8-1-install-guard.js";
import type { RuntimeInstallerOptions } from "../capcut-8-1-install-handler.js";
import {
	CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
	CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
	CAPCUT_8_1_MIGRATION_PLAN_CHANNEL,
} from "../jianying-draft-export-contract.js";

// The handler composes these with path.join, so the expectations have to as
// well: hardcoded forward slashes pass on POSIX and fail on Windows.
const DOCUMENTS_DIRECTORY = "/documents";
const CAPCUT_DRAFT_EXPORT_DIRECTORY = join(
	DOCUMENTS_DIRECTORY,
	"QCut",
	"Exports",
	"CapCut Drafts"
);
const CAPCUT_ALLOWED_SOURCE_DIRECTORY = join(
	DOCUMENTS_DIRECTORY,
	"QCut",
	"Projects"
);
const CAPCUT_DRAFT_STORE_DIRECTORY = join(
	"/Users/test/Videos",
	"CapCut",
	"User Data",
	"Projects",
	"com.lveditor.draft"
);

const { mockGetPath, mockHandle, mockRemoveHandler } = vi.hoisted(() => ({
	mockGetPath: vi.fn((name: string) =>
		name === "videos" ? "/Users/test/Videos" : "/Users/test/Documents"
	),
	mockHandle: vi.fn(),
	mockRemoveHandler: vi.fn(),
}));

vi.mock("electron", () => ({
	app: { getPath: mockGetPath },
	ipcMain: {
		handle: mockHandle,
		removeHandler: mockRemoveHandler,
	},
}));

vi.mock("../ffmpeg/paths.js", () => ({
	getFFprobePath: vi.fn(async () => "/trusted/ffprobe"),
}));

import { setupJianyingDraftExportIPC } from "../jianying-draft-export-handler.js";

interface MockWindowContext {
	event: IpcMainInvokeEvent;
	iframeEvent: IpcMainInvokeEvent;
	mainWindow: BrowserWindow;
}

function createMockWindowContext(): MockWindowContext {
	const mainFrame = {};
	const webContents = {
		isDestroyed: vi.fn(() => false),
		mainFrame,
	};
	const mainWindow = {
		isDestroyed: vi.fn(() => false),
		webContents,
	} as unknown as BrowserWindow;
	return {
		event: {
			sender: webContents,
			senderFrame: mainFrame,
		} as unknown as IpcMainInvokeEvent,
		iframeEvent: {
			sender: webContents,
			senderFrame: {},
		} as unknown as IpcMainInvokeEvent,
		mainWindow,
	};
}

function getHandler({
	channel,
}: {
	channel: string;
}): (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown> {
	const registration = mockHandle.mock.calls.find(
		(call: unknown[]) => call[0] === channel
	);
	if (!registration) throw new Error(`Missing IPC handler for ${channel}`);
	return registration[1] as (
		event: IpcMainInvokeEvent,
		input: unknown
	) => Promise<unknown>;
}

function createRuntime({
	commit = vi.fn(),
	install = vi.fn(),
	plan = vi.fn(),
}: {
	commit?: ReturnType<typeof vi.fn>;
	install?: ReturnType<typeof vi.fn>;
	plan?: ReturnType<typeof vi.fn>;
}) {
	const constructorOptions: unknown[] = [];
	const dispose = vi.fn();
	class MockSession {
		constructor(options: unknown) {
			constructorOptions.push(options);
		}

		commit({ input }: { input: unknown }) {
			return commit({ input });
		}

		dispose(): void {
			dispose();
		}

		plan({ input }: { input: unknown }) {
			return plan({ input });
		}
	}
	return {
		commit,
		constructorOptions,
		dispose,
		install,
		module: {
			CapCut81MigrationExportSession: MockSession,
			installTrustedCapCut81MigrationBundle: install,
		},
		plan,
	};
}

const runtimePlan = {
	blockerFingerprints: [],
	canCommit: true,
	expiresAtUnixMilliseconds: 123_456,
	issueSetFingerprint: "issue-set",
	issues: [
		{
			code: "metadata-dropped",
			elementId: "text-1",
			message: "Name metadata is not exported.",
			severity: "warning" as const,
		},
	],
	planToken: "plan-token",
	requestFingerprint: "request",
	warningFingerprints: ["warning-1"],
};

const runtimeCommitResult = {
	completeMarkerPath: "/exports/bundle/QCUT_EXPORT_COMPLETE.json",
	contentSha256: "content-sha",
	copiedAssets: [{ id: "one" }, { id: "two" }],
	draftDirectory: "/exports/bundle/com.lveditor.draft/draft",
	draftFolderName: "draft",
	draftStoreDirectory: "/exports/bundle/com.lveditor.draft",
	durability: "fsync-complete" as const,
	durabilityWarnings: [],
	ffprobeVersion: {
		banner: "ffprobe version 8.1.2",
		major: 8 as const,
		version: "8.1.2",
	},
	generatedAssets: [{ id: "generated-lut" }],
	ids: {
		draftId: "draft-id",
		placeholderId: "placeholder-id",
		projectId: "project-id",
		timelineId: "timeline-id",
	},
	manifestPath: "/exports/bundle/manifest.json",
	outputDirectory: "/exports/bundle",
	timelineMaterialsSize: 42,
};

const runtimeInstallResult = {
	contentMirrorPaths: [
		"/videos/CapCut/User Data/Projects/com.lveditor.draft/draft/content.json",
		"/videos/CapCut/User Data/Projects/com.lveditor.draft/draft/draft_content.json",
	],
	draftDirectory: "/videos/CapCut/User Data/Projects/com.lveditor.draft/draft",
	draftFolderName: "draft",
	draftId: "draft-id",
	installedContentSha256:
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	rootMetaInfoBackupPath: "/videos/CapCut/User Data/Projects/backup.json",
	rootMetaInfoPath:
		"/videos/CapCut/User Data/Projects/com.lveditor.draft/root_meta_info.json",
	targetDraftStoreDirectory:
		"/videos/CapCut/User Data/Projects/com.lveditor.draft",
	timelineId: "timeline-id",
};

describe("JianYing draft export IPC", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers plan, commit, and install handlers", () => {
		const { mainWindow } = createMockWindowContext();
		setupJianyingDraftExportIPC({
			getMainWindow: () => mainWindow,
		});

		expect(mockHandle).toHaveBeenCalledTimes(3);
		expect(mockHandle).toHaveBeenCalledWith(
			CAPCUT_8_1_MIGRATION_PLAN_CHANNEL,
			expect.any(Function)
		);
		expect(mockHandle).toHaveBeenCalledWith(
			CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
			expect.any(Function)
		);
		expect(mockHandle).toHaveBeenCalledWith(
			CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
			expect.any(Function)
		);
	});

	it("rejects non-main-window and child-frame callers before loading runtime", async () => {
		const { event, iframeEvent, mainWindow } = createMockWindowContext();
		const loadRuntime = vi.fn();
		setupJianyingDraftExportIPC({
			getMainWindow: () => mainWindow,
			loadRuntime,
		});
		const handler = getHandler({
			channel: CAPCUT_8_1_MIGRATION_PLAN_CHANNEL,
		});

		await expect(
			handler(
				{
					sender: {},
					senderFrame: {},
				} as unknown as IpcMainInvokeEvent,
				{}
			)
		).resolves.toMatchObject({
			error: { code: "untrusted-sender" },
			ok: false,
		});
		await expect(handler(iframeEvent, {})).resolves.toMatchObject({
			error: { code: "untrusted-sender" },
			ok: false,
		});
		expect(loadRuntime).not.toHaveBeenCalled();

		await handler(event, {});
		expect(loadRuntime).toHaveBeenCalledOnce();
	});

	it("binds CapCut, FFprobe, and the fixed Documents export directory in main", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime({
			plan: vi.fn(async () => runtimePlan),
		});
		const ensureDirectory = vi.fn(async () => undefined);
		setupJianyingDraftExportIPC({
			ensureDirectory,
			getCapCutAppPath: () => "/trusted/Applications/CapCut.app",
			getDocumentsDirectory: () => DOCUMENTS_DIRECTORY,
			getMainWindow: () => mainWindow,
			loadRuntime: vi.fn(async () => runtime.module),
			resolveFfprobePath: vi.fn(async () => "/trusted/qcut/ffprobe"),
		});
		const handler = getHandler({
			channel: CAPCUT_8_1_MIGRATION_PLAN_CHANNEL,
		});
		const request = {
			draftName: "My edit",
			snapshot: { schemaVersion: 1 },
			targetPlatform: "macos",
		};

		await expect(handler(event, request)).resolves.toEqual({
			ok: true,
			value: runtimePlan,
		});
		expect(ensureDirectory).toHaveBeenCalledWith({
			directoryPath: CAPCUT_DRAFT_EXPORT_DIRECTORY,
		});
		expect(runtime.constructorOptions).toEqual([
			{
				allowedSourceRootDirectory: CAPCUT_ALLOWED_SOURCE_DIRECTORY,
				capCutAppPath: "/trusted/Applications/CapCut.app",
				ffprobePath: "/trusted/qcut/ffprobe",
				outputParentDirectory: CAPCUT_DRAFT_EXPORT_DIRECTORY,
			},
		]);
		expect(runtime.plan).toHaveBeenCalledWith({ input: request });
	});

	it("returns a bounded commit summary instead of the full runtime result", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime({
			commit: vi.fn(async () => runtimeCommitResult),
		});
		setupJianyingDraftExportIPC({
			ensureDirectory: vi.fn(async () => undefined),
			getMainWindow: () => mainWindow,
			loadRuntime: vi.fn(async () => runtime.module),
			resolveFfprobePath: vi.fn(async () => "/trusted/qcut/ffprobe"),
		});
		const handler = getHandler({
			channel: CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
		});

		await expect(
			handler(event, {
				acceptedWarningFingerprints: [],
				planToken: "plan-token",
			})
		).resolves.toEqual({
			ok: true,
			value: {
				assetCount: 3,
				completeMarkerPath: runtimeCommitResult.completeMarkerPath,
				contentSha256: "content-sha",
				draftDirectory: runtimeCommitResult.draftDirectory,
				draftFolderName: "draft",
				draftStoreDirectory: runtimeCommitResult.draftStoreDirectory,
				durability: "fsync-complete",
				durabilityWarnings: [],
				ffprobeVersion: runtimeCommitResult.ffprobeVersion,
				ids: runtimeCommitResult.ids,
				manifestPath: runtimeCommitResult.manifestPath,
				outputDirectory: runtimeCommitResult.outputDirectory,
				timelineMaterialsSize: 42,
			},
		});
	});

	it("rejects untrusted install callers before reading main-owned state", async () => {
		const { iframeEvent, mainWindow } = createMockWindowContext();
		const loadRuntime = vi.fn();
		setupJianyingDraftExportIPC({
			getMainWindow: () => mainWindow,
			loadRuntime,
		});
		const handler = getHandler({
			channel: CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
		});

		await expect(
			handler(iframeEvent, { outputDirectory: "/exports/bundle" })
		).resolves.toMatchObject({
			error: { code: "untrusted-sender" },
			ok: false,
		});
		expect(loadRuntime).not.toHaveBeenCalled();
	});

	it("rejects arbitrary and renderer-supplied target paths", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime({
			commit: vi.fn(async () => runtimeCommitResult),
			install: vi.fn(async () => runtimeInstallResult),
		});
		setupJianyingDraftExportIPC({
			ensureDirectory: vi.fn(async () => undefined),
			getMainWindow: () => mainWindow,
			loadRuntime: vi.fn(async () => runtime.module),
			resolveFfprobePath: vi.fn(async () => "/trusted/qcut/ffprobe"),
		});
		const installHandler = getHandler({
			channel: CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
		});

		await expect(
			installHandler(event, { outputDirectory: "/renderer/chosen/bundle" })
		).resolves.toMatchObject({
			error: { code: "install-not-committed" },
			ok: false,
		});

		await getHandler({
			channel: CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
		})(event, { planToken: "plan-token" });
		await expect(
			installHandler(event, {
				capCutAppPath: "/renderer/CapCut.app",
				outputDirectory: runtimeCommitResult.outputDirectory,
				targetDraftStoreDirectory: "/renderer/drafts",
			})
		).resolves.toMatchObject({
			error: { code: "invalid-install" },
			ok: false,
		});
		expect(runtime.install).not.toHaveBeenCalled();
	});

	it("installs only the committed output with main-owned target paths", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const assertTargetAppClosed = vi.fn(async () => undefined);
		const runtime = createRuntime({
			commit: vi.fn(async () => runtimeCommitResult),
			install: vi.fn(async () => runtimeInstallResult),
		});
		setupJianyingDraftExportIPC({
			assertTargetAppClosed,
			ensureDirectory: vi.fn(async () => undefined),
			getMainWindow: () => mainWindow,
			loadRuntime: vi.fn(async () => runtime.module),
			resolveFfprobePath: vi.fn(async () => "/trusted/qcut/ffprobe"),
		});

		await getHandler({
			channel: CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
		})(event, { planToken: "plan-token" });
		const result = await getHandler({
			channel: CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
		})(event, { outputDirectory: runtimeCommitResult.outputDirectory });

		expect(runtime.install).toHaveBeenCalledWith({
			assertTargetAppClosed,
			capCutAppPath: "/Applications/CapCut.app",
			outputDirectory: runtimeCommitResult.outputDirectory,
			targetDraftStoreDirectory: CAPCUT_DRAFT_STORE_DIRECTORY,
		});
		expect(result).toEqual({
			ok: true,
			value: {
				contentMirrorCount: 2,
				draftDirectory: runtimeInstallResult.draftDirectory,
				draftFolderName: "draft",
				draftId: "draft-id",
				installedContentSha256: runtimeInstallResult.installedContentSha256,
				rootMetaInfoBackupPath: runtimeInstallResult.rootMetaInfoBackupPath,
				rootMetaInfoPath: runtimeInstallResult.rootMetaInfoPath,
				targetDraftStoreDirectory:
					runtimeInstallResult.targetDraftStoreDirectory,
				timelineId: "timeline-id",
			},
		});
		expect(result).not.toHaveProperty("value.contentMirrorPaths");
	});

	it("rejects replay after a committed bundle is installed", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime({
			commit: vi.fn(async () => runtimeCommitResult),
			install: vi.fn(async () => runtimeInstallResult),
		});
		setupJianyingDraftExportIPC({
			assertTargetAppClosed: vi.fn(async () => undefined),
			ensureDirectory: vi.fn(async () => undefined),
			getCapCutAppPath: () => "/main/Applications/CapCut.app",
			getCapCutDraftStoreDirectory: () => "/main/drafts/com.lveditor.draft",
			getMainWindow: () => mainWindow,
			loadRuntime: vi.fn(async () => runtime.module),
			resolveFfprobePath: vi.fn(async () => "/trusted/qcut/ffprobe"),
		});
		const installHandler = getHandler({
			channel: CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
		});

		await getHandler({
			channel: CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
		})(event, { planToken: "plan-token" });
		await installHandler(event, {
			outputDirectory: runtimeCommitResult.outputDirectory,
		});

		await expect(
			installHandler(event, {
				outputDirectory: runtimeCommitResult.outputDirectory,
			})
		).resolves.toMatchObject({
			error: { code: "install-consumed" },
			ok: false,
		});
		expect(runtime.install).toHaveBeenCalledOnce();
	});

	it("consumes an installed bundle even when the result DTO is invalid", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime({
			commit: vi.fn(async () => runtimeCommitResult),
			install: vi.fn(async () => ({
				...runtimeInstallResult,
				installedContentSha256: "invalid",
			})),
		});
		setupJianyingDraftExportIPC({
			assertTargetAppClosed: vi.fn(async () => undefined),
			ensureDirectory: vi.fn(async () => undefined),
			getCapCutAppPath: () => "/main/Applications/CapCut.app",
			getCapCutDraftStoreDirectory: () => "/main/drafts/com.lveditor.draft",
			getMainWindow: () => mainWindow,
			loadRuntime: vi.fn(async () => runtime.module),
			resolveFfprobePath: vi.fn(async () => "/trusted/qcut/ffprobe"),
		});
		const installHandler = getHandler({
			channel: CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
		});

		await getHandler({
			channel: CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
		})(event, { planToken: "plan-token" });
		await expect(
			installHandler(event, {
				outputDirectory: runtimeCommitResult.outputDirectory,
			})
		).resolves.toMatchObject({
			error: { code: "install-failed" },
			ok: false,
		});
		await expect(
			installHandler(event, {
				outputDirectory: runtimeCommitResult.outputDirectory,
			})
		).resolves.toMatchObject({
			error: { code: "install-consumed" },
			ok: false,
		});
		expect(runtime.install).toHaveBeenCalledOnce();
	});

	it("allows retry when the runtime installer fails before succeeding", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime({
			commit: vi.fn(async () => runtimeCommitResult),
			install: vi
				.fn()
				.mockRejectedValueOnce(new Error("installer unavailable"))
				.mockResolvedValueOnce(runtimeInstallResult),
		});
		setupJianyingDraftExportIPC({
			assertTargetAppClosed: vi.fn(async () => undefined),
			ensureDirectory: vi.fn(async () => undefined),
			getCapCutAppPath: () => "/main/Applications/CapCut.app",
			getCapCutDraftStoreDirectory: () => "/main/drafts/com.lveditor.draft",
			getMainWindow: () => mainWindow,
			loadRuntime: vi.fn(async () => runtime.module),
			resolveFfprobePath: vi.fn(async () => "/trusted/qcut/ffprobe"),
		});
		const installHandler = getHandler({
			channel: CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
		});

		await getHandler({
			channel: CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
		})(event, { planToken: "plan-token" });
		await expect(
			installHandler(event, {
				outputDirectory: runtimeCommitResult.outputDirectory,
			})
		).resolves.toMatchObject({
			error: { code: "install-failed" },
			ok: false,
		});
		await expect(
			installHandler(event, {
				outputDirectory: runtimeCommitResult.outputDirectory,
			})
		).resolves.toMatchObject({ ok: true });
		expect(runtime.install).toHaveBeenCalledTimes(2);
	});

	it("returns app-running before the runtime installer can write", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const writeDraft = vi.fn();
		const assertTargetAppClosed = vi.fn(async () => {
			throw new CapCutAppRunningError();
		});
		const install = vi.fn(async (options: RuntimeInstallerOptions) => {
			await options.assertTargetAppClosed({
				capCutAppPath: options.capCutAppPath,
				targetDraftStoreDirectory: options.targetDraftStoreDirectory,
			});
			writeDraft();
			return runtimeInstallResult;
		});
		const runtime = createRuntime({
			commit: vi.fn(async () => runtimeCommitResult),
			install,
		});
		setupJianyingDraftExportIPC({
			assertTargetAppClosed,
			ensureDirectory: vi.fn(async () => undefined),
			getCapCutAppPath: () => "/main/Applications/CapCut.app",
			getCapCutDraftStoreDirectory: () => "/main/drafts/com.lveditor.draft",
			getMainWindow: () => mainWindow,
			loadRuntime: vi.fn(async () => runtime.module),
			resolveFfprobePath: vi.fn(async () => "/trusted/qcut/ffprobe"),
		});

		await getHandler({
			channel: CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
		})(event, { planToken: "plan-token" });
		await expect(
			getHandler({
				channel: CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
			})(event, { outputDirectory: runtimeCommitResult.outputDirectory })
		).resolves.toMatchObject({
			error: { code: "app-running" },
			ok: false,
		});
		expect(writeDraft).not.toHaveBeenCalled();
	});

	it("reports runtime-unavailable when the bundled installer export is missing", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime({
			commit: vi.fn(async () => runtimeCommitResult),
		});
		const runtimeWithoutInstaller = {
			CapCut81MigrationExportSession:
				runtime.module.CapCut81MigrationExportSession,
		};
		setupJianyingDraftExportIPC({
			assertTargetAppClosed: vi.fn(async () => undefined),
			ensureDirectory: vi.fn(async () => undefined),
			getCapCutAppPath: () => "/main/Applications/CapCut.app",
			getCapCutDraftStoreDirectory: () => "/main/drafts/com.lveditor.draft",
			getMainWindow: () => mainWindow,
			loadRuntime: vi.fn(async () => runtimeWithoutInstaller),
			resolveFfprobePath: vi.fn(async () => "/trusted/qcut/ffprobe"),
		});

		await getHandler({
			channel: CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL,
		})(event, { planToken: "plan-token" });
		await expect(
			getHandler({
				channel: CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL,
			})(event, { outputDirectory: runtimeCommitResult.outputDirectory })
		).resolves.toMatchObject({
			error: { code: "runtime-unavailable" },
			ok: false,
		});
	});

	it("maps validation and warning acceptance errors to structured envelopes", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const validationError = Object.assign(new Error("invalid request"), {
			issues: [{ message: "Expected an object.", path: "$.snapshot" }],
			name: "StandaloneJianyingDraftRequestValidationError",
		});
		const runtime = createRuntime({
			plan: vi
				.fn()
				.mockRejectedValueOnce(validationError)
				.mockRejectedValueOnce(
					Object.assign(new Error("warnings required"), {
						name: "StandaloneJianyingDraftWarningAcceptanceError",
						requiredWarningFingerprints: ["warning-1"],
					})
				),
		});
		setupJianyingDraftExportIPC({
			ensureDirectory: vi.fn(async () => undefined),
			getMainWindow: () => mainWindow,
			loadRuntime: vi.fn(async () => runtime.module),
			resolveFfprobePath: vi.fn(async () => "/trusted/qcut/ffprobe"),
		});
		const handler = getHandler({
			channel: CAPCUT_8_1_MIGRATION_PLAN_CHANNEL,
		});

		await expect(handler(event, {})).resolves.toEqual({
			error: {
				code: "invalid-request",
				details: {
					issues: [{ message: "Expected an object.", path: "$.snapshot" }],
				},
				message: "invalid request",
				name: "StandaloneJianyingDraftRequestValidationError",
			},
			ok: false,
		});
		await expect(handler(event, {})).resolves.toMatchObject({
			error: {
				code: "warnings-not-accepted",
				details: { requiredWarningFingerprints: ["warning-1"] },
			},
			ok: false,
		});
	});

	it("disposes the trusted session and unregisters all handlers exactly once", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime({
			plan: vi.fn(async () => runtimePlan),
		});
		const controller = setupJianyingDraftExportIPC({
			ensureDirectory: vi.fn(async () => undefined),
			getMainWindow: () => mainWindow,
			loadRuntime: vi.fn(async () => runtime.module),
			resolveFfprobePath: vi.fn(async () => "/trusted/qcut/ffprobe"),
		});
		await getHandler({
			channel: CAPCUT_8_1_MIGRATION_PLAN_CHANNEL,
		})(event, {});

		controller.dispose();
		controller.dispose();

		expect(runtime.dispose).toHaveBeenCalledOnce();
		expect(mockRemoveHandler).toHaveBeenCalledTimes(3);
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			CAPCUT_8_1_MIGRATION_PLAN_CHANNEL
		);
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			CAPCUT_8_1_MIGRATION_COMMIT_CHANNEL
		);
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			CAPCUT_8_1_MIGRATION_INSTALL_CHANNEL
		);
	});
});
