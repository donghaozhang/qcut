/**
 * FFmpeg export operations sub-interface for ElectronAPI.
 */

import type { StickerSource } from "../../../../../electron/ffmpeg-handler";
import type { FFmpegHealthResult } from "../../../../../electron/ffmpeg/types";
import type {
	VideoSourceInput,
	AudioFileInput,
} from "../../lib/export/export-engine-cli";

export interface ElectronFFmpegOps {
	ffmpeg: {
		createExportSession: () => Promise<{
			sessionId: string;
			frameDir: string;
			outputDir: string;
		}>;
		saveFrame: (data: {
			sessionId: string;
			frameName: string;
			data: string;
		}) => Promise<string>;
		saveStickerForExport: (data: {
			sessionId: string;
			stickerId: string;
			imageData: Uint8Array;
			format?: string;
		}) => Promise<{ success: boolean; path?: string; error?: string }>;
		exportVideoCLI: (options: {
			sessionId: string;
			width: number;
			height: number;
			fps: number;
			quality: string;
			filterChain?: string;
			textFilterChain?: string;
			stickerFilterChain?: string;
			stickerSources?: StickerSource[];
			duration?: number;
			audioFiles?: AudioFileInput[];
			useDirectCopy?: boolean;
			videoSources?: VideoSourceInput[];
			useVideoInput?: boolean;
			videoInputPath?: string;
			trimStart?: number;
			trimEnd?: number;
			wordFilterSegments?: Array<{
				start: number;
				end: number;
			}>;
			crossfadeMs?: number;
			optimizationStrategy?:
				| "direct-copy"
				| "direct-video-with-filters"
				| "video-normalization"
				| "image-video-composite";
		}) => Promise<{ success: boolean; outputFile: string }>;
		readOutputFile: (path: string) => Promise<Buffer | null>;
		cleanupExportSession: (sessionId: string) => Promise<boolean>;
		validateFilterChain: (filterChain: string) => Promise<boolean>;
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
				trimStart?: number;
				duration?: number;
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
		getPath: () => Promise<string>;
		checkHealth: () => Promise<FFmpegHealthResult>;
	};
}
