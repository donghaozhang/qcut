/**
 * Claude Timeline Operations
 *
 * Renderer request helpers and batch operation functions for timeline
 * manipulation (add, update, delete, split, select, arrange).
 */

import { ipcMain, BrowserWindow, IpcMainEvent } from "electron";
import { generateId } from "../utils/helpers.js";
import {
	assertIpcMainReady,
	assertRendererWindowReady,
} from "../utils/renderer-ipc-guard.js";
import type {
	ClaudeTimeline,
	ClaudeBatchAddElementRequest,
	ClaudeBatchAddResponse,
	ClaudeBatchDeleteItemRequest,
	ClaudeBatchDeleteResponse,
	ClaudeBatchUpdateItemRequest,
	ClaudeBatchUpdateResponse,
	ClaudeArrangeRequest,
	ClaudeArrangeResponse,
	ClaudeRangeDeleteRequest,
	ClaudeRangeDeleteResponse,
	ClaudeSplitResponse,
	ClaudeSelectionItem,
} from "../../types/claude-api";

const MAX_TIMELINE_BATCH_ITEMS = 50;
const TIMELINE_REQUEST_TIMEOUT_MS = 5000;

/**
 * Request timeline data from renderer process
 */
export async function requestTimelineFromRenderer(
	win: BrowserWindow
): Promise<ClaudeTimeline> {
	assertIpcMainReady({
		ipcMainInstance: ipcMain,
		action: "timeline request",
		requiresOnce: true,
	});
	assertRendererWindowReady({
		win,
		action: "timeline request",
	});

	return new Promise((resolve, reject) => {
		let resolved = false;
		let timeout: NodeJS.Timeout | undefined;
		const responseChannel = "claude:timeline:response";

		const cleanup = (): void => {
			if (timeout) {
				clearTimeout(timeout);
			}
			ipcMain.removeListener(responseChannel, handler);
		};

		const rejectOnce = ({ error }: { error: Error }): void => {
			if (resolved) return;
			resolved = true;
			cleanup();
			reject(error);
		};

		timeout = setTimeout(() => {
			rejectOnce({ error: new Error("Timeout waiting for timeline data") });
		}, 5000);

		const handler = (_event: IpcMainEvent, timeline: ClaudeTimeline) => {
			if (resolved) return;
			resolved = true;
			cleanup();
			resolve(timeline);
		};

		try {
			ipcMain.once(responseChannel, handler);
			win.webContents.send("claude:timeline:request");
		} catch (error) {
			const failure =
				error instanceof Error
					? error
					: new Error("Failed to request timeline from renderer");
			rejectOnce({ error: failure });
		}
	});
}

/**
 * Request a split operation from the renderer and wait for the result
 */
export async function requestSplitFromRenderer(
	win: BrowserWindow,
	elementId: string,
	splitTime: number,
	mode?: string,
	correlationId?: string
): Promise<ClaudeSplitResponse> {
	return new Promise((resolve, reject) => {
		let resolved = false;
		const requestId = generateId("req");

		const timeout = setTimeout(() => {
			if (resolved) return;
			resolved = true;
			ipcMain.removeListener("claude:timeline:splitElement:response", handler);
			reject(new Error("Timeout waiting for split result"));
		}, 5000);

		const handler = (
			_event: IpcMainEvent,
			data: { requestId: string; result: ClaudeSplitResponse }
		) => {
			if (data.requestId !== requestId || resolved) return;
			resolved = true;
			clearTimeout(timeout);
			ipcMain.removeListener("claude:timeline:splitElement:response", handler);
			resolve(data.result);
		};

		ipcMain.on("claude:timeline:splitElement:response", handler);
		win.webContents.send("claude:timeline:splitElement", {
			requestId,
			correlationId,
			elementId,
			splitTime,
			mode: mode || "split",
		});
	});
}

/**
 * Request current selection state from the renderer
 */
export async function requestSelectionFromRenderer(
	win: BrowserWindow,
	correlationId?: string
): Promise<ClaudeSelectionItem[]> {
	return new Promise((resolve, reject) => {
		let resolved = false;
		const requestId = generateId("req");

		const timeout = setTimeout(() => {
			if (resolved) return;
			resolved = true;
			ipcMain.removeListener("claude:timeline:getSelection:response", handler);
			reject(new Error("Timeout waiting for selection data"));
		}, 5000);

		const handler = (
			_event: IpcMainEvent,
			data: { requestId: string; elements: ClaudeSelectionItem[] }
		) => {
			if (data.requestId !== requestId || resolved) return;
			resolved = true;
			clearTimeout(timeout);
			ipcMain.removeListener("claude:timeline:getSelection:response", handler);
			resolve(data.elements);
		};

		ipcMain.on("claude:timeline:getSelection:response", handler);
		win.webContents.send("claude:timeline:getSelection", {
			requestId,
			correlationId,
		});
	});
}

async function requestRendererResult<T>({
	win,
	requestChannel,
	responseChannel,
	payload,
	timeoutErrorMessage,
	correlationId,
}: {
	win: BrowserWindow;
	requestChannel: string;
	responseChannel: string;
	payload: Record<string, unknown>;
	timeoutErrorMessage: string;
	correlationId?: string;
}): Promise<T> {
	assertIpcMainReady({
		ipcMainInstance: ipcMain,
		action: requestChannel,
		requiresOnce: false,
	});
	assertRendererWindowReady({
		win,
		action: requestChannel,
	});

	return new Promise((resolve, reject) => {
		let resolved = false;
		const requestId = generateId("req");
		let timeout: NodeJS.Timeout | undefined;

		const cleanup = (): void => {
			if (timeout) {
				clearTimeout(timeout);
			}
			ipcMain.removeListener(responseChannel, responseHandler);
		};

		const rejectOnce = ({ error }: { error: Error }): void => {
			if (resolved) return;
			resolved = true;
			cleanup();
			reject(error);
		};

		timeout = setTimeout(() => {
			rejectOnce({ error: new Error(timeoutErrorMessage) });
		}, TIMELINE_REQUEST_TIMEOUT_MS);

		const responseHandler = (
			_event: IpcMainEvent,
			data: { requestId: string; result: T }
		) => {
			if (resolved || data.requestId !== requestId) {
				return;
			}
			resolved = true;
			cleanup();
			resolve(data.result);
		};

		try {
			ipcMain.on(responseChannel, responseHandler);
			win.webContents.send(requestChannel, {
				requestId,
				correlationId,
				...payload,
			});
		} catch (error) {
			const failure =
				error instanceof Error
					? error
					: new Error(`Failed renderer request: ${requestChannel}`);
			rejectOnce({ error: failure });
		}
	});
}

function normalizeBatchTrackElementType({
	type,
}: {
	type: ClaudeBatchAddElementRequest["type"];
}): "media" | "text" | "sticker" | "captions" | "remotion" | "markdown" {
	if (type === "video" || type === "audio" || type === "image") {
		return "media";
	}
	if (
		type === "media" ||
		type === "text" ||
		type === "sticker" ||
		type === "captions" ||
		type === "remotion" ||
		type === "markdown"
	) {
		return type;
	}
	return "media";
}

function isTrackCompatibleWithElementType({
	trackType,
	elementType,
}: {
	trackType: string;
	elementType: ClaudeBatchAddElementRequest["type"];
}): boolean {
	const normalizedElementType = normalizeBatchTrackElementType({
		type: elementType,
	});

	if (normalizedElementType === "text") return trackType === "text";
	if (normalizedElementType === "sticker") return trackType === "sticker";
	if (normalizedElementType === "captions") return trackType === "captions";
	if (normalizedElementType === "remotion") return trackType === "remotion";
	if (normalizedElementType === "markdown") return trackType === "markdown";
	return trackType === "media" || trackType === "audio";
}

export async function requestBatchAddElementsFromRenderer(
	win: BrowserWindow,
	elements: ClaudeBatchAddElementRequest[],
	correlationId?: string
): Promise<ClaudeBatchAddResponse> {
	return requestRendererResult<ClaudeBatchAddResponse>({
		win,
		requestChannel: "claude:timeline:batchAddElements",
		responseChannel: "claude:timeline:batchAddElements:response",
		payload: { elements },
		timeoutErrorMessage: "Timeout waiting for batch add result",
		correlationId,
	});
}

export async function requestBatchUpdateElementsFromRenderer(
	win: BrowserWindow,
	updates: ClaudeBatchUpdateItemRequest[],
	correlationId?: string
): Promise<ClaudeBatchUpdateResponse> {
	return requestRendererResult<ClaudeBatchUpdateResponse>({
		win,
		requestChannel: "claude:timeline:batchUpdateElements",
		responseChannel: "claude:timeline:batchUpdateElements:response",
		payload: { updates },
		timeoutErrorMessage: "Timeout waiting for batch update result",
		correlationId,
	});
}

export async function requestBatchDeleteElementsFromRenderer(
	win: BrowserWindow,
	elements: ClaudeBatchDeleteItemRequest[],
	ripple = false,
	correlationId?: string
): Promise<ClaudeBatchDeleteResponse> {
	return requestRendererResult<ClaudeBatchDeleteResponse>({
		win,
		requestChannel: "claude:timeline:batchDeleteElements",
		responseChannel: "claude:timeline:batchDeleteElements:response",
		payload: { elements, ripple },
		timeoutErrorMessage: "Timeout waiting for batch delete result",
		correlationId,
	});
}

export async function requestDeleteRangeFromRenderer(
	win: BrowserWindow,
	request: ClaudeRangeDeleteRequest,
	correlationId?: string
): Promise<ClaudeRangeDeleteResponse> {
	return requestRendererResult<ClaudeRangeDeleteResponse>({
		win,
		requestChannel: "claude:timeline:deleteRange",
		responseChannel: "claude:timeline:deleteRange:response",
		payload: { request },
		timeoutErrorMessage: "Timeout waiting for range delete result",
		correlationId,
	});
}

export async function requestArrangeFromRenderer(
	win: BrowserWindow,
	request: ClaudeArrangeRequest,
	correlationId?: string
): Promise<ClaudeArrangeResponse> {
	return requestRendererResult<ClaudeArrangeResponse>({
		win,
		requestChannel: "claude:timeline:arrange",
		responseChannel: "claude:timeline:arrange:response",
		payload: { request },
		timeoutErrorMessage: "Timeout waiting for arrange result",
		correlationId,
	});
}

export async function batchAddElements(
	win: BrowserWindow,
	_projectId: string,
	elements: ClaudeBatchAddElementRequest[],
	correlationId?: string
): Promise<ClaudeBatchAddResponse> {
	try {
		if (!Array.isArray(elements)) {
			throw new Error("elements must be an array");
		}
		if (elements.length > MAX_TIMELINE_BATCH_ITEMS) {
			throw new Error(
				`Batch add limited to ${MAX_TIMELINE_BATCH_ITEMS} elements`
			);
		}
		if (elements.length === 0) {
			return { added: [], failedCount: 0 };
		}

		for (const element of elements) {
			if (!element.trackId || typeof element.trackId !== "string") {
				throw new Error("Each element must include a valid trackId");
			}
			if (
				typeof element.startTime !== "number" ||
				Number.isNaN(element.startTime) ||
				element.startTime < 0
			) {
				throw new Error("Each element must include a non-negative startTime");
			}
			if (
				typeof element.duration !== "number" ||
				Number.isNaN(element.duration) ||
				element.duration <= 0
			) {
				throw new Error("Each element must include a duration > 0");
			}
		}

		const timeline = await requestTimelineFromRenderer(win);
		const trackById = new Map<string, string>();
		for (const track of timeline.tracks) {
			if (track.id) {
				trackById.set(track.id, track.type);
			}
		}

		if (trackById.size > 0) {
			for (const element of elements) {
				const trackType = trackById.get(element.trackId);
				if (!trackType) {
					throw new Error(`Track not found: ${element.trackId}`);
				}
				if (
					!isTrackCompatibleWithElementType({
						trackType,
						elementType: element.type,
					})
				) {
					throw new Error(
						`Element type '${element.type}' is not compatible with track '${element.trackId}' (${trackType})`
					);
				}
			}
		}

		return requestBatchAddElementsFromRenderer(win, elements, correlationId);
	} catch (error) {
		throw new Error(
			error instanceof Error ? error.message : "Failed to batch add elements"
		);
	}
}

export async function batchUpdateElements(
	win: BrowserWindow,
	updates: ClaudeBatchUpdateItemRequest[],
	correlationId?: string
): Promise<ClaudeBatchUpdateResponse> {
	try {
		if (!Array.isArray(updates)) {
			throw new Error("updates must be an array");
		}
		if (updates.length > MAX_TIMELINE_BATCH_ITEMS) {
			throw new Error(
				`Batch update limited to ${MAX_TIMELINE_BATCH_ITEMS} updates`
			);
		}
		for (const update of updates) {
			if (!update.elementId || typeof update.elementId !== "string") {
				throw new Error("Each update must include a valid elementId");
			}
		}
		return requestBatchUpdateElementsFromRenderer(win, updates, correlationId);
	} catch (error) {
		throw new Error(
			error instanceof Error ? error.message : "Failed to batch update elements"
		);
	}
}

export async function batchDeleteElements(
	win: BrowserWindow,
	elements: ClaudeBatchDeleteItemRequest[],
	ripple = false,
	correlationId?: string
): Promise<ClaudeBatchDeleteResponse> {
	try {
		if (!Array.isArray(elements)) {
			throw new Error("elements must be an array");
		}
		if (elements.length > MAX_TIMELINE_BATCH_ITEMS) {
			throw new Error(
				`Batch delete limited to ${MAX_TIMELINE_BATCH_ITEMS} elements`
			);
		}
		for (const element of elements) {
			if (!element.trackId || typeof element.trackId !== "string") {
				throw new Error("Each delete item must include a valid trackId");
			}
			if (!element.elementId || typeof element.elementId !== "string") {
				throw new Error("Each delete item must include a valid elementId");
			}
		}
		return requestBatchDeleteElementsFromRenderer(
			win,
			elements,
			ripple,
			correlationId
		);
	} catch (error) {
		throw new Error(
			error instanceof Error ? error.message : "Failed to batch delete elements"
		);
	}
}

export async function deleteTimelineRange(
	win: BrowserWindow,
	request: ClaudeRangeDeleteRequest,
	correlationId?: string
): Promise<ClaudeRangeDeleteResponse> {
	try {
		if (
			typeof request.startTime !== "number" ||
			typeof request.endTime !== "number"
		) {
			throw new Error("startTime and endTime must be numbers");
		}
		if (request.endTime <= request.startTime) {
			throw new Error("endTime must be greater than startTime");
		}
		return requestDeleteRangeFromRenderer(win, request, correlationId);
	} catch (error) {
		throw new Error(
			error instanceof Error ? error.message : "Failed to delete time range"
		);
	}
}

export async function arrangeTimeline(
	win: BrowserWindow,
	request: ClaudeArrangeRequest,
	correlationId?: string
): Promise<ClaudeArrangeResponse> {
	try {
		if (!request.trackId || typeof request.trackId !== "string") {
			throw new Error("trackId is required");
		}
		if (
			request.mode !== "sequential" &&
			request.mode !== "spaced" &&
			request.mode !== "manual"
		) {
			throw new Error("mode must be one of: sequential, spaced, manual");
		}
		if (request.gap !== undefined && request.gap < 0) {
			throw new Error("gap must be >= 0");
		}
		if (request.startOffset !== undefined && request.startOffset < 0) {
			throw new Error("startOffset must be >= 0");
		}
		return requestArrangeFromRenderer(win, request, correlationId);
	} catch (error) {
		throw new Error(
			error instanceof Error ? error.message : "Failed to arrange timeline"
		);
	}
}
