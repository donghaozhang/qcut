import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
	type QCutJianyingProjectExportResult,
} from "../types/qcut-jianying-project-export-api";

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
	JIANYING_PROJECT_EXPORT_REQUEST_CHANNEL,
	JIANYING_PROJECT_EXPORT_RESPONSE_CHANNEL,
	requestQCutJianyingProjectExportFromRenderer,
} from "../claude/handlers/qcut-jianying-project-export-handler";

function result({
	projectId = "project-1",
}: {
	projectId?: string;
} = {}): QCutJianyingProjectExportResult {
	return {
		outcome: "cancelled",
		projectId,
		schema: QCUT_JIANYING_PROJECT_EXPORT_RESULT_SCHEMA,
		schemaVersion: 1,
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
			request: { projectId: string };
			requestId: string;
		},
	};
}

function emitResponse({ args }: { args: unknown[] }): void {
	for (const listener of ipcListeners.get(
		JIANYING_PROJECT_EXPORT_RESPONSE_CHANNEL
	) ?? []) {
		listener(...args);
	}
}

beforeEach(() => {
	ipcListeners.clear();
});

describe("Jianying project export main-process handler", () => {
	it("ignores subframes and accepts a strict main-frame result", async () => {
		const { mainFrame, webContents, win } = createWindow();
		const promise = requestQCutJianyingProjectExportFromRenderer({
			request: { projectId: "project-1" },
			timeoutMs: 1000,
			win,
		});
		const sent = sentRequest({ webContents });
		expect(sent.channel).toBe(JIANYING_PROJECT_EXPORT_REQUEST_CHANNEL);
		expect(sent.data.request).toEqual({ projectId: "project-1" });

		emitResponse({
			args: [
				{ sender: webContents, senderFrame: {} },
				{ requestId: sent.data.requestId, result: result() },
			],
		});
		expect(
			ipcListeners.get(JIANYING_PROJECT_EXPORT_RESPONSE_CHANNEL)?.size
		).toBe(1);
		emitResponse({
			args: [{ sender: webContents, senderFrame: mainFrame }, "not-a-record"],
		});
		emitResponse({
			args: [
				{ sender: webContents, senderFrame: mainFrame },
				{ requestId: "unrelated-request", result: result() },
			],
		});
		emitResponse({
			args: [
				{ sender: webContents, senderFrame: mainFrame },
				{ requestId: sent.data.requestId, result: result() },
			],
		});

		await expect(promise).resolves.toEqual(result());
		expect(
			ipcListeners.get(JIANYING_PROJECT_EXPORT_RESPONSE_CHANNEL)?.size ?? 0
		).toBe(0);
	});

	it("rejects a trusted result for a different project", async () => {
		const { mainFrame, webContents, win } = createWindow();
		const promise = requestQCutJianyingProjectExportFromRenderer({
			request: { projectId: "project-1" },
			timeoutMs: 1000,
			win,
		});
		const sent = sentRequest({ webContents });

		emitResponse({
			args: [
				{ sender: webContents, senderFrame: mainFrame },
				{
					requestId: sent.data.requestId,
					result: result({ projectId: "another-project" }),
				},
			],
		});

		await expect(promise).rejects.toThrow("requested project");
	});

	it("times out and removes its response listener", async () => {
		const { win } = createWindow();
		await expect(
			requestQCutJianyingProjectExportFromRenderer({
				request: { projectId: "project-1" },
				timeoutMs: 5,
				win,
			})
		).rejects.toThrow("Timeout waiting");
		expect(
			ipcListeners.get(JIANYING_PROJECT_EXPORT_RESPONSE_CHANNEL)?.size ?? 0
		).toBe(0);
	});
});
