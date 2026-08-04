import { ipcMain, type BrowserWindow, type IpcMainEvent } from "electron";
import type {
	QCutSameProfileWritebackRequest,
	QCutSameProfileWritebackResult,
} from "../../types/qcut-same-profile-writeback-api.js";
import {
	parseQCutSameProfileWritebackRequest,
	parseQCutSameProfileWritebackResult,
} from "../../types/qcut-same-profile-writeback-validation.js";
import {
	requireAllowedKeys,
	requireRecord,
	requireString,
} from "../../types/strict-json-validation.js";
import { generateId } from "../utils/helpers.js";

export const SAME_PROFILE_WRITEBACK_REQUEST_CHANNEL =
	"qcut:interop:same-profile-writeback:request" as const;
export const SAME_PROFILE_WRITEBACK_RESPONSE_CHANNEL =
	"qcut:interop:same-profile-writeback:response" as const;
const SAME_PROFILE_WRITEBACK_TIMEOUT_MS = 30 * 60 * 1000;

function assertResultMatchesRequest({
	request,
	result,
}: {
	request: QCutSameProfileWritebackRequest;
	result: QCutSameProfileWritebackResult;
}): void {
	if (request.action !== result.operation) {
		throw new Error(
			"Renderer same-profile writeback operation does not match the request."
		);
	}
	if (
		request.action === "writeback" &&
		result.operation === "writeback" &&
		result.projectId !== request.projectId
	) {
		throw new Error(
			"Renderer same-profile writeback result does not match the requested project."
		);
	}
}

function parseRendererResponse({
	requestId,
	value,
}: {
	requestId: string;
	value: unknown;
}): { matched: false } | { matched: true; error?: string; result?: unknown } {
	const record = requireRecord({
		label: "Same-profile writeback renderer response",
		value,
	});
	if (record.requestId !== requestId) return { matched: false };
	requireAllowedKeys({
		allowedKeys: ["error", "requestId", "result"],
		label: "Same-profile writeback renderer response",
		record,
		requiredKeys: ["requestId"],
	});
	const hasError = record.error !== undefined;
	const hasResult = record.result !== undefined;
	if (hasError === hasResult) {
		throw new Error(
			"Same-profile writeback renderer response must contain exactly one result or error."
		);
	}
	if (hasError) {
		return {
			error: requireString({
				label: "Same-profile writeback renderer error",
				maximumLength: 16_384,
				value: record.error,
			}),
			matched: true,
		};
	}
	return { matched: true, result: record.result };
}

export async function requestQCutSameProfileWritebackFromRenderer({
	request,
	timeoutMs = SAME_PROFILE_WRITEBACK_TIMEOUT_MS,
	win,
}: {
	request: QCutSameProfileWritebackRequest;
	timeoutMs?: number;
	win: BrowserWindow;
}): Promise<QCutSameProfileWritebackResult> {
	const validatedRequest = parseQCutSameProfileWritebackRequest({
		value: request,
	});
	if (win.isDestroyed() || win.webContents.isDestroyed()) {
		throw new Error("QCut main window is unavailable.");
	}
	return new Promise((resolve, reject) => {
		const requestId = generateId("same_profile_writeback");
		let settled = false;
		const cleanup = (): void => {
			ipcMain.removeListener(SAME_PROFILE_WRITEBACK_RESPONSE_CHANNEL, handler);
			clearTimeout(timeout);
		};
		const fail = ({ error }: { error: Error }): void => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		};
		const handler = (event: IpcMainEvent, response: unknown): void => {
			if (
				settled ||
				event.sender !== win.webContents ||
				event.senderFrame !== win.webContents.mainFrame
			) {
				return;
			}
			try {
				const parsedResponse = parseRendererResponse({
					requestId,
					value: response,
				});
				if (!parsedResponse.matched) return;
				if (parsedResponse.error !== undefined) {
					fail({ error: new Error(parsedResponse.error) });
					return;
				}
				const result = parseQCutSameProfileWritebackResult({
					value: parsedResponse.result,
				});
				assertResultMatchesRequest({ request: validatedRequest, result });
				settled = true;
				cleanup();
				resolve(result);
			} catch (error) {
				fail({
					error: error instanceof Error ? error : new Error(String(error)),
				});
			}
		};
		const timeout = setTimeout(() => {
			fail({
				error: new Error("Timeout waiting for same-profile draft writeback."),
			});
		}, timeoutMs);
		ipcMain.on(SAME_PROFILE_WRITEBACK_RESPONSE_CHANNEL, handler);
		try {
			win.webContents.send(SAME_PROFILE_WRITEBACK_REQUEST_CHANNEL, {
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
