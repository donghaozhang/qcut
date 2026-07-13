/**
 * Types and constants for main IPC handlers.
 * @module electron/main-ipc/types
 */

import type { BrowserWindow } from "electron";
import type { AutoUpdateController } from "../auto-update-controller.js";

export interface ReleaseNote {
	version: string;
	date: string;
	channel: string;
	content: string;
}

export interface Logger {
	log(message?: any, ...optionalParams: any[]): void;
	error(message?: any, ...optionalParams: any[]): void;
	warn(message?: any, ...optionalParams: any[]): void;
	info(message?: any, ...optionalParams: any[]): void;
}

/** Dependencies injected from main.ts */
export interface MainIpcDeps {
	getMainWindow: () => BrowserWindow | null;
	logger: Logger;
	updateController: AutoUpdateController | null;
	getReleasesDir: () => string;
	readChangelogFallback: () => ReleaseNote[];
}

// ---------------------------------------------------------------------------
// FAL content-type maps (shared across video/image/audio upload handlers)
// ---------------------------------------------------------------------------

export const FAL_CONTENT_TYPES: Record<string, Record<string, string>> = {
	video: {
		mp4: "video/mp4",
		webm: "video/webm",
		mov: "video/quicktime",
		avi: "video/x-msvideo",
		mkv: "video/x-matroska",
		m4v: "video/x-m4v",
	},
	image: {
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		webp: "image/webp",
		gif: "image/gif",
	},
	audio: {
		mp3: "audio/mpeg",
		wav: "audio/wav",
		aac: "audio/aac",
		ogg: "audio/ogg",
		flac: "audio/flac",
		m4a: "audio/mp4",
	},
};

export const FAL_DEFAULTS: Record<string, string> = {
	video: "video/mp4",
	image: "image/png",
	audio: "audio/mpeg",
};
