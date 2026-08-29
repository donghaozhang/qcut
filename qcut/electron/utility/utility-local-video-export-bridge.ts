import type { BrowserWindow } from "electron";
import {
	LOCAL_VIDEO_EXPORT_TIMEOUT_MS,
	requestClaudeLocalVideoExportFromRenderer,
} from "../claude/handlers/claude-local-video-export-handler.js";
import type { ClaudeLocalVideoExportRequest } from "../types/claude-local-video-export-api.js";
import type { UtilityRequestFromMain } from "./utility-timeline-accessor.js";

export const UTILITY_LOCAL_VIDEO_EXPORT_CHANNEL = "local-video-export";
export const UTILITY_LOCAL_VIDEO_EXPORT_TIMEOUT_MS =
	LOCAL_VIDEO_EXPORT_TIMEOUT_MS + 30_000;

export function createUtilityLocalVideoExportAccessor({
	requestFromMain,
}: {
	requestFromMain: UtilityRequestFromMain;
}): {
	requestLocalVideoExport: (
		request: ClaudeLocalVideoExportRequest
	) => Promise<void>;
} {
	return {
		requestLocalVideoExport: async (request) => {
			await requestFromMain(
				UTILITY_LOCAL_VIDEO_EXPORT_CHANNEL,
				{ request },
				{ timeoutMs: UTILITY_LOCAL_VIDEO_EXPORT_TIMEOUT_MS }
			);
		},
	};
}

export async function handleUtilityLocalVideoExportRequest({
	data,
	win,
}: {
	data: Record<string, unknown>;
	win: BrowserWindow;
}): Promise<void> {
	if (
		typeof data.request !== "object" ||
		data.request === null ||
		Array.isArray(data.request)
	) {
		throw new Error("Local video export request is missing.");
	}
	await requestClaudeLocalVideoExportFromRenderer({
		request: data.request as ClaudeLocalVideoExportRequest,
		win,
	});
}
