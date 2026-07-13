import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type {
	VideoCompositionFramePreviewOptions,
	VideoCompositionFramePreviewResult,
	VideoFramePreviewOptions,
	VideoFramePreviewResult,
} from "./ffmpeg/types.js";
import {
	cancelVideoFramePreview,
	renderVideoCompositionFramePreview,
	renderVideoFramePreview,
} from "./ffmpeg/video-frame-preview.js";

export function setupVideoFramePreviewHandlers(): void {
	ipcMain.handle(
		"ffmpeg-render-video-frame-preview",
		async (
			_event: IpcMainInvokeEvent,
			options: VideoFramePreviewOptions
		): Promise<VideoFramePreviewResult> => renderVideoFramePreview({ options })
	);
	ipcMain.handle(
		"ffmpeg-render-video-composition-frame-preview",
		async (
			_event: IpcMainInvokeEvent,
			options: VideoCompositionFramePreviewOptions
		): Promise<VideoCompositionFramePreviewResult> =>
			renderVideoCompositionFramePreview({ options })
	);
	ipcMain.handle(
		"ffmpeg-cancel-video-frame-preview",
		async (_event: IpcMainInvokeEvent, requestId: string): Promise<boolean> =>
			cancelVideoFramePreview({ requestId })
	);
}
