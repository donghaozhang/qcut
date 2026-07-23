/**
 * Claude Timeline API Handler
 * Provides timeline read/write capabilities for Claude Code integration
 */

import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from "electron";
import { generateId } from "../utils/helpers.js";
import { claudeLog } from "../utils/logger.js";
import type {
	ClaudeTimeline,
	ClaudeElement,
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
	ClaudeTrackOperationRequest,
	ClaudeTrackOperationResponse,
} from "../../types/claude-api";

// Re-export markdown/validation functions
export {
	timelineToMarkdown,
	markdownToTimeline,
	validateTimeline,
} from "./claude-timeline-markdown.js";

// Re-export operation functions
export {
	requestTimelineFromRenderer,
	requestSplitFromRenderer,
	requestSelectionFromRenderer,
	requestBatchAddElementsFromRenderer,
	requestBatchUpdateElementsFromRenderer,
	requestBatchDeleteElementsFromRenderer,
	requestDeleteRangeFromRenderer,
	requestArrangeFromRenderer,
	requestTrackOperationFromRenderer,
	batchAddElements,
	batchUpdateElements,
	batchDeleteElements,
	deleteTimelineRange,
	arrangeTimeline,
} from "./claude-timeline-operations.js";

// Local imports for IPC handler registration
import {
	timelineToMarkdown,
	markdownToTimeline,
	validateTimeline,
} from "./claude-timeline-markdown.js";

import {
	requestTimelineFromRenderer,
	requestSplitFromRenderer,
	requestSelectionFromRenderer,
	requestBatchAddElementsFromRenderer,
	requestBatchUpdateElementsFromRenderer,
	requestBatchDeleteElementsFromRenderer,
	requestDeleteRangeFromRenderer,
	requestArrangeFromRenderer,
	requestTrackOperationFromRenderer,
	batchAddElements,
	batchUpdateElements,
	batchDeleteElements,
	deleteTimelineRange,
	arrangeTimeline,
} from "./claude-timeline-operations.js";

const HANDLER_NAME = "Timeline";

/** Register all Claude timeline IPC handlers for export, import, and element manipulation. */
export function setupClaudeTimelineIPC(): void {
	claudeLog.info(HANDLER_NAME, "Setting up Timeline IPC handlers...");

	ipcMain.handle(
		"claude:timeline:export",
		async (
			event: IpcMainInvokeEvent,
			projectId: string,
			format: "json" | "md"
		): Promise<string> => {
			claudeLog.info(
				HANDLER_NAME,
				`Exporting timeline for project: ${projectId}, format: ${format}`
			);

			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win) {
				throw new Error("Window not found");
			}

			const timeline = await requestTimelineFromRenderer(win);

			if (format === "md") {
				return timelineToMarkdown(timeline);
			}
			return JSON.stringify(timeline, null, 2);
		}
	);

	ipcMain.handle(
		"claude:timeline:import",
		async (
			event: IpcMainInvokeEvent,
			projectId: string,
			data: string,
			format: "json" | "md",
			replace?: boolean
		): Promise<void> => {
			claudeLog.info(
				HANDLER_NAME,
				`Importing timeline for project: ${projectId}, format: ${format}, replace: ${replace}`
			);

			let timeline: ClaudeTimeline;

			try {
				if (format === "md") {
					timeline = markdownToTimeline(data);
				} else {
					timeline = JSON.parse(data);
				}
				validateTimeline(timeline);
			} catch (error) {
				claudeLog.error(HANDLER_NAME, "Invalid timeline payload", error);
				throw new Error("Invalid timeline payload");
			}

			event.sender.send("claude:timeline:apply", {
				timeline,
				replace: replace === true,
			});

			claudeLog.info(HANDLER_NAME, "Timeline import sent to renderer");
		}
	);

	ipcMain.handle(
		"claude:timeline:addElement",
		async (
			event: IpcMainInvokeEvent,
			projectId: string,
			element: Partial<ClaudeElement>
		): Promise<string> => {
			claudeLog.info(HANDLER_NAME, `Adding element to project: ${projectId}`);
			const elementId = element.id || generateId("element");
			event.sender.send("claude:timeline:addElement", {
				...element,
				id: elementId,
			});
			return elementId;
		}
	);

	ipcMain.handle(
		"claude:timeline:batchAddElements",
		async (
			event: IpcMainInvokeEvent,
			projectId: string,
			elements: ClaudeBatchAddElementRequest[]
		): Promise<ClaudeBatchAddResponse> => {
			claudeLog.info(
				HANDLER_NAME,
				`Batch adding ${elements.length} element(s) to project: ${projectId}`
			);
			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win) {
				throw new Error("Window not found");
			}
			return batchAddElements(win, projectId, elements);
		}
	);

	ipcMain.handle(
		"claude:timeline:updateElement",
		async (
			event: IpcMainInvokeEvent,
			_projectId: string,
			elementId: string,
			changes: Partial<ClaudeElement>
		): Promise<void> => {
			claudeLog.info(HANDLER_NAME, `Updating element: ${elementId}`);
			event.sender.send("claude:timeline:updateElement", {
				elementId,
				changes,
			});
		}
	);

	ipcMain.handle(
		"claude:timeline:batchUpdateElements",
		async (
			event: IpcMainInvokeEvent,
			_projectId: string,
			updates: ClaudeBatchUpdateItemRequest[]
		): Promise<ClaudeBatchUpdateResponse> => {
			claudeLog.info(
				HANDLER_NAME,
				`Batch updating ${updates.length} element(s)`
			);
			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win) {
				throw new Error("Window not found");
			}
			return batchUpdateElements(win, updates);
		}
	);

	ipcMain.handle(
		"claude:timeline:trackOperation",
		async (
			event: IpcMainInvokeEvent,
			_projectId: string,
			request: ClaudeTrackOperationRequest
		): Promise<ClaudeTrackOperationResponse> => {
			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win) throw new Error("Window not found");
			return requestTrackOperationFromRenderer(win, request);
		}
	);

	ipcMain.handle(
		"claude:timeline:removeElement",
		async (
			event: IpcMainInvokeEvent,
			_projectId: string,
			elementId: string
		): Promise<void> => {
			claudeLog.info(HANDLER_NAME, `Removing element: ${elementId}`);
			event.sender.send("claude:timeline:removeElement", elementId);
		}
	);

	ipcMain.handle(
		"claude:timeline:batchDeleteElements",
		async (
			event: IpcMainInvokeEvent,
			_projectId: string,
			elements: ClaudeBatchDeleteItemRequest[],
			ripple?: boolean
		): Promise<ClaudeBatchDeleteResponse> => {
			claudeLog.info(
				HANDLER_NAME,
				`Batch deleting ${elements.length} element(s)`
			);
			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win) {
				throw new Error("Window not found");
			}
			return batchDeleteElements(win, elements, ripple);
		}
	);

	// ---- Split element (request-response to get secondElementId) ----
	ipcMain.handle(
		"claude:timeline:splitElement",
		async (
			event: IpcMainInvokeEvent,
			_projectId: string,
			elementId: string,
			splitTime: number,
			mode?: "split" | "keepLeft" | "keepRight"
		): Promise<ClaudeSplitResponse> => {
			claudeLog.info(
				HANDLER_NAME,
				`Splitting element: ${elementId} at ${splitTime}s (mode: ${mode || "split"})`
			);
			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win) throw new Error("Window not found");
			return requestSplitFromRenderer(win, elementId, splitTime, mode);
		}
	);

	// ---- Move element (fire-and-forget) ----
	ipcMain.handle(
		"claude:timeline:moveElement",
		async (
			event: IpcMainInvokeEvent,
			_projectId: string,
			elementId: string,
			toTrackId: string,
			newStartTime?: number
		): Promise<void> => {
			claudeLog.info(
				HANDLER_NAME,
				`Moving element: ${elementId} to track: ${toTrackId}`
			);
			event.sender.send("claude:timeline:moveElement", {
				elementId,
				toTrackId,
				newStartTime,
			});
		}
	);

	// ---- Select elements (fire-and-forget) ----
	ipcMain.handle(
		"claude:timeline:selectElements",
		async (
			event: IpcMainInvokeEvent,
			_projectId: string,
			elements: ClaudeSelectionItem[]
		): Promise<void> => {
			claudeLog.info(HANDLER_NAME, `Selecting ${elements.length} element(s)`);
			event.sender.send("claude:timeline:selectElements", { elements });
		}
	);

	// ---- Get selection (request-response) ----
	ipcMain.handle(
		"claude:timeline:getSelection",
		async (event: IpcMainInvokeEvent): Promise<ClaudeSelectionItem[]> => {
			claudeLog.info(HANDLER_NAME, "Getting current selection");
			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win) throw new Error("Window not found");
			return requestSelectionFromRenderer(win);
		}
	);

	// ---- Clear selection (fire-and-forget) ----
	ipcMain.handle(
		"claude:timeline:clearSelection",
		async (event: IpcMainInvokeEvent): Promise<void> => {
			claudeLog.info(HANDLER_NAME, "Clearing selection");
			event.sender.send("claude:timeline:clearSelection");
		}
	);

	ipcMain.handle(
		"claude:timeline:deleteRange",
		async (
			event: IpcMainInvokeEvent,
			_projectId: string,
			request: ClaudeRangeDeleteRequest
		): Promise<ClaudeRangeDeleteResponse> => {
			claudeLog.info(
				HANDLER_NAME,
				`Deleting timeline range ${request.startTime}s-${request.endTime}s`
			);
			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win) {
				throw new Error("Window not found");
			}
			return deleteTimelineRange(win, request);
		}
	);

	ipcMain.handle(
		"claude:timeline:arrange",
		async (
			event: IpcMainInvokeEvent,
			_projectId: string,
			request: ClaudeArrangeRequest
		): Promise<ClaudeArrangeResponse> => {
			claudeLog.info(
				HANDLER_NAME,
				`Arranging track ${request.trackId} (mode: ${request.mode})`
			);
			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win) {
				throw new Error("Window not found");
			}
			return arrangeTimeline(win, request);
		}
	);

	claudeLog.info(HANDLER_NAME, "Timeline IPC handlers registered");
}

// CommonJS export for main.ts compatibility
module.exports = {
	setupClaudeTimelineIPC,
	requestTimelineFromRenderer,
	requestSplitFromRenderer,
	requestSelectionFromRenderer,
	requestBatchAddElementsFromRenderer,
	requestBatchUpdateElementsFromRenderer,
	requestBatchDeleteElementsFromRenderer,
	requestDeleteRangeFromRenderer,
	requestArrangeFromRenderer,
	requestTrackOperationFromRenderer,
	batchAddElements,
	batchUpdateElements,
	batchDeleteElements,
	deleteTimelineRange,
	arrangeTimeline,
	timelineToMarkdown,
	markdownToTimeline,
	validateTimeline,
};
