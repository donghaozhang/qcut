import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => {
	const listeners = new Map<string, (...args: unknown[]) => void>();
	return {
		listeners,
		ipcMain: {
			on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
				listeners.set(channel, listener);
			}),
			removeListener: vi.fn(
				(channel: string, listener: (...args: unknown[]) => void) => {
					if (listeners.get(channel) === listener) listeners.delete(channel);
				}
			),
		},
	};
});

vi.mock("electron", () => ({ ipcMain: electronMocks.ipcMain }));

import {
	requestMediaDeleteFromRenderer,
	requestMediaImportFromRenderer,
} from "../handlers/claude-media-renderer-handler";

function createWindow({
	responseError,
}: {
	responseError?: string;
} = {}): Electron.BrowserWindow {
	const webContents = {
		isDestroyed: () => false,
		mainFrame: {},
		send: vi.fn((channel: string, payload: { requestId: string }) => {
			const responseChannel = `${channel}:response`;
			const listener = electronMocks.listeners.get(responseChannel);
			if (!listener) throw new Error(`Missing listener for ${responseChannel}`);
			queueMicrotask(() =>
				listener(
					{
						sender: webContents,
						senderFrame: webContents.mainFrame,
					},
					{
						...(responseError ? { error: responseError } : {}),
						requestId: payload.requestId,
					}
				)
			);
		}),
	};
	return {
		isDestroyed: () => false,
		webContents,
	} as unknown as Electron.BrowserWindow;
}

describe("Claude media renderer acknowledgement", () => {
	beforeEach(() => {
		electronMocks.listeners.clear();
		vi.clearAllMocks();
	});

	it("waits for renderer persistence before resolving an import", async () => {
		const win = createWindow();

		await expect(
			requestMediaImportFromRenderer({
				payload: {
					id: "media-1",
					name: "reference.gif",
					path: "/project/media/reference.gif",
					projectId: "project-1",
					size: 128,
					type: "image",
				},
				win,
			})
		).resolves.toBeUndefined();

		expect(win.webContents.send).toHaveBeenCalledWith(
			"claude:media:imported",
			expect.objectContaining({
				id: "media-1",
				requestId: expect.any(String),
			})
		);
		expect(electronMocks.listeners.size).toBe(0);
	});

	it("propagates a renderer persistence failure", async () => {
		const win = createWindow({ responseError: "IndexedDB write failed" });

		await expect(
			requestMediaImportFromRenderer({
				payload: {
					id: "media-1",
					name: "reference.gif",
					path: "/project/media/reference.gif",
					projectId: "project-1",
					size: 128,
					type: "image",
				},
				win,
			})
		).rejects.toThrow("IndexedDB write failed");
	});

	it("acknowledges renderer deletion separately", async () => {
		const win = createWindow();

		await expect(
			requestMediaDeleteFromRenderer({
				payload: { mediaId: "media-1", projectId: "project-1" },
				win,
			})
		).resolves.toBeUndefined();

		expect(win.webContents.send).toHaveBeenCalledWith(
			"claude:media:deleted",
			expect.objectContaining({ mediaId: "media-1" })
		);
	});
});
