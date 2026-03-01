import type {
	SoundSearchParams,
	SoundDownloadParams,
	SaveAIVideoOptions,
	SaveAIVideoResult,
	ScreenCaptureSource,
	StartScreenRecordingOptions,
	StartScreenRecordingResult,
	StopScreenRecordingOptions,
	StopScreenRecordingResult,
	ScreenRecordingStatus,
} from "../supporting-types";

/** Sound library search and download. */
export interface SoundAPI {
	sounds: {
		search: (params: SoundSearchParams) => Promise<unknown>;
		downloadPreview: (
			params: SoundDownloadParams
		) => Promise<{ success: boolean; path?: string; error?: string }>;
	};
}

/** Temporary audio file operations. */
export interface AudioAPI {
	audio: {
		saveTemp: (audioData: Uint8Array, filename: string) => Promise<string>;
	};
}

/** Video file management (save, verify, delete). */
export interface VideoAPI {
	video?: {
		saveTemp: (
			videoData: Uint8Array,
			filename: string,
			sessionId?: string
		) => Promise<string>;
		saveToDisk: (options: SaveAIVideoOptions) => Promise<SaveAIVideoResult>;
		verifyFile: (filePath: string) => Promise<boolean>;
		deleteFile: (filePath: string) => Promise<boolean>;
		getProjectDir: (projectId: string) => Promise<string>;
	};
}

/** Screenshot capture. */
export interface ScreenshotAPI {
	screenshot?: {
		capture: (options?: { fileName?: string }) => Promise<{
			filePath: string;
			width: number;
			height: number;
			timestamp: number;
		}>;
	};
}

/** Screen recording operations. */
export interface ScreenRecordingAPI {
	screenRecording?: {
		getSources: () => Promise<ScreenCaptureSource[]>;
		start: (
			options?: StartScreenRecordingOptions
		) => Promise<StartScreenRecordingResult>;
		appendChunk: (options: {
			sessionId: string;
			chunk: Uint8Array;
		}) => Promise<{ bytesWritten: number }>;
		stop: (
			options?: StopScreenRecordingOptions
		) => Promise<StopScreenRecordingResult>;
		getStatus: () => Promise<ScreenRecordingStatus>;
	};
}
