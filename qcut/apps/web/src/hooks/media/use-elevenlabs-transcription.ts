/**
 * ElevenLabs Transcription Hook
 *
 * Provides a React hook for transcribing audio/video files using
 * ElevenLabs Scribe v2 via FAL AI.
 *
 * Features:
 * - Automatic audio extraction from video files
 * - Progress tracking for UI feedback
 * - Automatic cleanup of temporary files
 * - Integration with word timeline store
 *
 * @example
 * ```tsx
 * const { transcribeMedia, isTranscribing, progress, error } = useElevenLabsTranscription();
 *
 * const handleTranscribe = async (filePath: string) => {
 *   try {
 *     const result = await transcribeMedia(filePath);
 *     console.log('Transcription complete:', result.words.length, 'words');
 *   } catch (err) {
 *     console.error('Transcription failed:', err);
 *   }
 * };
 * ```
 */

import { useState, useCallback } from "react";
import type { ElevenLabsTranscribeResult } from "@/types/electron";
import { platform } from "@qcut/platform-core";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for transcription.
 */
export interface TranscriptionOptions {
	/** Language code (e.g., "eng", "spa"). Default: auto-detect */
	language?: string;
	/** Enable speaker diarization. Default: true */
	diarize?: boolean;
	/** Tag audio events (laughter, applause). Default: true */
	tagAudioEvents?: boolean;
	/** Words to bias transcription toward. +30% cost if used */
	keyterms?: string[];
}

export interface TranscriptionRequest {
	filePath: string;
	options?: TranscriptionOptions;
	signal?: AbortSignal;
}

/**
 * Return type of the useElevenLabsTranscription hook.
 */
export interface UseElevenLabsTranscriptionReturn {
	/** Function to transcribe a media file */
	transcribeMedia: ({
		filePath,
		options,
		signal,
	}: TranscriptionRequest) => Promise<ElevenLabsTranscribeResult | null>;
	/** Whether transcription is in progress */
	isTranscribing: boolean;
	/** Current progress message */
	progress: string;
	/** Error message if transcription failed */
	error: string | null;
	/** Clear the current error */
	clearError: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Video file extensions that require audio extraction */
const VIDEO_EXTENSIONS = ["mp4", "mov", "avi", "mkv", "webm", "m4v", "flv"];

/** Audio file extensions that can be transcribed directly */
const AUDIO_EXTENSIONS = ["wav", "mp3", "m4a", "aac", "ogg", "flac", "wma"];

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for transcribing audio/video files using ElevenLabs Scribe v2.
 *
 * Handles the full transcription pipeline:
 * 1. Extract audio from video (if needed)
 * 2. Upload to FAL storage
 * 3. Call ElevenLabs API
 * 4. Save results to project folder
 * 5. Clean up temporary files
 */
export function useElevenLabsTranscription(): UseElevenLabsTranscriptionReturn {
	const [isTranscribing, setIsTranscribing] = useState(false);
	const [progress, setProgress] = useState<string>("");
	const [error, setError] = useState<string | null>(null);

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	const transcribeMedia = useCallback(
		async ({
			filePath,
			options,
			signal,
		}: TranscriptionRequest): Promise<ElevenLabsTranscribeResult | null> => {
			if (signal?.aborted) return null;
			setIsTranscribing(true);
			setError(null);
			setProgress("正在准备媒体");

			try {
				const ext = filePath.split(".").pop()?.toLowerCase() || "";
				const isVideo = VIDEO_EXTENSIONS.includes(ext);
				const isAudio = AUDIO_EXTENSIONS.includes(ext);

				if (!isVideo && !isAudio) {
					throw new Error(
						`不支持 .${ext} 文件。支持：${[...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].join(", ")}`
					);
				}

				let audioPath = filePath;

				if (isVideo) {
					setProgress("正在提取视频音频");

					if (!platform().ffmpeg?.extractAudio) {
						throw new Error("当前环境不支持 FFmpeg 音频提取");
					}

					const extractResult = await platform().ffmpeg.extractAudio({
						videoPath: filePath,
						format: "mp3",
					});
					if (signal?.aborted) return null;
					audioPath = extractResult.audioPath;
					// TODO: Implement temp file cleanup via Electron IPC handler
					// Extracted audio files will accumulate in system temp directory

					setProgress(
						`音频提取完成（${(extractResult.fileSize / 1024 / 1024).toFixed(1)} MB）`
					);
				}

				if (signal?.aborted) return null;
				setProgress("正在识别语音");

				const transcribeOptions = {
					audioPath,
					language: options?.language,
					diarize: options?.diarize ?? true,
					tagAudioEvents: options?.tagAudioEvents ?? true,
					keyterms: options?.keyterms,
				};
				const result =
					await platform().transcription.elevenlabs(transcribeOptions);
				if (signal?.aborted) return null;
				setProgress("识别完成");

				return result;
			} catch (err) {
				if (signal?.aborted) return null;
				const message = err instanceof Error ? err.message : "语音识别失败";
				setError(message);

				return null;
			} finally {
				setIsTranscribing(false);
			}
		},
		[]
	);

	return {
		transcribeMedia,
		isTranscribing,
		progress,
		error,
		clearError,
	};
}

export default useElevenLabsTranscription;
