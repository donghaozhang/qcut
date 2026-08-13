import { ipcMain, type BrowserWindow, type IpcMainEvent } from "electron";
import type {
	QCutJianyingProjectExportRequest,
	QCutJianyingProjectExportResult,
} from "../../types/qcut-jianying-project-export-api.js";
import {
	parseQCutJianyingProjectExportRequest,
	parseQCutJianyingProjectExportResult,
} from "../../types/qcut-jianying-project-export-validation.js";
import {
	requireAllowedKeys,
	requireString,
} from "../../types/strict-json-validation.js";
import { generateId } from "../utils/helpers.js";

export const JIANYING_PROJECT_EXPORT_REQUEST_CHANNEL =
	"qcut:interop:jianying-project-export:request" as const;
export const JIANYING_PROJECT_EXPORT_RESPONSE_CHANNEL =
	"qcut:interop:jianying-project-export:response" as const;
const JIANYING_PROJECT_EXPORT_TIMEOUT_MS = 30 * 60 * 1000;

function parseRendererResponse({
	requestId,
	value,
}: {
	requestId: string;
	value: unknown;
}): { matched: false } | { matched: true; error?: string; result?: unknown } {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return { matched: false };
	}
	const record = value as Record<string, unknown>;
	if (record.requestId !== requestId) return { matched: false };
	requireAllowedKeys({
		allowedKeys: ["error", "requestId", "result"],
		label: "Jianying project export renderer response",
		record,
		requiredKeys: ["requestId"],
	});
	const hasError = record.error !== undefined;
	const hasResult = record.result !== undefined;
	if (hasError === hasResult) {
		throw new Error(
			"Jianying project export response must contain exactly one result or error."
		);
	}
	if (hasError) {
		return {
			error: requireString({
				label: "Jianying project export renderer error",
				maximumLength: 16_384,
				value: record.error,
			}),
			matched: true,
		};
	}
	return { matched: true, result: record.result };
}

export async function requestQCutJianyingProjectExportFromRenderer({
	request,
	timeoutMs = JIANYING_PROJECT_EXPORT_TIMEOUT_MS,
	win,
}: {
	request: QCutJianyingProjectExportRequest;
	timeoutMs?: number;
	win: BrowserWindow;
}): Promise<QCutJianyingProjectExportResult> {
	const validatedRequest = parseQCutJianyingProjectExportRequest({
		value: request,
	});
	if (win.isDestroyed() || win.webContents.isDestroyed()) {
		throw new Error("QCut main window is unavailable.");
	}
	return new Promise((resolve, reject) => {
		const requestId = generateId("jianying_project_export");
		let settled = false;
		const cleanup = (): void => {
			ipcMain.removeListener(JIANYING_PROJECT_EXPORT_RESPONSE_CHANNEL, handler);
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
				const result = parseQCutJianyingProjectExportResult({
					value: parsedResponse.result,
				});
				if (result.projectId !== validatedRequest.projectId) {
					throw new Error(
						"Renderer Jianying export result does not match the requested project."
					);
				}
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
				error: new Error("Timeout waiting for Jianying project export."),
			});
		}, timeoutMs);
		ipcMain.on(JIANYING_PROJECT_EXPORT_RESPONSE_CHANNEL, handler);
		try {
			win.webContents.send(JIANYING_PROJECT_EXPORT_REQUEST_CHANNEL, {
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
