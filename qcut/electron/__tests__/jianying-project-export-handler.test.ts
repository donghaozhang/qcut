import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	JIANYING_11_3_BETA2_PROFILE_ID,
	JIANYING_11_3_BETA3_PROFILE_ID,
	JIANYING_11_3_BETA4_PROFILE_ID,
} from "@qcut/editor-core/jianying-draft";
import {
	JIANYING_11_3_PROJECT_EXPORT_CHOOSE_CHANNEL,
	JIANYING_11_3_PROJECT_EXPORT_COMMIT_CHANNEL,
	JIANYING_11_3_PROJECT_EXPORT_PROFILE_IDS,
	type Jianying113ProjectExportCommitDto,
} from "../jianying-project-export-contract.js";
import { JianyingAppRunningError } from "../jianying-target-app-guard.js";

const { mockHandle, mockRemoveHandler } = vi.hoisted(() => ({
	mockHandle: vi.fn(),
	mockRemoveHandler: vi.fn(),
}));

vi.mock("electron", () => ({
	dialog: { showOpenDialog: vi.fn() },
	ipcMain: {
		handle: mockHandle,
		removeHandler: mockRemoveHandler,
	},
}));

import { setupJianyingProjectExportIPC } from "../jianying-project-export-handler.js";

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
}): (event: IpcMainInvokeEvent, input?: unknown) => Promise<unknown> {
	const registration = mockHandle.mock.calls.find(
		(call: unknown[]) => call[0] === channel
	);
	if (registration === undefined) {
		throw new Error(`Missing IPC handler for ${channel}`);
	}
	return registration[1] as (
		event: IpcMainInvokeEvent,
		input?: unknown
	) => Promise<unknown>;
}

type ProjectExportRuntimeWrite = (options: {
	assertTargetAppClosed: (context: {
		projectDirectory: string;
	}) => Promise<void>;
	contentBytes: Uint8Array;
	expectedSourceSha256: string;
	profileId: string;
	projectDirectory: string;
}) => Promise<Jianying113ProjectExportCommitDto>;

function createRuntime() {
	const write = vi.fn<ProjectExportRuntimeWrite>(async () => ({
		contentRelativePath: "subdraft/subdraft-1/draft_content.json",
		contentSha256: "b".repeat(64),
		profileId: JIANYING_11_3_BETA3_PROFILE_ID,
		subdraftId: "subdraft-1",
		transactionId: "transaction-1",
		warnings: [],
	}));
	return {
		loadRuntime: vi.fn(async () => ({
			writeJianying113RegisteredProjectContent: write,
		})),
		write,
	};
}

async function chooseAndGetToken({
	event,
}: {
	event: IpcMainInvokeEvent;
}): Promise<string> {
	const result = (await getHandler({
		channel: JIANYING_11_3_PROJECT_EXPORT_CHOOSE_CHANNEL,
	})(event)) as {
		ok: boolean;
		value?: { selectionToken: string };
	};
	if (!result.ok || result.value === undefined) {
		throw new Error("Jianying project export selection failed.");
	}
	return result.value.selectionToken;
}

function commitRequest({ selectionToken }: { selectionToken: string }) {
	return {
		contentBase64: Buffer.from('{"id":"draft"}').toString("base64"),
		expectedSourceSha256: "a".repeat(64),
		profileId: JIANYING_11_3_BETA3_PROFILE_ID,
		selectionToken,
	};
}

function setup({
	assertTargetAppClosed = vi.fn(async () => undefined),
	clock = () => 1_000,
	runtime = createRuntime(),
}: {
	assertTargetAppClosed?: ReturnType<typeof vi.fn>;
	clock?: () => number;
	runtime?: ReturnType<typeof createRuntime>;
} = {}) {
	const context = createMockWindowContext();
	const canonicalizeDirectory = vi.fn(async () => "/canonical/source");
	const chooseSourceProjectDirectory = vi.fn(async () => "/selected/source");
	const controller = setupJianyingProjectExportIPC({
		assertTargetAppClosed,
		canonicalizeDirectory,
		chooseSourceProjectDirectory,
		getMainWindow: () => context.mainWindow,
		loadRuntime: runtime.loadRuntime,
		now: clock,
	});
	return {
		assertTargetAppClosed,
		canonicalizeDirectory,
		chooseSourceProjectDirectory,
		context,
		controller,
		runtime,
	};
}

describe("Jianying project export IPC", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps the IPC profile identifiers aligned with editor-core", () => {
		expect(JIANYING_11_3_PROJECT_EXPORT_PROFILE_IDS).toEqual([
			JIANYING_11_3_BETA2_PROFILE_ID,
			JIANYING_11_3_BETA3_PROFILE_ID,
			JIANYING_11_3_BETA4_PROFILE_ID,
		]);
	});

	it("registers and disposes both handlers", () => {
		const { controller } = setup();

		expect(mockHandle).toHaveBeenCalledTimes(2);
		expect(mockHandle).toHaveBeenCalledWith(
			JIANYING_11_3_PROJECT_EXPORT_CHOOSE_CHANNEL,
			expect.any(Function)
		);
		expect(mockHandle).toHaveBeenCalledWith(
			JIANYING_11_3_PROJECT_EXPORT_COMMIT_CHANNEL,
			expect.any(Function)
		);

		controller.dispose();
		expect(mockRemoveHandler).toHaveBeenCalledTimes(2);
	});

	it("rejects child frames before opening a directory chooser", async () => {
		const { chooseSourceProjectDirectory, context, runtime } = setup();

		await expect(
			getHandler({
				channel: JIANYING_11_3_PROJECT_EXPORT_CHOOSE_CHANNEL,
			})(context.iframeEvent)
		).resolves.toMatchObject({
			ok: false,
			error: { code: "untrusted-sender" },
		});
		expect(chooseSourceProjectDirectory).not.toHaveBeenCalled();
		expect(runtime.loadRuntime).not.toHaveBeenCalled();
	});

	it("binds one canonical registered project to a one-shot token", async () => {
		const { context, runtime } = setup();
		const selectionToken = await chooseAndGetToken({ event: context.event });

		await expect(
			getHandler({ channel: JIANYING_11_3_PROJECT_EXPORT_COMMIT_CHANNEL })(
				context.event,
				commitRequest({ selectionToken })
			)
		).resolves.toMatchObject({
			ok: true,
			value: {
				subdraftId: "subdraft-1",
				transactionId: "transaction-1",
			},
		});
		expect(runtime.write).toHaveBeenCalledWith(
			expect.objectContaining({
				expectedSourceSha256: "a".repeat(64),
				profileId: JIANYING_11_3_BETA3_PROFILE_ID,
				projectDirectory: "/canonical/source",
			})
		);
		expect(
			Buffer.from(runtime.write.mock.calls[0]![0].contentBytes).toString()
		).toBe('{"id":"draft"}');

		await expect(
			getHandler({ channel: JIANYING_11_3_PROJECT_EXPORT_COMMIT_CHANNEL })(
				context.event,
				commitRequest({ selectionToken })
			)
		).resolves.toMatchObject({
			ok: false,
			error: { code: "selection-not-found" },
		});
	});

	it("rejects malformed content and the wrong profile before loading runtime", async () => {
		const { context, runtime } = setup();
		const selectionToken = await chooseAndGetToken({ event: context.event });

		await expect(
			getHandler({ channel: JIANYING_11_3_PROJECT_EXPORT_COMMIT_CHANNEL })(
				context.event,
				{
					...commitRequest({ selectionToken }),
					contentBase64: "not base64",
					profileId: "capcut-desktop-8.1-plaintext",
				}
			)
		).resolves.toMatchObject({
			ok: false,
			error: { code: "invalid-request" },
		});
		expect(runtime.loadRuntime).not.toHaveBeenCalled();
	});

	it("expires selections before loading runtime", async () => {
		let now = 1_000;
		const { context, runtime } = setup({ clock: () => now });
		const selectionToken = await chooseAndGetToken({ event: context.event });
		now += 16 * 60 * 1_000;

		await expect(
			getHandler({ channel: JIANYING_11_3_PROJECT_EXPORT_COMMIT_CHANNEL })(
				context.event,
				commitRequest({ selectionToken })
			)
		).resolves.toMatchObject({
			ok: false,
			error: { code: "selection-expired" },
		});
		expect(runtime.loadRuntime).not.toHaveBeenCalled();
	});

	it("reports a running Jianying application without writing the project", async () => {
		const assertTargetAppClosed = vi.fn(async () => {
			throw new JianyingAppRunningError();
		});
		const runtime = createRuntime();
		runtime.write.mockImplementationOnce(
			async ({ assertTargetAppClosed: guard }) => {
				await guard({ projectDirectory: "/canonical/source" });
				throw new Error("unreachable");
			}
		);
		const { context } = setup({ assertTargetAppClosed, runtime });
		const selectionToken = await chooseAndGetToken({ event: context.event });

		await expect(
			getHandler({ channel: JIANYING_11_3_PROJECT_EXPORT_COMMIT_CHANNEL })(
				context.event,
				commitRequest({ selectionToken })
			)
		).resolves.toMatchObject({
			ok: false,
			error: { code: "app-running" },
		});
	});
});
