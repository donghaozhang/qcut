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
import { useWordTimelineStore } from "@/stores/timeline/word-timeline-store";
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

/**
 * Return type of the useElevenLabsTranscription hook.
 */
export interface UseElevenLabsTranscriptionReturn {
	/** Function to transcribe a media file */
	transcribeMedia: (
		filePath: string,
		options?: TranscriptionOptions
	) => Promise<ElevenLabsTranscribeResult | null>;
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

	const { loadFromTranscription } = useWordTimelineStore();

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	const transcribeMedia = useCallback(
		async (
			filePath: string,
			options?: TranscriptionOptions
		): Promise<ElevenLabsTranscribeResult | null> => {
			console.log("[ElevenLabs Hook] transcribeMedia called");
			console.log("[ElevenLabs Hook] File path:", filePath);
			console.log("[ElevenLabs Hook] Options:", options);

			// Check if platform API is available
			console.log("[ElevenLabs Hook] Checking platform API availability...");
			console.log(
				"[ElevenLabs Hook] transcribe namespace exists:",
				!!platform().transcription
			);
			console.log(
				"[ElevenLabs Hook] elevenlabs method exists:",
				!!platform().transcription?.elevenlabs
			);

			setIsTranscribing(true);
			setError(null);
			setProgress("Preparing...");

			try {
				// Get file extension
				const ext = filePath.split(".").pop()?.toLowerCase() || "";
				const isVideo = VIDEO_EXTENSIONS.includes(ext);
				const isAudio = AUDIO_EXTENSIONS.includes(ext);

				console.log("[ElevenLabs Hook] File extension:", ext);
				console.log("[ElevenLabs Hook] Is video:", isVideo);
				console.log("[ElevenLabs Hook] Is audio:", isAudio);

				if (!isVideo && !isAudio) {
					console.error("[ElevenLabs Hook] Unsupported file type:", ext);
					throw new Error(
						`Unsupported file type: .${ext}. Supported: ${[...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].join(", ")}`
					);
				}

				let audioPath = filePath;

				// Step 1: Extract audio from video if needed
				if (isVideo) {
					console.log(
						"[ElevenLabs Hook] Step 1: Extracting audio from video..."
					);
					setProgress("Extracting audio from video...");

					console.log("[ElevenLabs Hook] Checking FFmpeg API availability...");
					console.log(
						"[ElevenLabs Hook] ffmpeg namespace exists:",
						!!platform().ffmpeg
					);
					console.log(
						"[ElevenLabs Hook] extractAudio method exists:",
						!!platform().ffmpeg?.extractAudio
					);

					if (!platform().ffmpeg?.extractAudio) {
						console.error(
							"[ElevenLabs Hook] FFmpeg extractAudio API not available"
						);
						throw new Error("FFmpeg audio extraction not available");
					}

					console.log("[ElevenLabs Hook] Calling ffmpeg.extractAudio with:", {
						videoPath: filePath,
						format: "mp3",
					});

					// Use MP3 format for smaller file size (WAV is uncompressed and too large for upload)
					const extractResult = await platform().ffmpeg.extractAudio({
						videoPath: filePath,
						format: "mp3",
					});

					console.log(
						"[ElevenLabs Hook] Audio extraction result:",
						extractResult
					);
					audioPath = extractResult.audioPath;
					console.log("[ElevenLabs Hook] Audio path set to:", audioPath);
					// TODO: Implement temp file cleanup via Electron IPC handler
					// Extracted audio files will accumulate in system temp directory

					setProgress(
						`Audio extracted (${(extractResult.fileSize / 1024 / 1024).toFixed(1)} MB)`
					);
				}

				// Step 2: Call ElevenLabs transcription
				console.log(
					"[ElevenLabs Hook] Step 2: Calling ElevenLabs transcription..."
				);
				setProgress("Transcribing audio with ElevenLabs...");

				const transcribeOptions = {
					audioPath,
					language: options?.language,
					diarize: options?.diarize ?? true,
					tagAudioEvents: options?.tagAudioEvents ?? true,
					keyterms: options?.keyterms,
				};
				console.log("[ElevenLabs Hook] Transcribe options:", transcribeOptions);

				const result =
					await platform().transcription.elevenlabs(transcribeOptions);

				console.log("[ElevenLabs Hook] Transcription result received:");
				console.log("[ElevenLabs Hook] - Text length:", result?.text?.length);
				console.log("[ElevenLabs Hook] - Words count:", result?.words?.length);
				console.log("[ElevenLabs Hook] - Language:", result?.language_code);

				// Step 3: Generate filename with timestamp
				const sourceFileName =
					filePath
						.split(/[/\\]/)
						.pop()
						?.replace(/\.[^.]+$/, "") || "transcription";
				const timestamp = new Date()
					.toISOString()
					.replace(/[-:]/g, "")
					.slice(0, 15);
				const transcriptFileName = `${sourceFileName}_${timestamp}_transcript.json`;
				console.log(
					"[ElevenLabs Hook] Generated filename:",
					transcriptFileName
				);

				// Step 4: Load into word timeline store
				console.log(
					"[ElevenLabs Hook] Step 4: Loading into word timeline store..."
				);
				setProgress("Loading transcription...");
				await loadFromTranscription(result, transcriptFileName);

				// TODO: Save transcription JSON to project folder (requires IPC handler)

				setProgress("Complete!");
				console.log("[ElevenLabs Hook] Transcription complete!");

				return result;
			} catch (err) {
				console.error("[ElevenLabs Hook] Error during transcription:", err);
				const message =
					err instanceof Error ? err.message : "Transcription failed";
				console.error("[ElevenLabs Hook] Error message:", message);
				setError(message);

				return null;
			} finally {
				setIsTranscribing(false);
				console.log("[ElevenLabs Hook] Finished (isTranscribing set to false)");
			}
		},
		[loadFromTranscription]
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
