import { describe, it, expect } from "vitest";
import {
	assertRendererWindowReady,
	assertIpcMainReady,
} from "../claude/utils/renderer-ipc-guard";
import { HttpError } from "../claude/utils/http-router";

describe("renderer-ipc-guard", () => {
	describe("assertRendererWindowReady", () => {
		it("accepts a window with live webContents send", () => {
			const windowLike = {
				webContents: {
					send: () => undefined,
					isDestroyed: () => false,
				},
				isDestroyed: () => false,
			} as unknown as Electron.BrowserWindow;

			expect(() =>
				assertRendererWindowReady({
					win: windowLike,
					action: "timeline request",
				})
			).not.toThrow();
		});

		it("rejects when renderer send is missing", () => {
			const windowLike = {
				webContents: {},
				isDestroyed: () => false,
			} as unknown as Electron.BrowserWindow;

			try {
				assertRendererWindowReady({
					win: windowLike,
					action: "batch cut execution",
				});
				throw new Error("Expected assertRendererWindowReady to throw");
			} catch (error) {
				expect(error).toBeInstanceOf(HttpError);
				expect((error as HttpError).status).toBe(503);
				expect((error as Error).message).toContain(
					"Editor renderer not available for batch cut execution"
				);
			}
		});

		it("rejects when window is destroyed", () => {
			const windowLike = {
				webContents: {
					send: () => undefined,
				},
				isDestroyed: () => true,
			} as unknown as Electron.BrowserWindow;

			expect(() =>
				assertRendererWindowReady({
					win: windowLike,
					action: "batch cut execution",
				})
			).toThrow("Editor window closed during batch cut execution");
		});
	});

	describe("assertIpcMainReady", () => {
		it("accepts ipcMain shape when once is not required", () => {
			expect(() =>
				assertIpcMainReady({
					ipcMainInstance: {
						on: () => undefined,
						removeListener: () => undefined,
					},
					action: "batch cut execution",
					requiresOnce: false,
				})
			).not.toThrow();
		});

		it("rejects when once is required but unavailable", () => {
			expect(() =>
				assertIpcMainReady({
					ipcMainInstance: {
						on: () => undefined,
						removeListener: () => undefined,
					},
					action: "timeline request",
					requiresOnce: true,
				})
			).toThrow("IPC bridge unavailable for timeline request");
		});
	});
});
