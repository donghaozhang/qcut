// @vitest-environment node
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JIANYING_COVER_LIST_CHANNEL } from "../jianying-cover-contract.js";

const { handle, list } = vi.hoisted(() => ({ handle: vi.fn(), list: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle } }));
vi.mock("../jianying-cover-private-cache.js", () => ({
	listPrivateCovers: list,
}));
import { registerJianyingCoverHandlers } from "../main-ipc/jianying-cover-handlers.js";

function setup() {
	const mainFrame = {};
	const webContents = { mainFrame, isDestroyed: vi.fn(() => false) };
	const window = { webContents, isDestroyed: vi.fn(() => false) };
	const getMainWindow = vi.fn(() => window as unknown as BrowserWindow | null);
	registerJianyingCoverHandlers({ getMainWindow });
	expect(handle).toHaveBeenCalledWith(
		JIANYING_COVER_LIST_CHANNEL,
		expect.any(Function)
	);
	const invoke = handle.mock.calls[0][1] as (
		event: IpcMainInvokeEvent
	) => Promise<unknown>;
	const event = {
		sender: webContents,
		senderFrame: mainFrame,
	} as unknown as IpcMainInvokeEvent;
	return { window, webContents, getMainWindow, invoke, event };
}

describe("private cover IPC", () => {
	beforeEach(() => vi.clearAllMocks());
	it("reads the owned catalog for the main frame", async () => {
		const { invoke, event } = setup();
		list.mockResolvedValue({ entries: [] });
		await expect(invoke(event)).resolves.toEqual({ entries: [] });
		expect(list).toHaveBeenCalledExactlyOnceWith();
	});
	it("rejects other windows, subframes, and detached frames before disk access", async () => {
		const { invoke, event } = setup();
		await expect(
			invoke({ ...event, sender: {} } as IpcMainInvokeEvent)
		).rejects.toThrow("main window");
		await expect(
			invoke({ ...event, senderFrame: {} } as IpcMainInvokeEvent)
		).rejects.toThrow("main window");
		await expect(invoke({ ...event, senderFrame: null })).rejects.toThrow(
			"main window"
		);
		expect(list).not.toHaveBeenCalled();
	});
	it("rejects absent or destroyed main windows", async () => {
		const { invoke, event, window, webContents, getMainWindow } = setup();
		window.isDestroyed.mockReturnValue(true);
		await expect(invoke(event)).rejects.toThrow("main window");
		window.isDestroyed.mockReturnValue(false);
		webContents.isDestroyed.mockReturnValue(true);
		await expect(invoke(event)).rejects.toThrow("main window");
		getMainWindow.mockReturnValue(null);
		await expect(invoke(event)).rejects.toThrow("main window");
		expect(list).not.toHaveBeenCalled();
	});
	it("propagates integrity failures without returning partial assets", async () => {
		const { invoke, event } = setup();
		list.mockRejectedValue(new Error("checksum mismatch"));
		await expect(invoke(event)).rejects.toThrow("checksum mismatch");
	});
});
