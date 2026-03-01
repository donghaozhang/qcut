import type {
	ExportSession,
	FrameData,
	ExportOptions,
} from "../supporting-types";

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
