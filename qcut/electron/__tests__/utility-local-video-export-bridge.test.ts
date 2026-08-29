import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import type { ClaudeLocalVideoExportRequest } from "../types/claude-local-video-export-api";

const requestRendererExport = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../claude/handlers/claude-local-video-export-handler.js", () => ({
	LOCAL_VIDEO_EXPORT_TIMEOUT_MS: 7_200_000,
	requestClaudeLocalVideoExportFromRenderer: requestRendererExport,
}));

import {
	createUtilityLocalVideoExportAccessor,
	handleUtilityLocalVideoExportRequest,
	UTILITY_LOCAL_VIDEO_EXPORT_CHANNEL,
	UTILITY_LOCAL_VIDEO_EXPORT_TIMEOUT_MS,
} from "../utility/utility-local-video-export-bridge";

const request: ClaudeLocalVideoExportRequest = {
	filename: "sticker-lab.mp4",
	format: "mp4",
	frameRate: 30,
	height: 1280,
	outputPath: "/tmp/sticker-lab.mp4",
	projectId: "project-a",
	quality: "720p",
	width: 720,
};

describe("utility local video export bridge", () => {
	it("uses an export-duration timeout for utility to main requests", async () => {
		const requestFromMain = vi.fn(async () => undefined);
		const accessor = createUtilityLocalVideoExportAccessor({ requestFromMain });

		await accessor.requestLocalVideoExport(request);

		expect(requestFromMain).toHaveBeenCalledWith(
			UTILITY_LOCAL_VIDEO_EXPORT_CHANNEL,
			{ request },
			{ timeoutMs: UTILITY_LOCAL_VIDEO_EXPORT_TIMEOUT_MS }
		);
		expect(UTILITY_LOCAL_VIDEO_EXPORT_TIMEOUT_MS).toBeGreaterThan(7_200_000);
	});

	it("forwards a utility request through main to the renderer", async () => {
		const win = {} as BrowserWindow;

		await handleUtilityLocalVideoExportRequest({ data: { request }, win });

		expect(requestRendererExport).toHaveBeenCalledWith({ request, win });
	});

	it("rejects malformed utility requests before renderer dispatch", async () => {
		await expect(
			handleUtilityLocalVideoExportRequest({
				data: {},
				win: {} as BrowserWindow,
			})
		).rejects.toThrow("request is missing");
	});
});
