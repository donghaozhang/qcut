import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => {
	const listeners = new Map<string, (...args: unknown[]) => void>();
	return {
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
		listeners,
	};
});

vi.mock("electron", () => ({ ipcMain: electronMocks.ipcMain }));

import { requestRendererMutation } from "../handlers/claude-renderer-mutation-handler";
import { requestAddElementFromRenderer } from "../handlers/claude-timeline-operations";

function createWindow(): Electron.BrowserWindow {
	const webContents = {
		isDestroyed: () => false,
		mainFrame: {},
		send: vi.fn(),
	};
	return {
		isDestroyed: () => false,
		webContents,
	} as unknown as Electron.BrowserWindow;
}

function startRequest({
	timeoutMs = 100,
	win,
}: {
	timeoutMs?: number;
	win: Electron.BrowserWindow;
}): Promise<void> {
	return requestRendererMutation({
		channel: "test:mutation",
		payload: { value: 1 },
		requestIdPrefix: "test",
		responseChannel: "test:mutation:response",
		timeoutMessage: "test mutation timed out",
		timeoutMs,
		win,
	});
}

describe("renderer mutation acknowledgement", () => {
	beforeEach(() => {
		vi.useRealTimers();
		electronMocks.listeners.clear();
		vi.clearAllMocks();
	});

	it("ignores malformed and uncorrelated responses before accepting the ACK", async () => {
		const win = createWindow();
		const pending = startRequest({ win });
		const listener = electronMocks.listeners.get("test:mutation:response");
		const request = vi.mocked(win.webContents.send).mock.calls[0]?.[1] as {
			requestId: string;
		};
		if (!listener) throw new Error("response listener was not registered");

		listener(
			{ sender: win.webContents, senderFrame: win.webContents.mainFrame },
			undefined
		);
		listener(
			{ sender: win.webContents, senderFrame: win.webContents.mainFrame },
			{ requestId: 1 }
		);
		listener(
			{ sender: win.webContents, senderFrame: win.webContents.mainFrame },
			{ requestId: "wrong-request" }
		);
		listener(
			{ sender: win.webContents, senderFrame: win.webContents.mainFrame },
			{ requestId: request.requestId }
		);

		await expect(pending).resolves.toBeUndefined();
		expect(electronMocks.listeners.size).toBe(0);
	});

	it("sends a correlated single-element placement request", async () => {
		const win = createWindow();
		const pending = requestAddElementFromRenderer({
			correlationId: "correlation-1",
			element: {
				duration: 5,
				id: "element-1",
				startTime: 0,
				type: "sticker",
			},
			win,
		});
		const request = vi.mocked(win.webContents.send).mock.calls[0]?.[1] as {
			requestId: string;
		};
		const listener = electronMocks.listeners.get(
			"claude:timeline:addElement:response"
		);
		if (!listener) throw new Error("response listener was not registered");

		expect(win.webContents.send).toHaveBeenCalledWith(
			"claude:timeline:addElement",
			expect.objectContaining({
				correlationId: "correlation-1",
				id: "element-1",
				requestId: expect.any(String),
			})
		);
		listener(
			{ sender: win.webContents, senderFrame: win.webContents.mainFrame },
			{ requestId: request.requestId }
		);

		await expect(pending).resolves.toBeUndefined();
	});

	it("ignores ACKs from the wrong sender or frame", async () => {
		const win = createWindow();
		const pending = startRequest({ win });
		const listener = electronMocks.listeners.get("test:mutation:response");
		const request = vi.mocked(win.webContents.send).mock.calls[0]?.[1] as {
			requestId: string;
		};
		if (!listener) throw new Error("response listener was not registered");

		listener(
			{ sender: {}, senderFrame: win.webContents.mainFrame },
			{ requestId: request.requestId }
		);
		listener(
			{ sender: win.webContents, senderFrame: {} },
			{ requestId: request.requestId }
		);
		listener(
			{ sender: win.webContents, senderFrame: win.webContents.mainFrame },
			{ requestId: request.requestId }
		);

		await expect(pending).resolves.toBeUndefined();
		expect(electronMocks.listeners.size).toBe(0);
	});

	it("times out and removes the listener after only malformed responses", async () => {
		vi.useFakeTimers();
		const win = createWindow();
		const pending = startRequest({ timeoutMs: 25, win });
		const rejection = expect(pending).rejects.toThrow(
			"test mutation timed out"
		);
		const listener = electronMocks.listeners.get("test:mutation:response");
		if (!listener) throw new Error("response listener was not registered");

		listener(
			{ sender: win.webContents, senderFrame: win.webContents.mainFrame },
			null
		);
		await vi.advanceTimersByTimeAsync(25);

		await rejection;
		expect(electronMocks.listeners.size).toBe(0);
		expect(electronMocks.ipcMain.removeListener).toHaveBeenCalledOnce();
	});
});
