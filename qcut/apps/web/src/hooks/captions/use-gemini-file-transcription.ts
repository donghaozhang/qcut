import { useCallback } from "react";
import { platform } from "@qcut/platform-core";
import { toast } from "sonner";
import {
	ErrorCategory,
	ErrorSeverity,
	handleError,
} from "@/lib/debug/error-handler";
import {
	getGeminiSetupUrl,
	isGeminiConfigured,
} from "@/lib/gemini/gemini-utils";
import { openInNewTab } from "@/lib/utils";
import { useCaptionsStore } from "@/stores/captions-store";
import type { TranscriptionResult } from "@/types/captions";

export interface FileTranscriptionState {
	isTranscribing: boolean;
	result: TranscriptionResult | null;
	error: string | null;
	currentFile: File | null;
}

/**
 * Upload-file → Gemini transcription flow used by the captions panel:
 * extracts audio from video via FFmpeg, calls the Gemini IPC transcriber,
 * caches results in localStorage for 24h, and maps errors to actionable
 * toasts.
 */
export function useGeminiFileTranscription({
	selectedLanguage,
	updateState,
}: {
	selectedLanguage: string;
	updateState: (updates: Partial<FileTranscriptionState>) => void;
}) {
	const { completeTranscriptionJob, startTranscriptionJob } =
		useCaptionsStore();
	const { configured, missingVars } = isGeminiConfigured();

	const getCachedTranscription = useCallback(
		(fileKey: string): TranscriptionResult | null => {
			try {
				const cached = localStorage.getItem(`transcription-${fileKey}`);
				if (cached) {
					const parsed = JSON.parse(cached);
					// Cache valid for 24 hours
					if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
						return parsed.result;
					}
					localStorage.removeItem(`transcription-${fileKey}`);
				}
			} catch (error) {
				handleError(error, {
					operation: "Read Transcription Cache",
					category: ErrorCategory.STORAGE,
					severity: ErrorSeverity.LOW,
					showToast: false,
					metadata: { fileKey },
				});
			}
			return null;
		},
		[]
	);

	const startTranscription = useCallback(
		async (
			file: File,
			fileKey?: string
		): Promise<TranscriptionResult | null> => {
			if (!configured) {
				toast.error(
					`Transcription not configured. Missing: ${missingVars.join(", ")}`
				);
				return null;
			}

			updateState({
				error: null,
				result: null,
				currentFile: file,
			});

			try {
				const jobId = startTranscriptionJob({
					fileName: file.name,
					language: selectedLanguage,
				});

				let audioFilePath: string;
				if (file.type.startsWith("video/")) {
					const supportedVideoTypes = [
						"video/mp4",
						"video/webm",
						"video/quicktime", // .mov
						"video/avi",
						"video/x-msvideo", // .avi alternative MIME
						"video/x-matroska", // .mkv
					];
					if (!supportedVideoTypes.includes(file.type)) {
						throw new Error(`Unsupported video format: ${file.type}`);
					}

					toast.info("Extracting audio from video...");
					if (!platform().audio?.saveTemp) {
						throw new Error("Audio temp save not available on this platform");
					}
					const videoBuffer = await file.arrayBuffer();
					const videoTempPath = await platform().audio.saveTemp(
						new Uint8Array(videoBuffer),
						file.name
					);

					if (!platform().ffmpeg?.extractAudio) {
						throw new Error(
							"FFmpeg audio extraction not available on this platform"
						);
					}
					const { audioPath } = await platform().ffmpeg.extractAudio({
						videoPath: videoTempPath,
						format: "wav",
					});
					audioFilePath = audioPath;
				} else {
					if (!platform().audio?.saveTemp) {
						throw new Error("Audio temp save not available on this platform");
					}
					const audioBuffer = await file.arrayBuffer();
					audioFilePath = await platform().audio.saveTemp(
						new Uint8Array(audioBuffer),
						file.name
					);
				}

				toast.info("Transcribing with Gemini...");
				updateState({ isTranscribing: true });

				if (!platform().transcription?.transcribe) {
					throw new Error("Transcription not available on this platform");
				}
				const result = await platform().transcription.transcribe({
					audioPath: audioFilePath,
					language: selectedLanguage,
				});

				completeTranscriptionJob(jobId, result);
				updateState({ isTranscribing: false, result });
				toast.success(
					`Transcription completed! Found ${result.segments.length} segments.`
				);

				if (fileKey) {
					try {
						const cacheData = { result, timestamp: Date.now() };
						localStorage.setItem(
							`transcription-${fileKey}`,
							JSON.stringify(cacheData)
						);
					} catch (error) {
						handleError(error, {
							operation: "Cache Transcription Result",
							category: ErrorCategory.STORAGE,
							severity: ErrorSeverity.LOW,
							showToast: false,
							metadata: { fileKey },
						});
					}
				}
				return result;
			} catch (error) {
				handleError(error, {
					operation: "Audio Transcription",
					category: ErrorCategory.AI_SERVICE,
					severity: ErrorSeverity.HIGH,
					showToast: false, // We show more specific toasts below
					metadata: {
						language: selectedLanguage,
						fileSize: file?.size,
						fileName: file?.name,
					},
				});
				const errorMessage =
					error instanceof Error ? error.message : "Transcription failed";
				updateState({ isTranscribing: false, error: errorMessage });

				// Gemini-specific error handling with actionable suggestions
				if (
					errorMessage.includes("GEMINI_API_KEY") ||
					errorMessage.includes("API key")
				) {
					toast.error(
						"Gemini API key missing or invalid. Please add GEMINI_API_KEY to your .env file.",
						{
							action: {
								label: "Get API Key",
								onClick: () => openInNewTab(getGeminiSetupUrl()),
							},
						}
					);
				} else if (
					errorMessage.includes("rate limit") ||
					errorMessage.includes("429") ||
					errorMessage.includes("quota")
				) {
					toast.error(
						"Gemini API quota exceeded. Please wait a few minutes before trying again."
					);
				} else if (
					errorMessage.includes("audio format") ||
					errorMessage.includes("unsupported")
				) {
					toast.error(
						"Unsupported audio format. Please use WAV, MP3, AAC, OGG, or FLAC."
					);
				} else if (
					errorMessage.includes("20 MB") ||
					errorMessage.includes("too large")
				) {
					toast.error(
						"Audio file too large (max 20 MB). Please compress your audio or use a shorter clip."
					);
				} else if (
					errorMessage.includes("network") ||
					errorMessage.includes("fetch") ||
					errorMessage.includes("ECONNREFUSED")
				) {
					toast.error(
						"Network error. Check your internet connection and try again."
					);
				} else if (
					errorMessage.includes("500") ||
					errorMessage.includes("503")
				) {
					toast.error(
						"Gemini API is temporarily unavailable. Please try again in a few moments."
					);
				} else {
					toast.error(`Transcription failed: ${errorMessage}`);
				}
				return null;
			}
		},
		[
			completeTranscriptionJob,
			configured,
			missingVars,
			selectedLanguage,
			startTranscriptionJob,
			updateState,
		]
	);

	return {
		configured,
		missingVars,
		getCachedTranscription,
		startTranscription,
	};
}
