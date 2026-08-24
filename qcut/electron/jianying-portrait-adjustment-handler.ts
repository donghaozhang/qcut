import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import {
	JIANYING_PORTRAIT_ADJUSTMENT_DETECT_CHANNEL,
	JIANYING_PORTRAIT_ADJUSTMENT_INSPECT_CHANNEL,
	JIANYING_PORTRAIT_ADJUSTMENT_RENDER_CHANNEL,
} from "./jianying-portrait-adjustment-contract.js";
import { createJianyingPortraitAdjustmentProvider } from "./jianying-portrait-adjustment-runtime/provider.js";
import {
	parseJianyingPortraitDetectRequest,
	parseJianyingPortraitInspectRequest,
	parseJianyingPortraitRenderRequest,
} from "./jianying-portrait-adjustment-runtime/request.js";

export interface JianyingPortraitAdjustmentIPCController {
	dispose: () => void;
}

export interface SetupJianyingPortraitAdjustmentIPCOptions {
	getMainWindow: () => BrowserWindow | null;
	provider?: ReturnType<typeof createJianyingPortraitAdjustmentProvider>;
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
		throw new Error("剪映美颜美体拒绝了非主窗口请求");
	}
}

export function setupJianyingPortraitAdjustmentIPC({
	getMainWindow,
	provider = createJianyingPortraitAdjustmentProvider(),
}: SetupJianyingPortraitAdjustmentIPCOptions): JianyingPortraitAdjustmentIPCController {
	ipcMain.removeHandler(JIANYING_PORTRAIT_ADJUSTMENT_INSPECT_CHANNEL);
	ipcMain.removeHandler(JIANYING_PORTRAIT_ADJUSTMENT_RENDER_CHANNEL);
	ipcMain.removeHandler(JIANYING_PORTRAIT_ADJUSTMENT_DETECT_CHANNEL);
	ipcMain.handle(
		JIANYING_PORTRAIT_ADJUSTMENT_INSPECT_CHANNEL,
		(event, request: unknown) => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			return provider.inspect(parseJianyingPortraitInspectRequest({ request }));
		}
	);
	ipcMain.handle(
		JIANYING_PORTRAIT_ADJUSTMENT_RENDER_CHANNEL,
		(event, request: unknown) => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			return provider.render(parseJianyingPortraitRenderRequest({ request }));
		}
	);
	ipcMain.handle(
		JIANYING_PORTRAIT_ADJUSTMENT_DETECT_CHANNEL,
		(event, request: unknown) => {
			assertTrustedMainFrame({ event, mainWindow: getMainWindow() });
			return provider.detect(parseJianyingPortraitDetectRequest({ request }));
		}
	);
	return {
		dispose: () => {
			ipcMain.removeHandler(JIANYING_PORTRAIT_ADJUSTMENT_INSPECT_CHANNEL);
			ipcMain.removeHandler(JIANYING_PORTRAIT_ADJUSTMENT_RENDER_CHANNEL);
			ipcMain.removeHandler(JIANYING_PORTRAIT_ADJUSTMENT_DETECT_CHANNEL);
			void provider.clear();
		},
	};
}
