// @vitest-environment node
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	JIANYING_BASIC_VIDEO_CANCEL_CHANNEL,
	JIANYING_BASIC_VIDEO_DEFLICKER_CHANNEL,
	JIANYING_BASIC_VIDEO_INSPECT_CHANNEL,
	JIANYING_BASIC_VIDEO_PROGRESS_CHANNEL,
	type JianyingDeflickerRequest,
} from "../jianying-basic-video-contract.js";

const { deflickerRuntime, inspectRuntime, mockHandle, mockRemoveHandler } =
	vi.hoisted(() => ({
		deflickerRuntime: vi.fn(),
		inspectRuntime: vi.fn(),
		mockHandle: vi.fn(),
		mockRemoveHandler: vi.fn(),
	}));

vi.mock("electron", () => ({
	ipcMain: { handle: mockHandle, removeHandler: mockRemoveHandler },
}));

vi.mock("../jianying-basic-video-runtime/runtime.js", () => ({
	deflickerWithJianyingRuntime: deflickerRuntime,
	inspectJianyingBasicVideo: inspectRuntime,
}));

import { setupJianyingBasicVideoIPC } from "../jianying-basic-video-handler.js";

function createWindowContext() {
	const mainFrame = {};
	const webContents = {
		isDestroyed: vi.fn(() => false),
		mainFrame,
		once: vi.fn(),
		removeListener: vi.fn(),
		send: vi.fn(),
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
		webContents,
	};
}

function getHandler({ channel }: { channel: string }) {
	const registration = mockHandle.mock.calls.find(
		(call: unknown[]) => call[0] === channel
	);
	if (!registration) throw new Error(`Missing IPC handler for ${channel}`);
	return registration[1] as (
		event: IpcMainInvokeEvent,
		request?: unknown
	) => Promise<unknown> | unknown;
}

function request(): JianyingDeflickerRequest {
	return {
		sourcePath: "/tmp/source.mp4",
		strength: 70,
		taskId: "deflicker-task",
	};
}

describe("Jianying basic video IPC", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("rejects iframe callers on every channel", async () => {
		const context = createWindowContext();
		setupJianyingBasicVideoIPC({ getMainWindow: () => context.mainWindow });

		await Promise.all(
			[
				JIANYING_BASIC_VIDEO_INSPECT_CHANNEL,
				JIANYING_BASIC_VIDEO_DEFLICKER_CHANNEL,
				JIANYING_BASIC_VIDEO_CANCEL_CHANNEL,
			].map((channel) =>
				expect(
					Promise.resolve().then(() =>
						getHandler({ channel })(context.iframeEvent, request())
					)
				).rejects.toThrow("非主窗口")
			)
		);
	});

	it("forwards progress only to the trusted renderer", async () => {
		const context = createWindowContext();
		deflickerRuntime.mockImplementation(
			async ({ onProgress }: { onProgress: (value: unknown) => void }) => {
				onProgress({ progress: 50, stage: "process", status: "processing" });
				return { ok: true };
			}
		);
		setupJianyingBasicVideoIPC({ getMainWindow: () => context.mainWindow });

		await getHandler({ channel: JIANYING_BASIC_VIDEO_DEFLICKER_CHANNEL })(
			context.event,
			request()
		);

		expect(context.webContents.send).toHaveBeenCalledWith(
			JIANYING_BASIC_VIDEO_PROGRESS_CHANNEL,
			{
				progress: 50,
				stage: "process",
				status: "processing",
				taskId: "deflicker-task",
			}
		);
	});

	it("aborts an active private runtime task", async () => {
		const context = createWindowContext();
		let receivedSignal: AbortSignal | undefined;
		deflickerRuntime.mockImplementation(
			({ signal }: { signal: AbortSignal }) =>
				new Promise((resolve) => {
					receivedSignal = signal;
					signal.addEventListener("abort", () => resolve({ cancelled: true }));
				})
		);
		setupJianyingBasicVideoIPC({ getMainWindow: () => context.mainWindow });
		const task = getHandler({
			channel: JIANYING_BASIC_VIDEO_DEFLICKER_CHANNEL,
		})(context.event, request());
		await Promise.resolve();

		await getHandler({ channel: JIANYING_BASIC_VIDEO_CANCEL_CHANNEL })(
			context.event,
			{ taskId: "deflicker-task" }
		);
		await task;

		expect(receivedSignal?.aborted).toBe(true);
	});
});
