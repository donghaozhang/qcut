/**
 * Main Process IPC Handlers
 *
 * All inline ipcMain.handle() registrations extracted from main.ts.
 * Covers: audio/video temp saves, shell ops, GitHub stars, FAL uploads,
 * file dialogs, file I/O, storage, FFmpeg resources, updates, and release notes.
 *
 * @module electron/main-ipc
 */

export type { MainIpcDeps, ReleaseNote, Logger, AutoUpdater } from "./types.js";
export { FAL_CONTENT_TYPES, FAL_DEFAULTS } from "./types.js";

import type { MainIpcDeps } from "./types.js";
import { registerAudioVideoHandlers } from "./audio-video-handlers.js";
import { registerShellGithubHandlers } from "./shell-github-handlers.js";
import { registerFalUploadHandlers } from "./fal-upload-handlers.js";
import { registerFileDialogHandlers } from "./file-dialog-handlers.js";
import { registerFileIoHandlers } from "./file-io-handlers.js";
import { registerStorageHandlers } from "./storage-handlers.js";
import { registerFfmpegHandlers } from "./ffmpeg-handlers.js";
import { registerUpdateHandlers } from "./update-handlers.js";
import { registerReleaseNotesHandlers } from "./release-notes-handlers.js";
import { registerWallpaperHandlers } from "./wallpaper-handlers.js";

export function registerMainIpcHandlers(deps: MainIpcDeps): void {
	registerAudioVideoHandlers(deps);
	registerShellGithubHandlers(deps);
	registerFalUploadHandlers(deps);
	registerFileDialogHandlers(deps);
	registerFileIoHandlers(deps);
	registerStorageHandlers(deps);
	registerFfmpegHandlers(deps);
	registerUpdateHandlers(deps);
	registerReleaseNotesHandlers(deps);
	registerWallpaperHandlers();
}
