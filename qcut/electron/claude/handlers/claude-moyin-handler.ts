/**
 * Claude Moyin (Director) Handler
 *
 * Provides CLI/API control for the moyin script workflow:
 * set script text, trigger parse, and poll status.
 *
 * @module electron/claude/handlers/claude-moyin-handler
 */

import { ipcMain, BrowserWindow, type IpcMainEvent } from "electron";
import { generateId } from "../utils/helpers.js";

const REQUEST_TIMEOUT_MS = 10_000;

export interface MoyinStatusResponse {
	parseStatus: string;
	activeStep: string;
	pipelineProgress: Record<string, string>;
	characters: number;
	scenes: number;
	episodes: number;
	shots: number;
}

/**
 * Push raw script text into the moyin textarea.
 * Fire-and-forget — renderer updates the store synchronously.
 */
export function requestSetScript(win: BrowserWindow, text: string): void {
	win.webContents.send("claude:moyin:set-script", { text });
}

/**
 * Trigger the "Parse Script" button in the moyin panel.
 * Fire-and-forget — renderer calls parseScript() on the store.
 */
export function requestTriggerParse(win: BrowserWindow): void {
	win.webContents.send("claude:moyin:trigger-parse", {});
}

/**
 * Trigger the "Generate Script" action in the moyin panel.
 * Fire-and-forget — renderer calls generateScript() on the store.
 */
export function requestGenerateScript(
	win: BrowserWindow,
	idea: string,
	options?: { genre?: string; targetDuration?: string }
): void {
	win.webContents.send("claude:moyin:generate-script", {
		idea,
		genre: options?.genre,
		targetDuration: options?.targetDuration,
	});
}

/**
 * Request current moyin pipeline status from renderer.
 * Uses request-response IPC pattern with timeout.
 */
export async function requestMoyinStatus(
	win: BrowserWindow
): Promise<MoyinStatusResponse> {
	return new Promise((resolve, reject) => {
		let resolved = false;
		const requestId = generateId("req");

		const timeout = setTimeout(() => {
			if (resolved) return;
			resolved = true;
			ipcMain.removeListener("claude:moyin:status:response", handler);
			reject(new Error("Timeout waiting for moyin status"));
		}, REQUEST_TIMEOUT_MS);

		const handler = (
			_event: IpcMainEvent,
			data: {
				requestId: string;
				result?: MoyinStatusResponse;
				error?: string;
			}
		) => {
			if (data.requestId !== requestId || resolved) return;
			resolved = true;
			clearTimeout(timeout);
			ipcMain.removeListener("claude:moyin:status:response", handler);
			if (data.error) {
				reject(new Error(data.error));
			} else if (data.result) {
				resolve(data.result);
			} else {
				reject(new Error("Renderer returned empty moyin status"));
			}
		};

		ipcMain.on("claude:moyin:status:response", handler);
		win.webContents.send("claude:moyin:status:request", { requestId });
	});
}

export interface MoyinExportResponse {
	title: string;
	genre?: string;
	logline?: string;
	language: string;
	targetDuration?: string;
	characters: Record<string, unknown>[];
	scenes: Record<string, unknown>[];
	episodes: Record<string, unknown>[];
	shots: Record<string, unknown>[];
}

/**
 * Request full moyin script data export from renderer.
 * Uses request-response IPC pattern with timeout.
 */
export async function requestMoyinExport(
	win: BrowserWindow
): Promise<MoyinExportResponse> {
	return new Promise((resolve, reject) => {
		let resolved = false;
		const requestId = generateId("req");

		const timeout = setTimeout(() => {
			if (resolved) return;
			resolved = true;
			ipcMain.removeListener("claude:moyin:export:response", handler);
			reject(new Error("Timeout waiting for moyin export"));
		}, REQUEST_TIMEOUT_MS);

		const handler = (
			_event: IpcMainEvent,
			data: {
				requestId: string;
				result?: MoyinExportResponse;
				error?: string;
			}
		) => {
			if (data.requestId !== requestId || resolved) return;
			resolved = true;
			clearTimeout(timeout);
			ipcMain.removeListener("claude:moyin:export:response", handler);
			if (data.error) {
				reject(new Error(data.error));
			} else if (data.result) {
				resolve(data.result);
			} else {
				reject(new Error("Renderer returned empty moyin export"));
			}
		};

		ipcMain.on("claude:moyin:export:response", handler);
		win.webContents.send("claude:moyin:export:request", { requestId });
	});
}
