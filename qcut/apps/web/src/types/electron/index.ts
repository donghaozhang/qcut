/**
 * Barrel re-export for electron/ types directory.
 */

export * from "./transcription";
export * from "./screen-recording";
export * from "./electron-api";
export * from "./release-notes";
export * from "./project-folder";
export * from "./ai-pipeline";
export * from "./media-import";
export * from "./remotion";

// Sub-interface modules
export * from "./api-file-ops";
export * from "./api-storage";
export * from "./api-audio-video";
export * from "./api-sounds";
export * from "./api-transcription";
export * from "./api-ffmpeg";
export * from "./api-external";
export * from "./api-gemini-pty-mcp";
export * from "./api-skills";
export * from "./api-claude";
export * from "./api-remotion";
export * from "./api-moyin";
export * from "./api-updates";
export * from "./api-license";
export * from "./api-pi-agent";

// Global augmentation - must be in a file with imports/exports to be a module
import type { ElectronAPI } from "./electron-api";
import type {
	StartScreenRecordingOptions,
	StartScreenRecordingResult,
	StopScreenRecordingOptions,
	StopScreenRecordingResult,
	ScreenRecordingStatus,
} from "./screen-recording";

declare global {
	interface Window {
		electronAPI?: ElectronAPI;
		qcutScreenRecording?: {
			start: (
				options?: StartScreenRecordingOptions
			) => Promise<StartScreenRecordingResult>;
			stop: (
				options?: StopScreenRecordingOptions
			) => Promise<StopScreenRecordingResult>;
			status: () => Promise<ScreenRecordingStatus>;
		};
	}
}
