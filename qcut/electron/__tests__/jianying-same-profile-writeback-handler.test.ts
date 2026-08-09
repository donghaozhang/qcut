import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	CAPCUT_8_1_WRITEBACK_CHOOSE_DIRECTORY_CHANNEL,
	CAPCUT_8_1_WRITEBACK_COMMIT_CHANNEL,
	CAPCUT_8_1_WRITEBACK_RECOVER_CHANNEL,
} from "../jianying-same-profile-writeback-contract.js";

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

import { setupJianyingSameProfileWritebackIPC } from "../jianying-same-profile-writeback-handler.js";

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
	if (!registration) throw new Error(`Missing IPC handler for ${channel}`);
	return registration[1] as (
		event: IpcMainInvokeEvent,
		input?: unknown
	) => Promise<unknown>;
}

function createRuntime() {
	const write = vi.fn(async () => ({
		contentSha256: "b".repeat(64),
		mirrorRelativePaths: [
			"draft_info.json",
			"template-2.tmp",
			"Timelines/timeline-1/draft_info.json",
			"Timelines/timeline-1/template-2.tmp",
		] as const,
		replacedMirrorCount: 4 as const,
		timelineId: "timeline-1",
		transactionId: "transaction-1",
		warnings: [],
	}));
	const recover = vi.fn(async () => ({
		action: "rolled-back" as const,
		transactionId: "transaction-1",
		warnings: [],
	}));
	return {
		loadRuntime: vi.fn(async () => ({
			writeCapCut81SameProfileContent: write,
			recoverCapCut81SameProfileWriteback: recover,
		})),
		recover,
		write,
	};
}

async function chooseAndGetToken({
	event,
}: {
	event: IpcMainInvokeEvent;
}): Promise<string> {
	const result = (await getHandler({
		channel: CAPCUT_8_1_WRITEBACK_CHOOSE_DIRECTORY_CHANNEL,
	})(event)) as {
		ok: boolean;
		value?: { selectionToken: string };
	};
	if (!result.ok || result.value === undefined) {
		throw new Error("selection failed");
	}
	return result.value.selectionToken;
}

function commitRequest({ selectionToken }: { selectionToken: string }) {
	return {
		contentBase64: Buffer.from('{"id":"draft"}').toString("base64"),
		expectedSourceSha256: "a".repeat(64),
		profileId: "capcut-desktop-8.1-plaintext",
		selectionToken,
	};
}

describe("JianYing same-profile writeback IPC", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers and disposes all writeback handlers", () => {
		const { mainWindow } = createMockWindowContext();
		const controller = setupJianyingSameProfileWritebackIPC({
			getMainWindow: () => mainWindow,
		});

		expect(mockHandle).toHaveBeenCalledTimes(3);
		for (const channel of [
			CAPCUT_8_1_WRITEBACK_CHOOSE_DIRECTORY_CHANNEL,
			CAPCUT_8_1_WRITEBACK_COMMIT_CHANNEL,
			CAPCUT_8_1_WRITEBACK_RECOVER_CHANNEL,
		]) {
			expect(mockHandle).toHaveBeenCalledWith(channel, expect.any(Function));
		}

		controller.dispose();
		expect(mockRemoveHandler).toHaveBeenCalledTimes(3);
	});

	it("rejects child frames before selecting or loading runtime", async () => {
		const { iframeEvent, mainWindow } = createMockWindowContext();
		const runtime = createRuntime();
		const chooseDraftDirectory = vi.fn(async () => "/selected/draft");
		setupJianyingSameProfileWritebackIPC({
			chooseDraftDirectory,
			getMainWindow: () => mainWindow,
			loadRuntime: runtime.loadRuntime,
		});

		await expect(
			getHandler({
				channel: CAPCUT_8_1_WRITEBACK_CHOOSE_DIRECTORY_CHANNEL,
			})(iframeEvent)
		).resolves.toMatchObject({
			ok: false,
			error: { code: "untrusted-sender" },
		});
		expect(chooseDraftDirectory).not.toHaveBeenCalled();
		expect(runtime.loadRuntime).not.toHaveBeenCalled();
	});

	it("binds commit to the canonical user-selected directory", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime();
		const assertTargetAppClosed = vi.fn(async () => undefined);
		setupJianyingSameProfileWritebackIPC({
			assertTargetAppClosed,
			canonicalizeDraftDirectory: vi.fn(async () => "/canonical/draft"),
			chooseDraftDirectory: vi.fn(async () => "/selected/draft"),
			getCapCutAppPath: () => "/Applications/CapCut.app",
			getMainWindow: () => mainWindow,
			loadRuntime: runtime.loadRuntime,
			now: () => 1_000,
		});
		const selectionToken = await chooseAndGetToken({ event });

		await expect(
			getHandler({ channel: CAPCUT_8_1_WRITEBACK_COMMIT_CHANNEL })(
				event,
				commitRequest({ selectionToken })
			)
		).resolves.toMatchObject({
			ok: true,
			value: {
				replacedMirrorCount: 4,
				transactionId: "transaction-1",
			},
		});
		expect(assertTargetAppClosed).toHaveBeenCalledWith({
			capCutAppPath: "/Applications/CapCut.app",
			targetDraftStoreDirectory: "/canonical/draft",
		});
		expect(runtime.write).toHaveBeenCalledWith(
			expect.objectContaining({
				draftDirectory: "/canonical/draft",
				expectedSourceSha256: "a".repeat(64),
				profileId: "capcut-desktop-8.1-plaintext",
			})
		);
		expect(
			Buffer.from(runtime.write.mock.calls[0]![0].contentBytes).toString()
		).toBe('{"id":"draft"}');
	});

	it("rejects malformed payloads before guarding or loading runtime", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime();
		const assertTargetAppClosed = vi.fn(async () => undefined);
		setupJianyingSameProfileWritebackIPC({
			assertTargetAppClosed,
			canonicalizeDraftDirectory: vi.fn(async (value) => value),
			chooseDraftDirectory: vi.fn(async () => "/selected/draft"),
			getMainWindow: () => mainWindow,
			loadRuntime: runtime.loadRuntime,
		});
		const selectionToken = await chooseAndGetToken({ event });

		await expect(
			getHandler({ channel: CAPCUT_8_1_WRITEBACK_COMMIT_CHANNEL })(event, {
				...commitRequest({ selectionToken }),
				contentBase64: "not base64",
			})
		).resolves.toMatchObject({
			ok: false,
			error: { code: "invalid-request" },
		});
		expect(assertTargetAppClosed).not.toHaveBeenCalled();
		expect(runtime.loadRuntime).not.toHaveBeenCalled();
	});

	it("expires selection tokens before touching CapCut", async () => {
		const { event, mainWindow } = createMockWindowContext();
		let clock = 1_000;
		const runtime = createRuntime();
		const assertTargetAppClosed = vi.fn(async () => undefined);
		setupJianyingSameProfileWritebackIPC({
			assertTargetAppClosed,
			canonicalizeDraftDirectory: vi.fn(async (value) => value),
			chooseDraftDirectory: vi.fn(async () => "/selected/draft"),
			getMainWindow: () => mainWindow,
			loadRuntime: runtime.loadRuntime,
			now: () => clock,
		});
		const selectionToken = await chooseAndGetToken({ event });
		clock += 16 * 60 * 1_000;

		await expect(
			getHandler({ channel: CAPCUT_8_1_WRITEBACK_COMMIT_CHANNEL })(
				event,
				commitRequest({ selectionToken })
			)
		).resolves.toMatchObject({
			ok: false,
			error: { code: "selection-expired" },
		});
		expect(assertTargetAppClosed).not.toHaveBeenCalled();
	});

	it("runs recovery through the same selected-directory guard", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime();
		const assertTargetAppClosed = vi.fn(async () => undefined);
		setupJianyingSameProfileWritebackIPC({
			assertTargetAppClosed,
			canonicalizeDraftDirectory: vi.fn(async () => "/canonical/draft"),
			chooseDraftDirectory: vi.fn(async () => "/selected/draft"),
			getMainWindow: () => mainWindow,
			loadRuntime: runtime.loadRuntime,
		});
		const selectionToken = await chooseAndGetToken({ event });

		await expect(
			getHandler({ channel: CAPCUT_8_1_WRITEBACK_RECOVER_CHANNEL })(event, {
				selectionToken,
			})
		).resolves.toMatchObject({
			ok: true,
			value: { action: "rolled-back", transactionId: "transaction-1" },
		});
		expect(runtime.recover).toHaveBeenCalledWith({
			draftDirectory: "/canonical/draft",
		});
	});

	it("maps runtime recovery requirements to a stable error code", async () => {
		const { event, mainWindow } = createMockWindowContext();
		const runtime = createRuntime();
		runtime.write.mockRejectedValueOnce(
			Object.assign(new Error("recover first"), {
				code: "RECOVERY_REQUIRED",
			})
		);
		setupJianyingSameProfileWritebackIPC({
			assertTargetAppClosed: vi.fn(async () => undefined),
			canonicalizeDraftDirectory: vi.fn(async (value) => value),
			chooseDraftDirectory: vi.fn(async () => "/selected/draft"),
			getMainWindow: () => mainWindow,
			loadRuntime: runtime.loadRuntime,
		});
		const selectionToken = await chooseAndGetToken({ event });

		await expect(
			getHandler({ channel: CAPCUT_8_1_WRITEBACK_COMMIT_CHANNEL })(
				event,
				commitRequest({ selectionToken })
			)
		).resolves.toMatchObject({
			ok: false,
			error: { code: "recovery-required" },
		});
	});
});
