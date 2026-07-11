import type {
	ExportSession,
	FrameData,
	ExportOptions,
} from "../supporting-types";
import type { AudioSettings } from "../../ffmpeg/audio-settings";

/** FFmpeg export and frame processing operations. */
export interface FFmpegExportAPI {
	ffmpeg: {
		createExportSession: () => Promise<ExportSession>;
		saveFrame: (
			data: FrameData
		) => Promise<{ success: boolean; error?: string }>;
		exportVideoCLI: (
			options: ExportOptions
		) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
		readOutputFile: (path: string) => Promise<Buffer | null>;
		cleanupExportSession: (sessionId: string) => Promise<boolean>;
		openFramesFolder: (sessionId: string) => Promise<void>;
		processFrame: (options: {
			sessionId: string;
			inputFrameName: string;
			outputFrameName: string;
			filterChain: string;
		}) => Promise<void>;
		extractAudio: (options: { videoPath: string; format?: string }) => Promise<{
			audioPath: string;
			fileSize: number;
		}>;
		exportAudioCLI: (options: {
			outputPath: string;
			duration: number;
			audioFiles: Array<{
				path: string;
				startTime: number;
				volume?: number;
				sourceGain?: number;
				trimStart?: number;
				trimEnd?: number;
				duration?: number;
				fadeIn?: number;
				fadeOut?: number;
				normalize?: boolean;
				denoise?: number;
				pan?: number;
				audio?: AudioSettings;
			}>;
			bitrate: number;
			sampleRate: number;
			channels?: 1 | 2;
		}) => Promise<{ outputPath: string; fileSize: number }>;
		convertVideoToGif: (options: {
			sessionId: string;
			inputPath: string;
			width: number;
			height: number;
			fps: number;
			loop: boolean;
			quality: number;
		}) => Promise<{ outputPath: string; fileSize: number }>;
		validateFilterChain: (filterChain: string) => Promise<boolean>;
		saveStickerForExport: (data: {
			sessionId: string;
			stickerId: string;
			imageData: Uint8Array;
			format?: string;
		}) => Promise<{ success: boolean; path?: string; error?: string }>;
		getFFmpegResourcePath: (filename: string) => Promise<string>;
		checkFFmpegResource: (filename: string) => Promise<boolean>;
		getPath: () => Promise<string>;
		checkHealth: () => Promise<{
			ffmpegOk: boolean;
			ffprobeOk: boolean;
			ffmpegVersion: string;
			ffprobeVersion: string;
			ffmpegPath: string;
			ffprobePath: string;
			errors: string[];
		}>;
	};
}
