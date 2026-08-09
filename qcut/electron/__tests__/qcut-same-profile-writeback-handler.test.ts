import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
	type QCutSameProfileWritebackResult,
} from "../types/qcut-same-profile-writeback-api";

const { ipcListeners } = vi.hoisted(() => ({
	ipcListeners: new Map<string, Set<(...args: unknown[]) => void>>(),
}));

vi.mock("electron", () => ({
	ipcMain: {
		on: (channel: string, listener: (...args: unknown[]) => void) => {
			const listeners = ipcListeners.get(channel) ?? new Set();
			listeners.add(listener);
			ipcListeners.set(channel, listeners);
		},
		removeListener: (
			channel: string,
			listener: (...args: unknown[]) => void
		) => {
			ipcListeners.get(channel)?.delete(listener);
		},
	},
}));

import {
	requestQCutSameProfileWritebackFromRenderer,
	SAME_PROFILE_WRITEBACK_REQUEST_CHANNEL,
	SAME_PROFILE_WRITEBACK_RESPONSE_CHANNEL,
} from "../claude/handlers/qcut-same-profile-writeback-handler";

function writtenResult({
	projectId = "project-1",
}: {
	projectId?: string;
} = {}): QCutSameProfileWritebackResult {
	return {
		contentSha256: "c".repeat(64),
		operation: "writeback",
		outcome: "written",
		projectId,
		replacedMirrorCount: 4,
		schema: QCUT_SAME_PROFILE_WRITEBACK_RESULT_SCHEMA,
		schemaVersion: 1,
		transactionId: "transaction-1",
		warnings: [],
	};
}

function createWindow() {
	const mainFrame = {};
	const webContents = {
		isDestroyed: () => false,
		mainFrame,
		send: vi.fn(),
	};
	return {
		mainFrame,
		webContents,
		win: {
			isDestroyed: () => false,
			webContents,
		} as unknown as Electron.BrowserWindow,
	};
}

function sentRequest({
	webContents,
}: {
	webContents: ReturnType<typeof createWindow>["webContents"];
}) {
	const call = webContents.send.mock.calls[0];
	if (call === undefined) throw new Error("Renderer request was not sent.");
	return {
		channel: call[0] as string,
		data: call[1] as {
			request: { action: string; projectId?: string };
			requestId: string;
		},
	};
}

function emitIpc({
	args,
	channel = SAME_PROFILE_WRITEBACK_RESPONSE_CHANNEL,
}: {
	args: unknown[];
	channel?: string;
}): void {
	for (const listener of ipcListeners.get(channel) ?? []) {
		listener(...args);
	}
}

function listenerCount(): number {
	return ipcListeners.get(SAME_PROFILE_WRITEBACK_RESPONSE_CHANNEL)?.size ?? 0;
}

beforeEach(() => {
	ipcListeners.clear();
});

describe("same-profile writeback main-process handler", () => {
	it("ignores a forged subframe and accepts a strict main-frame result", async () => {
		const { mainFrame, webContents, win } = createWindow();
		const promise = requestQCutSameProfileWritebackFromRenderer({
			request: { action: "writeback", projectId: "project-1" },
			timeoutMs: 1000,
			win,
		});
		const sent = sentRequest({ webContents });
		expect(sent.channel).toBe(SAME_PROFILE_WRITEBACK_REQUEST_CHANNEL);
		expect(sent.data.request).toEqual({
			action: "writeback",
			projectId: "project-1",
		});

		emitIpc({
			args: [
				{ sender: webContents, senderFrame: {} },
				{ requestId: sent.data.requestId, result: writtenResult() },
			],
		});
		expect(listenerCount()).toBe(1);
		emitIpc({
			args: [
				{ sender: webContents, senderFrame: mainFrame },
				{ requestId: sent.data.requestId, result: writtenResult() },
			],
		});

		await expect(promise).resolves.toEqual(writtenResult());
		expect(listenerCount()).toBe(0);
	});

	it("rejects a trusted result for a different project", async () => {
		const { mainFrame, webContents, win } = createWindow();
		const promise = requestQCutSameProfileWritebackFromRenderer({
			request: { action: "writeback", projectId: "project-1" },
			timeoutMs: 1000,
			win,
		});
		const { data } = sentRequest({ webContents });

		emitIpc({
			args: [
				{ sender: webContents, senderFrame: mainFrame },
				{
					requestId: data.requestId,
					result: writtenResult({ projectId: "another-project" }),
				},
			],
		});

		await expect(promise).rejects.toThrow("requested project");
		expect(listenerCount()).toBe(0);
	});

	it("rejects path-bearing renderer results", async () => {
		const { mainFrame, webContents, win } = createWindow();
		const promise = requestQCutSameProfileWritebackFromRenderer({
			request: { action: "writeback", projectId: "project-1" },
			timeoutMs: 1000,
			win,
		});
		const { data } = sentRequest({ webContents });

		emitIpc({
			args: [
				{ sender: webContents, senderFrame: mainFrame },
				{
					requestId: data.requestId,
					result: {
						...writtenResult(),
						draftDirectory: "/private/draft",
					},
				},
			],
		});

		await expect(promise).rejects.toThrow("unsupported field");
		expect(listenerCount()).toBe(0);
	});

	it("times out and removes its response listener", async () => {
		const { win } = createWindow();
		await expect(
			requestQCutSameProfileWritebackFromRenderer({
				request: { action: "recover", recoveryToken: "selection-1" },
				timeoutMs: 5,
				win,
			})
		).rejects.toThrow("Timeout waiting");
		expect(listenerCount()).toBe(0);
	});
});
