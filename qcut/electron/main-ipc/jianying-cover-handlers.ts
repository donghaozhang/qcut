import { ipcMain } from "electron";
import { JIANYING_COVER_LIST_CHANNEL } from "../jianying-cover-contract.js";
import { listPrivateCovers } from "../jianying-cover-private-cache.js";
import type { MainIpcDeps } from "./types.js";

export function registerJianyingCoverHandlers({
	getMainWindow,
}: Pick<MainIpcDeps, "getMainWindow">): void {
	ipcMain.handle(JIANYING_COVER_LIST_CHANNEL, async (event) => {
		const mainWindow = getMainWindow();
		if (
			!mainWindow ||
			mainWindow.isDestroyed() ||
			mainWindow.webContents.isDestroyed() ||
			event.sender !== mainWindow.webContents ||
			event.senderFrame === null ||
			event.senderFrame !== mainWindow.webContents.mainFrame
		) {
			throw new Error("Cover cache rejects requests outside the main window");
		}
		return listPrivateCovers();
	});
}
