import { ipcMain, type BrowserWindow, type IpcMainEvent } from "electron";
import * as path from "node:path";
import {
	CLAUDE_LOCAL_VIDEO_EXPORT_REQUEST_CHANNEL,
	CLAUDE_LOCAL_VIDEO_EXPORT_RESPONSE_CHANNEL,
	type ClaudeLocalVideoExportRendererResponse,
	type ClaudeLocalVideoExportRequest,
} from "../../types/claude-local-video-export-api.js";
import { generateId } from "../utils/helpers.js";

export const LOCAL_VIDEO_EXPORT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function validateLocalVideoExportRequest({
	request,
}: {
	request: ClaudeLocalVideoExportRequest;
}): ClaudeLocalVideoExportRequest {
	if (
		request.format !== "mp4" ||
		!path.isAbsolute(request.outputPath) ||
		path.extname(request.outputPath).toLowerCase() !== ".mp4"
	) {
		throw new Error(
			"Renderer export requires an absolute local .mp4 output path."
		);
	}
	if (
		!Number.isInteger(request.width) ||
		request.width <= 0 ||
		!Number.isInteger(request.height) ||
		request.height <= 0
	) {
		throw new Error("Renderer export dimensions must be positive integers.");
	}
	if (![24, 25, 30, 50, 60].includes(request.frameRate)) {
		throw new Error("Renderer export frame rate is unsupported.");
	}
	if (!request.projectId || !request.filename) {
		throw new Error("Renderer export requires a project and filename.");
	}
	return request;
}

function parseMatchedRendererResponse({
	requestId,
	response,
}: {
	requestId: string;
	response: unknown;
}): ClaudeLocalVideoExportRendererResponse | null {
	if (typeof response !== "object" || response === null) return null;
	const record = response as Record<string, unknown>;
	const errorMessage =
		typeof record.error === "string" ? record.error.trim() : "";
	const isMatched =
		record.requestId === requestId &&
		(record.success === true || errorMessage.length > 0) &&
		!(record.success === true && errorMessage.length > 0);
	if (!isMatched) return null;
	return errorMessage.length > 0
		? { error: errorMessage, requestId }
		: { requestId, success: true };
}

export async function requestClaudeLocalVideoExportFromRenderer({
	request,
	timeoutMs = LOCAL_VIDEO_EXPORT_TIMEOUT_MS,
	win,
}: {
	request: ClaudeLocalVideoExportRequest;
	timeoutMs?: number;
	win: BrowserWindow;
}): Promise<void> {
	const validatedRequest = validateLocalVideoExportRequest({ request });
	if (win.isDestroyed() || win.webContents.isDestroyed()) {
		throw new Error("QCut main window is unavailable.");
	}
	await new Promise<void>((resolve, reject) => {
		const requestId = generateId("local_video_export");
		let settled = false;
		const cleanup = (): void => {
			ipcMain.removeListener(
				CLAUDE_LOCAL_VIDEO_EXPORT_RESPONSE_CHANNEL,
				handler
			);
			clearTimeout(timeout);
		};
		const fail = ({ error }: { error: Error }): void => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const handler = (event: IpcMainEvent, response: unknown): void => {
			const matchedResponse = parseMatchedRendererResponse({
				requestId,
				response,
			});
			if (
				settled ||
				event.sender !== win.webContents ||
				event.senderFrame !== win.webContents.mainFrame ||
				!matchedResponse
			) {
				return;
			}
			if (matchedResponse.error) {
				fail({ error: new Error(matchedResponse.error) });
				return;
			}
			settled = true;
			cleanup();
			resolve();
		};
		const timeout = setTimeout(() => {
			fail({ error: new Error("Timeout waiting for local video export.") });
		}, timeoutMs);
		ipcMain.on(CLAUDE_LOCAL_VIDEO_EXPORT_RESPONSE_CHANNEL, handler);
		try {
			win.webContents.send(CLAUDE_LOCAL_VIDEO_EXPORT_REQUEST_CHANNEL, {
				request: validatedRequest,
				requestId,
			});
		} catch (error) {
			fail({
				error: error instanceof Error ? error : new Error(String(error)),
			});
		}
	});
}
