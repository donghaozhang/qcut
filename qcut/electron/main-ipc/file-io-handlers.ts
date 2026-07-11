/**
 * File I/O IPC handlers.
 * @module electron/main-ipc/file-io-handlers
 */

import { ipcMain, dialog, type IpcMainInvokeEvent } from "electron";
import * as fs from "fs";
import * as path from "path";
import type { MainIpcDeps } from "./types.js";

export function registerFileIoHandlers(deps: MainIpcDeps): void {
	const { getMainWindow, logger } = deps;

	ipcMain.handle(
		"read-file",
		async (
			_event: IpcMainInvokeEvent,
			filePath: string
		): Promise<Buffer | null> => {
			try {
				return await fs.promises.readFile(filePath);
			} catch (error: any) {
				logger.error("Error reading file:", error);
				return null;
			}
		}
	);

	ipcMain.handle(
		"write-file",
		async (
			_event: IpcMainInvokeEvent,
			filePath: string,
			data: string | Buffer | ArrayBuffer | Uint8Array
		): Promise<boolean> => {
			try {
				let fileData: string | Buffer;
				if (typeof data === "string" || Buffer.isBuffer(data)) {
					fileData = data;
				} else if (data instanceof ArrayBuffer) {
					fileData = Buffer.from(new Uint8Array(data));
				} else {
					fileData = Buffer.from(data);
				}
				await fs.promises.writeFile(filePath, fileData);
				return true;
			} catch (error: any) {
				logger.error("Error writing file:", error);
				return false;
			}
		}
	);

	ipcMain.handle(
		"save-blob",
		async (
			_event: IpcMainInvokeEvent,
			data: Buffer | Uint8Array,
			defaultFilename?: string
		): Promise<{
			success: boolean;
			filePath?: string;
			canceled?: boolean;
			error?: string;
		}> => {
			try {
				const result = await dialog.showSaveDialog(getMainWindow()!, {
					defaultPath: defaultFilename || "download.zip",
					filters: [
						{ name: "ZIP Files", extensions: ["zip"] },
						{ name: "All Files", extensions: ["*"] },
					],
				});

				if (!result.canceled && result.filePath) {
					await fs.promises.writeFile(result.filePath, Buffer.from(data));
					return { success: true, filePath: result.filePath };
				}

				return { success: false, canceled: true };
			} catch (error: any) {
				logger.error("Save blob error:", error);
				return { success: false, error: error.message };
			}
		}
	);

	ipcMain.handle(
		"file-exists",
		async (_event: IpcMainInvokeEvent, filePath: string): Promise<boolean> => {
			try {
				await fs.promises.access(filePath, fs.constants.F_OK);
				return true;
			} catch {
				return false;
			}
		}
	);

	ipcMain.handle(
		"validate-audio-file",
		async (_event: IpcMainInvokeEvent, filePath: string) => {
			const { spawn } = require("child_process");

			try {
				const { getFFprobePath } = require("../ffmpeg-handler.js");
				const ffprobePath = await getFFprobePath();

				return new Promise((resolve) => {
					logger.log(`[Main] Running ffprobe on: ${filePath}`);
					logger.log(`[Main] ffprobe path: ${ffprobePath}`);

					const ffprobe = spawn(
						ffprobePath,
						[
							"-v",
							"quiet",
							"-print_format",
							"json",
							"-show_format",
							"-show_streams",
							filePath,
						],
						{ windowsHide: true }
					);

					const timeout = setTimeout(() => {
						logger.log("[Main] ffprobe timeout, killing process");
						ffprobe.kill();
						resolve({
							valid: false,
							error: "ffprobe timeout after 10 seconds",
						});
					}, 10_000);

					let stdout = "";
					let stderr = "";

					ffprobe.stdout.on("data", (data: any) => {
						stdout += data.toString();
					});

					ffprobe.stderr.on("data", (data: any) => {
						stderr += data.toString();
					});

					ffprobe.on("close", (code: number) => {
						clearTimeout(timeout);
						logger.log(`[Main] ffprobe finished with code: ${code}`);
						logger.log(`[Main] ffprobe stdout length: ${stdout.length}`);
						logger.log(`[Main] ffprobe stderr: ${stderr}`);

						if (code === 0 && stdout) {
							try {
								const info = JSON.parse(stdout);
								const hasAudio =
									info.streams &&
									info.streams.some((s: any) => s.codec_type === "audio");

								resolve({
									valid: true,
									info,
									hasAudio,
									duration: info.format?.duration || 0,
								});
							} catch (parseError: any) {
								resolve({
									valid: false,
									error: `Failed to parse ffprobe output: ${parseError.message}`,
									stderr,
								});
							}
						} else {
							resolve({
								valid: false,
								error: `ffprobe failed with code ${code}`,
								stderr,
							});
						}
					});

					ffprobe.on("error", (error: Error) => {
						clearTimeout(timeout);
						logger.log(`[Main] ffprobe spawn error: ${error.message}`);
						resolve({
							valid: false,
							error: `ffprobe spawn error: ${error.message}`,
						});
					});
				});
			} catch (error: any) {
				return {
					valid: false,
					error: `Validation setup failed: ${error.message}`,
				};
			}
		}
	);

	ipcMain.handle(
		"get-file-info",
		async (_event: IpcMainInvokeEvent, filePath: string) => {
			try {
				const stats = await fs.promises.stat(filePath);
				return {
					name: path.basename(filePath),
					path: filePath,
					size: stats.size,
					created: stats.birthtime,
					modified: stats.mtime,
					lastModified: stats.mtime,
					type: path.extname(filePath),
					isFile: stats.isFile(),
					isDirectory: stats.isDirectory(),
				};
			} catch (error: any) {
				logger.error("Error getting file info:", error);
				throw error;
			}
		}
	);
}
