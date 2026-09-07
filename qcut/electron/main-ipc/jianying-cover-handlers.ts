import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
	JIANYING_COVER_LIST_CHANNEL,
	JIANYING_COVER_LAYOUT_CHANNEL,
} from "../jianying-cover-contract.js";
import { listPrivateCovers } from "../jianying-cover-private-cache.js";
import { preparePrivateCoverTextLayout } from "../jianying-cover-prepare-layout.js";
import type { MainIpcDeps } from "./types.js";

export function registerJianyingCoverHandlers({
	getMainWindow,
}: Pick<MainIpcDeps, "getMainWindow">): void {
	const assertTrusted = ({ event }: { event: IpcMainInvokeEvent }) => {
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
	};
	ipcMain.handle(JIANYING_COVER_LIST_CHANNEL, async (event) => {
		assertTrusted({ event });
		return listPrivateCovers();
	});
	ipcMain.handle(
		JIANYING_COVER_LAYOUT_CHANNEL,
		async (event, request: unknown) => {
			assertTrusted({ event });
			return preparePrivateCoverTextLayout({ request });
		}
	);
}
