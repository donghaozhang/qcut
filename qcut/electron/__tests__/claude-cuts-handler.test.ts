import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("electron", () => ({
	app: {
		getPath: vi.fn((name: string) => {
			if (name === "documents") return "/mock/Documents";
			if (name === "temp") return "/mock/temp";
			return "/mock/unknown";
		}),
		getVersion: vi.fn(() => "0.0.1-test"),
		isPackaged: false,
	},
	ipcMain: {
		handle: vi.fn(),
		on: vi.fn(),
		once: vi.fn(),
		removeListener: vi.fn(),
	},
	BrowserWindow: {
		getAllWindows: vi.fn(() => []),
		fromWebContents: vi.fn(() => null),
	},
}));

vi.mock("electron-log", () => ({
	default: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		log: vi.fn(),
	},
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	log: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { ipcMain, BrowserWindow } from "electron";
import {
	executeBatchCuts,
	validateBatchCutRequest,
} from "../claude/handlers/claude-cuts-handler";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("claude-cuts-handler", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("validateBatchCutRequest", () => {
		it("rejects missing elementId", () => {
			expect(() =>
				validateBatchCutRequest({
					elementId: "",
					cuts: [{ start: 0, end: 1 }],
				})
			).toThrow("Missing or invalid 'elementId'");
		});

		it("rejects empty cuts array", () => {
			expect(() =>
				validateBatchCutRequest({ elementId: "el_1", cuts: [] })
			).toThrow("Missing or empty 'cuts' array");
		});

		it("rejects cuts with non-number start/end", () => {
			expect(() =>
				validateBatchCutRequest({
					elementId: "el_1",
					cuts: [{ start: "a" as unknown as number, end: 1 }],
				})
			).toThrow("start and end must be numbers");
		});

		it("rejects negative times", () => {
			expect(() =>
				validateBatchCutRequest({
					elementId: "el_1",
					cuts: [{ start: -1, end: 1 }],
				})
			).toThrow("non-negative");
		});

		it("rejects start >= end", () => {
			expect(() =>
				validateBatchCutRequest({
					elementId: "el_1",
					cuts: [{ start: 5, end: 3 }],
				})
			).toThrow("must be less than end");
		});

		it("rejects overlapping cuts", () => {
			expect(() =>
				validateBatchCutRequest({
					elementId: "el_1",
					cuts: [
						{ start: 2, end: 5 },
						{ start: 4, end: 7 },
					],
				})
			).toThrow("Overlapping cuts");
		});

		it("accepts valid non-overlapping cuts", () => {
			expect(() =>
				validateBatchCutRequest({
					elementId: "el_1",
					cuts: [
						{ start: 1, end: 3 },
						{ start: 5, end: 8 },
						{ start: 10, end: 12 },
					],
				})
			).not.toThrow();
		});

		it("accepts adjacent cuts (not overlapping)", () => {
			expect(() =>
				validateBatchCutRequest({
					elementId: "el_1",
					cuts: [
						{ start: 1, end: 3 },
						{ start: 3, end: 5 },
					],
				})
			).not.toThrow();
		});
	});

	describe("executeBatchCuts", () => {
		it("sends IPC request and resolves on response", async () => {
			const send = vi.fn();
			const mockWindow = {
				webContents: { send },
			} as unknown as BrowserWindow;

			// Capture the IPC listener callback
			let ipcCallback: (event: unknown, data: unknown) => void = () => {};
			vi.mocked(ipcMain.on).mockImplementation((channel, callback) => {
				if (channel === "claude:timeline:executeCuts:response") {
					ipcCallback = callback as typeof ipcCallback;
				}
				return ipcMain;
			});

			const promise = executeBatchCuts(mockWindow, {
				elementId: "el_abc",
				cuts: [{ start: 2, end: 4 }],
				ripple: true,
			});

			// Verify IPC was sent
			expect(send).toHaveBeenCalledWith(
				"claude:timeline:executeCuts",
				expect.objectContaining({
					elementId: "el_abc",
					cuts: [{ start: 2, end: 4 }],
					ripple: true,
				})
			);

			// Extract the requestId from the sent data
			const sentData = send.mock.calls[0][1] as { requestId: string };

			// Simulate renderer response
			ipcCallback(
				{},
				{
					requestId: sentData.requestId,
					result: {
						cutsApplied: 1,
						elementsRemoved: 1,
						remainingElements: [
							{ id: "el_abc", startTime: 0, duration: 2 },
							{ id: "el_def", startTime: 2, duration: 6 },
						],
						totalRemovedDuration: 2,
					},
				}
			);

			const result = await promise;
			expect(result.cutsApplied).toBe(1);
			expect(result.elementsRemoved).toBe(1);
			expect(result.totalRemovedDuration).toBe(2);
			expect(result.remainingElements).toHaveLength(2);
		});

		it("ignores responses with mismatched requestId", async () => {
			const send = vi.fn();
			const mockWindow = {
				webContents: { send },
			} as unknown as BrowserWindow;

			let ipcCallback: (event: unknown, data: unknown) => void = () => {};
			vi.mocked(ipcMain.on).mockImplementation((channel, callback) => {
				if (channel === "claude:timeline:executeCuts:response") {
					ipcCallback = callback as typeof ipcCallback;
				}
				return ipcMain;
			});

			const promise = executeBatchCuts(mockWindow, {
				elementId: "el_abc",
				cuts: [{ start: 1, end: 2 }],
			});

			// Send wrong requestId — should be ignored
			ipcCallback(
				{},
				{
					requestId: "wrong_id",
					result: {
						cutsApplied: 99,
						elementsRemoved: 0,
						remainingElements: [],
						totalRemovedDuration: 0,
					},
				}
			);

			// Send correct requestId
			const sentData = send.mock.calls[0][1] as { requestId: string };
			ipcCallback(
				{},
				{
					requestId: sentData.requestId,
					result: {
						cutsApplied: 1,
						elementsRemoved: 1,
						remainingElements: [],
						totalRemovedDuration: 1,
					},
				}
			);

			const result = await promise;
			expect(result.cutsApplied).toBe(1);
		});

		it("defaults ripple to true when not specified", async () => {
			const send = vi.fn();
			const mockWindow = {
				webContents: { send },
			} as unknown as BrowserWindow;

			let ipcCallback: (event: unknown, data: unknown) => void = () => {};
			vi.mocked(ipcMain.on).mockImplementation((channel, callback) => {
				if (channel === "claude:timeline:executeCuts:response") {
					ipcCallback = callback as typeof ipcCallback;
				}
				return ipcMain;
			});

			const promise = executeBatchCuts(mockWindow, {
				elementId: "el_abc",
				cuts: [{ start: 1, end: 2 }],
			});

			expect(send).toHaveBeenCalledWith(
				"claude:timeline:executeCuts",
				expect.objectContaining({ ripple: true })
			);

			const sentData = send.mock.calls[0][1] as { requestId: string };
			ipcCallback(
				{},
				{
					requestId: sentData.requestId,
					result: {
						cutsApplied: 1,
						elementsRemoved: 0,
						remainingElements: [],
						totalRemovedDuration: 0,
					},
				}
			);

			await promise;
		});

		it("rejects on validation error before sending IPC", async () => {
			const mockWindow = {
				webContents: { send: vi.fn() },
			} as unknown as BrowserWindow;

			await expect(
				executeBatchCuts(mockWindow, {
					elementId: "",
					cuts: [{ start: 1, end: 2 }],
				})
			).rejects.toThrow("Missing or invalid 'elementId'");

			expect(mockWindow.webContents.send).not.toHaveBeenCalled();
		});

		it("rejects when renderer webContents is unavailable", async () => {
			const mockWindow = {
				webContents: {},
			} as unknown as BrowserWindow;

			await expect(
				executeBatchCuts(mockWindow, {
					elementId: "el_abc",
					cuts: [{ start: 1, end: 2 }],
				})
			).rejects.toThrow("Editor renderer not available for batch cut execution");
		});

		it("rejects when sending IPC throws", async () => {
			const sendError = new Error("renderer send failed");
			const send = vi.fn(() => {
				throw sendError;
			});
			const mockWindow = {
				webContents: { send },
			} as unknown as BrowserWindow;

			vi.mocked(ipcMain.on).mockImplementation(() => ipcMain);

			await expect(
				executeBatchCuts(mockWindow, {
					elementId: "el_abc",
					cuts: [{ start: 1, end: 2 }],
				})
			).rejects.toThrow("renderer send failed");

			expect(ipcMain.removeListener).toHaveBeenCalledWith(
				"claude:timeline:executeCuts:response",
				expect.any(Function)
			);
		});
	});
});
