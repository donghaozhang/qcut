/**
 * YouTube upload IPC handler for the Electron main process.
 *
 * Exposes YouTube upload functionality to the renderer via IPC,
 * delegating to the native pipeline CLI handler.
 *
 * @module electron/youtube-handler
 */

import { ipcMain, type BrowserWindow } from "electron";
import type { CLIRunOptions } from "./native-pipeline/cli/cli-runner/types.js";
import { handleYouTubeUpload } from "./native-pipeline/cli/cli-handlers-youtube.js";

let mainWindow: BrowserWindow | null = null;

export function setupYouTubeIPC(getMainWindow?: () => BrowserWindow | null): void {
	if (getMainWindow) {
		mainWindow = getMainWindow();
	}

	ipcMain.handle(
		"youtube:check-auth",
		async (): Promise<{ authorized: boolean }> => {
			const token =
				process.env.QCUT_AUTH_TOKEN || "";
			return { authorized: token.length > 0 };
		},
	);

	ipcMain.handle(
		"youtube:upload",
		async (
			_event,
			options: {
				filePath: string;
				title: string;
				description?: string;
				tags?: string[];
				privacy?: "public" | "unlisted" | "private";
				categoryId?: string;
				thumbnailPath?: string;
			},
		): Promise<{ videoId: string; url: string }> => {
			const cliOptions: CLIRunOptions = {
				command: "youtube:upload",
				input: options.filePath,
				title: options.title,
				text: options.description || "",
				data: options.tags?.join(",") || "",
				mode: options.privacy || "private",
				category: options.categoryId || "22",
				image: options.thumbnailPath,
				outputDir: "./output",
				saveIntermediates: false,
				json: false,
				verbose: false,
				quiet: false,
			};

			const result = await handleYouTubeUpload(cliOptions, (progress) => {
				const win = mainWindow || (getMainWindow?.() ?? null);
				if (win && !win.isDestroyed()) {
					win.webContents.send("youtube:upload-progress", {
						percent: progress.percent,
						message: progress.message,
					});
				}
			});

			if (!result.success) {
				throw new Error(result.error || "Upload failed");
			}

			const data = result.data as {
				videoId: string;
				url: string;
			};
			return { videoId: data.videoId, url: data.url };
		},
	);
}
