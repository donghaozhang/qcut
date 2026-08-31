// @vitest-environment node
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	JIANYING_MOTION_TRACKING_CANCEL_CHANNEL,
	JIANYING_MOTION_TRACKING_INSPECT_CHANNEL,
	JIANYING_MOTION_TRACKING_PROGRESS_CHANNEL,
	JIANYING_MOTION_TRACKING_TRACK_CHANNEL,
	type JianyingMotionTrackingRequest,
} from "../jianying-motion-tracking-contract.js";

const { inspectRuntime, mockHandle, mockRemoveHandler, trackRuntime } =
	vi.hoisted(() => ({
		inspectRuntime: vi.fn(),
		mockHandle: vi.fn(),
		mockRemoveHandler: vi.fn(),
		trackRuntime: vi.fn(),
	}));

vi.mock("electron", () => ({
	ipcMain: { handle: mockHandle, removeHandler: mockRemoveHandler },
}));

vi.mock("../jianying-motion-tracking/runtime.js", () => ({
	inspectJianyingMotionTracking: inspectRuntime,
	trackWithJianyingMotionRuntime: trackRuntime,
}));

import { setupJianyingMotionTrackingIPC } from "../jianying-motion-tracking-handler.js";

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

function request(): JianyingMotionTrackingRequest {
	return {
		anchorTimeSeconds: 1,
		direction: "both",
		initialRect: { bottom: 0.8, left: 0.2, right: 0.8, top: 0.2 },
		rangeEndTimeSeconds: 2,
		rangeStartTimeSeconds: 0,
		sourcePath: "/tmp/source.mp4",
		taskId: "task",
	};
}

describe("Jianying motion tracking IPC", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("rejects iframe callers on every channel", async () => {
		const context = createWindowContext();
		setupJianyingMotionTrackingIPC({
			getMainWindow: () => context.mainWindow,
		});

		for (const channel of [
			JIANYING_MOTION_TRACKING_INSPECT_CHANNEL,
			JIANYING_MOTION_TRACKING_TRACK_CHANNEL,
			JIANYING_MOTION_TRACKING_CANCEL_CHANNEL,
		]) {
			await expect(
				Promise.resolve().then(() =>
					getHandler({ channel })(context.iframeEvent, request())
				)
			).rejects.toThrow("非主窗口");
		}
	});

	it("forwards progress only to the trusted sender", async () => {
		const context = createWindowContext();
		trackRuntime.mockImplementation(
			async ({ onProgress }: { onProgress: (value: unknown) => void }) => {
				onProgress({ progress: 50, stage: "track", status: "tracking" });
				return { ok: true };
			}
		);
		setupJianyingMotionTrackingIPC({
			getMainWindow: () => context.mainWindow,
		});

		await getHandler({ channel: JIANYING_MOTION_TRACKING_TRACK_CHANNEL })(
			context.event,
			request()
		);

		expect(context.webContents.send).toHaveBeenCalledWith(
			JIANYING_MOTION_TRACKING_PROGRESS_CHANNEL,
			{
				progress: 50,
				stage: "track",
				status: "tracking",
				taskId: "task",
			}
		);
	});

	it("aborts an active native task", async () => {
		const context = createWindowContext();
		let receivedSignal: AbortSignal | undefined;
		trackRuntime.mockImplementation(
			({ signal }: { signal: AbortSignal }) =>
				new Promise((resolve) => {
					receivedSignal = signal;
					signal.addEventListener("abort", () => resolve({ cancelled: true }));
				})
		);
		setupJianyingMotionTrackingIPC({
			getMainWindow: () => context.mainWindow,
		});
		const trackPromise = getHandler({
			channel: JIANYING_MOTION_TRACKING_TRACK_CHANNEL,
		})(context.event, request());
		await Promise.resolve();

		await getHandler({ channel: JIANYING_MOTION_TRACKING_CANCEL_CHANNEL })(
			context.event,
			{ taskId: "task" }
		);
		await trackPromise;

		expect(receivedSignal?.aborted).toBe(true);
	});

	it("serializes access to the private runtime", async () => {
		const context = createWindowContext();
		trackRuntime.mockImplementation(
			({ signal }: { signal: AbortSignal }) =>
				new Promise((resolve) => {
					signal.addEventListener("abort", () => resolve({ cancelled: true }));
				})
		);
		setupJianyingMotionTrackingIPC({
			getMainWindow: () => context.mainWindow,
		});
		const track = getHandler({
			channel: JIANYING_MOTION_TRACKING_TRACK_CHANNEL,
		});
		const firstTask = track(context.event, request());
		await Promise.resolve();

		await expect(
			track(context.event, { ...request(), taskId: "task-2" })
		).rejects.toThrow("已有运动跟踪任务");
		await getHandler({ channel: JIANYING_MOTION_TRACKING_CANCEL_CHANNEL })(
			context.event,
			{ taskId: "task" }
		);
		await firstTask;
	});

	it("aborts active tasks and removes handlers on dispose", async () => {
		const context = createWindowContext();
		let receivedSignal: AbortSignal | undefined;
		trackRuntime.mockImplementation(
			({ signal }: { signal: AbortSignal }) =>
				new Promise((resolve) => {
					receivedSignal = signal;
					signal.addEventListener("abort", () => resolve({ cancelled: true }));
				})
		);
		const controller = setupJianyingMotionTrackingIPC({
			getMainWindow: () => context.mainWindow,
		});
		const trackPromise = getHandler({
			channel: JIANYING_MOTION_TRACKING_TRACK_CHANNEL,
		})(context.event, request());
		await Promise.resolve();

		controller.dispose();
		await trackPromise;

		expect(receivedSignal?.aborted).toBe(true);
		expect(mockRemoveHandler).toHaveBeenCalledWith(
			JIANYING_MOTION_TRACKING_TRACK_CHANNEL
		);
	});
});
