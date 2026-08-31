/**
 * Claude Export IPC handler registration.
 * @module electron/claude/handlers/claude-export-handler/ipc
 */

import { ipcMain, IpcMainInvokeEvent } from "electron";
import { claudeLog } from "../../utils/logger.js";
import { HANDLER_NAME, type ProgressEventPayload } from "./types.js";
import {
	getExportPresets,
	getExportRecommendation,
	applyProgressEvent,
} from "./public-api.js";
import { forwardExportProgressToUtility } from "../../../utility/utility-bridge.js";

/** Register Claude export IPC handlers for presets and recommendations. */
export function setupClaudeExportIPC(): void {
	claudeLog.info(HANDLER_NAME, "Setting up Export IPC handlers...");

	ipcMain.handle("claude:export:getPresets", async () => getExportPresets());

	ipcMain.handle(
		"claude:export:recommend",
		async (_event: IpcMainInvokeEvent, _projectId: string, target: string) =>
			getExportRecommendation({ target })
	);

	ipcMain.on("ffmpeg-progress", (_event, data: ProgressEventPayload) => {
		applyProgressEvent(data);
		// Utility-served export jobs live in the utility process's job map, so
		// renderer progress must be relayed there as well.
		if (data?.jobId && typeof data.progress === "number") {
			forwardExportProgressToUtility({
				jobId: data.jobId,
				progress: data.progress,
				currentFrame: data.currentFrame,
				totalFrames: data.totalFrames,
				fps: data.fps,
				estimatedTimeRemaining: data.estimatedTimeRemaining,
			});
		}
	});

	claudeLog.info(HANDLER_NAME, "Export IPC handlers registered");
}
