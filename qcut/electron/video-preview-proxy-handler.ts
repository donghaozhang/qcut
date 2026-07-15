import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type {
	VideoPreviewProxyOptions,
	VideoPreviewProxyResult,
} from "./ffmpeg/types.js";
import {
	cancelVideoPreviewProxy,
	renderVideoPreviewProxy,
} from "./ffmpeg/video-preview-proxy.js";

export const VIDEO_PREVIEW_PROXY_PROGRESS_CHANNEL =
	"ffmpeg-video-preview-proxy-progress";

export function setupVideoPreviewProxyHandlers(): void {
	ipcMain.handle(
		"ffmpeg-render-video-preview-proxy",
		async (
			event: IpcMainInvokeEvent,
			options: VideoPreviewProxyOptions
		): Promise<VideoPreviewProxyResult> =>
			renderVideoPreviewProxy({
				options,
				onProgress: (progress) => {
					if (!event.sender.isDestroyed()) {
						event.sender.send(VIDEO_PREVIEW_PROXY_PROGRESS_CHANNEL, progress);
					}
				},
			})
	);
	ipcMain.handle(
		"ffmpeg-cancel-video-preview-proxy",
		async (_event: IpcMainInvokeEvent, requestId: string): Promise<boolean> =>
			cancelVideoPreviewProxy({ requestId })
	);
}
