import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import {
	JIANYING_MOTION_TRACKING_CANCEL_CHANNEL,
	JIANYING_MOTION_TRACKING_INSPECT_CHANNEL,
	JIANYING_MOTION_TRACKING_PROGRESS_CHANNEL,
	JIANYING_MOTION_TRACKING_TRACK_CHANNEL,
	type JianyingMotionTrackingCancelRequest,
	type JianyingMotionTrackingRequest,
} from "./jianying-motion-tracking-contract.js";
import {
	inspectJianyingMotionTracking,
	trackWithJianyingMotionRuntime,
} from "./jianying-motion-tracking/runtime.js";

export interface SetupJianyingMotionTrackingIPCOptions {
	getMainWindow: () => BrowserWindow | null;
}

export interface JianyingMotionTrackingIPCController {
	dispose: () => void;
}

function assertTrustedMainFrame({
	event,
	mainWindow,
}: {
	event: IpcMainInvokeEvent;
	mainWindow: BrowserWindow | null;
}) {
	if (
		!mainWindow ||
		mainWindow.isDestroyed() ||
		mainWindow.webContents.isDestroyed() ||
		event.sender !== mainWindow.webContents ||
		event.senderFrame === null ||
		event.senderFrame !== mainWindow.webContents.mainFrame
	) {
		throw new Error("本机运动跟踪拒绝了非主窗口请求");
	}
}

export function setupJianyingMotionTrackingIPC({
	getMainWindow,
}: SetupJianyingMotionTrackingIPCOptions): JianyingMotionTrackingIPCController {
	const activeTasks = new Map<string, AbortController>();
	ipcMain.removeHandler(JIANYING_MOTION_TRACKING_INSPECT_CHANNEL);
	ipcMain.removeHandler(JIANYING_MOTION_TRACKING_TRACK_CHANNEL);
	ipcMain.removeHandler(JIANYING_MOTION_TRACKING_CANCEL_CHANNEL);
	ipcMain.handle(JIANYING_MOTION_TRACKING_INSPECT_CHANNEL, (event) => {
		assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
		return inspectJianyingMotionTracking();
	});
	ipcMain.handle(
		JIANYING_MOTION_TRACKING_TRACK_CHANNEL,
		async (event, request: JianyingMotionTrackingRequest) => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			if (!request?.taskId || activeTasks.has(request.taskId)) {
				throw new Error("运动跟踪任务无效或已在运行");
			}
			if (activeTasks.size > 0) {
				throw new Error("已有运动跟踪任务正在运行");
			}
			const controller = new AbortController();
			const abortOnSenderDestroyed = () => controller.abort();
			event.sender.once("destroyed", abortOnSenderDestroyed);
			activeTasks.set(request.taskId, controller);
			try {
				return await trackWithJianyingMotionRuntime({
					request,
					signal: controller.signal,
					onProgress: (progress) => {
						if (event.sender.isDestroyed()) return;
						event.sender.send(JIANYING_MOTION_TRACKING_PROGRESS_CHANNEL, {
							...progress,
							taskId: request.taskId,
						});
					},
				});
			} finally {
				event.sender.removeListener("destroyed", abortOnSenderDestroyed);
				activeTasks.delete(request.taskId);
			}
		}
	);
	ipcMain.handle(
		JIANYING_MOTION_TRACKING_CANCEL_CHANNEL,
		(event, request: JianyingMotionTrackingCancelRequest) => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			if (request?.taskId) activeTasks.get(request.taskId)?.abort();
		}
	);
	return {
		dispose: () => {
			for (const controller of activeTasks.values()) controller.abort();
			activeTasks.clear();
			ipcMain.removeHandler(JIANYING_MOTION_TRACKING_INSPECT_CHANNEL);
			ipcMain.removeHandler(JIANYING_MOTION_TRACKING_TRACK_CHANNEL);
			ipcMain.removeHandler(JIANYING_MOTION_TRACKING_CANCEL_CHANNEL);
		},
	};
}
