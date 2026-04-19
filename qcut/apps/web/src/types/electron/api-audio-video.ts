/**
 * Audio, video, and screen recording sub-interfaces for ElectronAPI.
 */

import type {
	ScreenCaptureSource,
	StartScreenRecordingOptions,
	StartScreenRecordingResult,
	StopScreenRecordingOptions,
	StopScreenRecordingResult,
	ScreenRecordingStatus,
} from "./screen-recording";
import type { CursorTelemetryData } from "./cursor-telemetry";

export interface ElectronAudioOps {
	audio: {
		saveTemp: (audioData: Uint8Array, filename: string) => Promise<string>;
	};
}

export interface ElectronVideoOps {
	video?: {
		saveTemp: (
			videoData: Uint8Array,
			filename: string,
			sessionId?: string
		) => Promise<string>;
		saveToDisk: (options: {
			fileName: string;
			fileData: ArrayBuffer | Uint8Array;
			projectId: string;
			modelId?: string;
			metadata?: {
				width?: number;
				height?: number;
				duration?: number;
				fps?: number;
			};
		}) => Promise<{
			success: boolean;
			localPath?: string;
			fileName?: string;
			fileSize?: number;
			error?: string;
		}>;
		verifyFile: (filePath: string) => Promise<boolean>;
		deleteFile: (filePath: string) => Promise<boolean>;
		getProjectDir: (projectId: string) => Promise<string>;
	};
}

export interface ElectronScreenRecordingOps {
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
		getPermissionStatus: () => Promise<
			"granted" | "denied" | "restricted" | "not-determined" | "unknown"
		>;
		getCursorTelemetry: (
			videoPath: string
		) => Promise<CursorTelemetryData | null>;
	};
}

export interface ElectronScreenshotOps {
	screenshot?: {
		capture: (options?: { fileName?: string }) => Promise<{
			filePath: string;
			width: number;
			height: number;
			timestamp: number;
		}>;
	};
}
