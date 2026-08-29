import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { ClaudeLocalVideoExportRequest } from "../types/claude-local-video-export-api";

type ResponseListener = (
	event: { sender: unknown; senderFrame: unknown },
	response: unknown
) => void;

const electronMocks = vi.hoisted(() => ({
	on: vi.fn(),
	removeListener: vi.fn(),
	responseListener: undefined as ResponseListener | undefined,
}));

vi.mock("electron", () => ({
	ipcMain: {
		on: vi.fn((channel: string, listener: ResponseListener) => {
			electronMocks.on(channel, listener);
			electronMocks.responseListener = listener;
		}),
		removeListener: vi.fn((channel: string, listener: ResponseListener) => {
			electronMocks.removeListener(channel, listener);
		}),
	},
}));

vi.mock("../claude/utils/helpers.js", () => ({
	generateId: vi.fn(() => "local_video_export_test"),
}));

import { requestClaudeLocalVideoExportFromRenderer } from "../claude/handlers/claude-local-video-export-handler";

const request: ClaudeLocalVideoExportRequest = {
	filename: "runtime.mp4",
	format: "mp4",
	frameRate: 30,
	height: 1080,
	outputPath: "/tmp/runtime.mp4",
	projectId: "project-a",
	quality: "1080p",
	width: 1920,
};

function createWindow(): {
	mainFrame: object;
	webContents: {
		isDestroyed: ReturnType<typeof vi.fn>;
		mainFrame: object;
		send: ReturnType<typeof vi.fn>;
	};
	win: BrowserWindow;
} {
	const mainFrame = {};
	const webContents = {
		isDestroyed: vi.fn(() => false),
		mainFrame,
		send: vi.fn(),
	};
	return {
		mainFrame,
		webContents,
		win: {
			isDestroyed: vi.fn(() => false),
			webContents,
		} as unknown as BrowserWindow,
	};
}

describe("Claude local video export renderer request", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		electronMocks.responseListener = undefined;
	});

	it("does not accept an empty renderer error as success", async () => {
		const { mainFrame, webContents, win } = createWindow();
		const pendingExport = requestClaudeLocalVideoExportFromRenderer({
			request,
			timeoutMs: 1_000,
			win,
		});
		const listener = electronMocks.responseListener;
		if (!listener) throw new Error("Renderer response listener missing.");

		listener(
			{ sender: webContents, senderFrame: mainFrame },
			{ error: "", requestId: "local_video_export_test" }
		);
		expect(electronMocks.removeListener).not.toHaveBeenCalled();

		listener(
			{ sender: webContents, senderFrame: mainFrame },
			{ requestId: "local_video_export_test", success: true }
		);
		await expect(pendingExport).resolves.toBeUndefined();
		expect(electronMocks.removeListener).toHaveBeenCalledTimes(1);
	});

	it("propagates a non-empty renderer error", async () => {
		const { mainFrame, webContents, win } = createWindow();
		const pendingExport = requestClaudeLocalVideoExportFromRenderer({
			request,
			timeoutMs: 1_000,
			win,
		});
		const listener = electronMocks.responseListener;
		if (!listener) throw new Error("Renderer response listener missing.");

		listener(
			{ sender: webContents, senderFrame: mainFrame },
			{ error: "  muxer failed  ", requestId: "local_video_export_test" }
		);

		await expect(pendingExport).rejects.toThrow("muxer failed");
	});
});
