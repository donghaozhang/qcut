import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import {
	JIANYING_BASIC_VIDEO_CANCEL_CHANNEL,
	JIANYING_BASIC_VIDEO_DEFLICKER_CHANNEL,
	JIANYING_BASIC_VIDEO_INSPECT_CHANNEL,
	JIANYING_BASIC_VIDEO_PROGRESS_CHANNEL,
	type JianyingBasicVideoCancelRequest,
	type JianyingDeflickerRequest,
} from "./jianying-basic-video-contract.js";
import {
	deflickerWithJianyingRuntime,
	inspectJianyingBasicVideo,
} from "./jianying-basic-video-runtime/runtime.js";

export interface JianyingBasicVideoIPCController {
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
		throw new Error("本机基础视频实验室拒绝了非主窗口请求");
	}
}

export function setupJianyingBasicVideoIPC({
	getMainWindow,
}: {
	getMainWindow: () => BrowserWindow | null;
}): JianyingBasicVideoIPCController {
	const activeTasks = new Map<string, AbortController>();
	ipcMain.removeHandler(JIANYING_BASIC_VIDEO_INSPECT_CHANNEL);
	ipcMain.removeHandler(JIANYING_BASIC_VIDEO_DEFLICKER_CHANNEL);
	ipcMain.removeHandler(JIANYING_BASIC_VIDEO_CANCEL_CHANNEL);
	ipcMain.handle(JIANYING_BASIC_VIDEO_INSPECT_CHANNEL, (event) => {
		assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
		return inspectJianyingBasicVideo();
	});
	ipcMain.handle(
		JIANYING_BASIC_VIDEO_DEFLICKER_CHANNEL,
		async (event, request: JianyingDeflickerRequest) => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			if (!request?.taskId || activeTasks.has(request.taskId)) {
				throw new Error("防闪烁任务无效或已在运行");
			}
			if (activeTasks.size > 0) {
				throw new Error("已有本机基础视频任务正在运行");
			}
			const controller = new AbortController();
			const abortOnSenderDestroyed = () => controller.abort();
			event.sender.once("destroyed", abortOnSenderDestroyed);
			activeTasks.set(request.taskId, controller);
			try {
				return await deflickerWithJianyingRuntime({
					request,
					signal: controller.signal,
					onProgress: (progress) => {
						if (event.sender.isDestroyed()) return;
						event.sender.send(JIANYING_BASIC_VIDEO_PROGRESS_CHANNEL, {
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
		JIANYING_BASIC_VIDEO_CANCEL_CHANNEL,
		(event, request: JianyingBasicVideoCancelRequest) => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			if (request?.taskId) activeTasks.get(request.taskId)?.abort();
		}
	);
	return {
		dispose: () => {
			for (const controller of activeTasks.values()) controller.abort();
			activeTasks.clear();
			ipcMain.removeHandler(JIANYING_BASIC_VIDEO_INSPECT_CHANNEL);
			ipcMain.removeHandler(JIANYING_BASIC_VIDEO_DEFLICKER_CHANNEL);
			ipcMain.removeHandler(JIANYING_BASIC_VIDEO_CANCEL_CHANNEL);
		},
	};
}
