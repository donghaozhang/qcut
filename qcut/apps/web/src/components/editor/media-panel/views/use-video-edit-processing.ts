/**
 * Video Edit Processing Hook
 *
 * WHY this hook:
 * - Separates business logic from UI components
 * - Manages complex async state transitions
 * - Reusable across all three video edit tabs
 *
 * Pattern follows use-ai-generation.ts for consistency
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useAsyncMediaStoreActions } from "@/hooks/media/use-async-media-store";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import { videoEditClient } from "@/lib/ai-clients/video-edit-client";
import type {
	VideoEditTab,
	VideoEditResult,
	VideoEditProcessingState,
	UseVideoEditProcessingProps,
	KlingVideoToAudioParams,
	MMAudioV2Params,
	TopazUpscaleParams,
	HeyGenTranslateParams,
} from "./video-edit-types";

type VideoEditParams =
	| Partial<KlingVideoToAudioParams>
	| Partial<MMAudioV2Params>
	| Partial<TopazUpscaleParams>
	| Partial<HeyGenTranslateParams>;
import {
	VIDEO_EDIT_ERROR_MESSAGES,
	VIDEO_EDIT_STATUS_MESSAGES,
	VIDEO_EDIT_PROCESSING_CONSTANTS,
	VIDEO_EDIT_HELPERS,
} from "./video-edit-constants";

/**
 * Main processing hook for video edit features
 *
 * WHY this structure:
 * - Unified interface for all three models
 * - Consistent error handling and progress tracking
 * - Automatic media store integration
 */
export function useVideoEditProcessing(props: UseVideoEditProcessingProps) {
	const {
		sourceVideo,
		activeTab,
		activeProject,
		onSuccess,
		onError,
		onProgress,
	} = props;

	// Core state
	const [state, setState] = useState<VideoEditProcessingState>({
		isProcessing: false,
		progress: 0,
		statusMessage: "",
		elapsedTime: 0,
		estimatedTime: undefined,
		currentStage: "complete",
		result: null,
		error: null,
	});

	// Media store integration
	const {
		addMediaItem,
		loading: mediaStoreLoading,
		error: mediaStoreError,
	} = useAsyncMediaStoreActions();

	// Polling management
	const pollingInterval = useRef<NodeJS.Timeout | null>(null);
	const processingStartTime = useRef<number | null>(null);

	// Elapsed time tracking
	useEffect(() => {
		let interval: NodeJS.Timeout | null = null;

		if (state.isProcessing && processingStartTime.current) {
			interval = setInterval(() => {
				const elapsed = Math.floor(
					(Date.now() - processingStartTime.current!) / 1000
				);
				setState((prev) => ({ ...prev, elapsedTime: elapsed }));
			}, 1000);
		}

		return () => {
			if (interval) clearInterval(interval);
		};
	}, [state.isProcessing]);

	// Cleanup polling on unmount
	useEffect(() => {
		return () => {
			if (pollingInterval.current) {
				clearInterval(pollingInterval.current);
			}
		};
	}, []);

	// Progress callback
	useEffect(() => {
		if (onProgress) {
			onProgress(state.progress, state.statusMessage);
		}
	}, [state.progress, state.statusMessage, onProgress]);

	/**
	 * Add result to media store
	 * WHY: Automatically adds processed video to timeline
	 * Edge case: activeProject might be null
	 */
	const addToMediaStore = useCallback(
		async (result: VideoEditResult) => {
			if (!activeProject || !addMediaItem || !result.videoUrl) {
				debugLog("Cannot add to media store: missing requirements");
				return;
			}

			try {
				setState((prev) => ({
					...prev,
					currentStage: "downloading",
					statusMessage: VIDEO_EDIT_STATUS_MESSAGES.DOWNLOADING,
					progress: 95,
				}));

				// Download video from FAL AI URL
				const response = await fetch(result.videoUrl);
				if (!response.ok) {
					throw new Error("Failed to download processed video");
				}

				const blob = await response.blob();
				const filename = `video-edit-${result.modelId}-${Date.now()}.mp4`;
				const file = new File([blob], filename, { type: "video/mp4" });

				// Add to media store
				const mediaItem = {
					name: `Edited: ${sourceVideo?.name || "video"}`,
					type: "video" as const,
					file,
					url: result.videoUrl,
					duration: result.duration || 10,
					width: result.width || 1920,
					height: result.height || 1080,
				};

				const newItemId = await addMediaItem(activeProject.id, mediaItem);
				debugLog(`Added processed video to media store: ${newItemId}`);
			} catch (error) {
				debugError("Failed to add to media store:", error);
			}
		},
		[activeProject, addMediaItem, sourceVideo]
	);

	/**
	 * Process Kling Video to Audio
	 */
	const processKlingVideoToAudio = useCallback(
		async (params: Partial<KlingVideoToAudioParams>) => {
			if (!sourceVideo) {
				throw new Error(VIDEO_EDIT_ERROR_MESSAGES.NO_VIDEO);
			}

			console.log("=== PROCESSING KLING DEBUG ===");
			console.log("Source video:", sourceVideo);
			console.log("Video file size:", sourceVideo.size);
			console.log("Video file type:", sourceVideo.type);
			console.log("Input params:", params);

			debugLog("Processing Kling Video to Audio:", params);

			// Update progress state
			setState((prev) => ({
				...prev,
				currentStage: "uploading",
				statusMessage: VIDEO_EDIT_STATUS_MESSAGES.UPLOADING,
				progress: 10,
			}));

			// Upload video to FAL storage (required for API)
			console.log("Uploading video to FAL storage...");
			const videoUrl = await videoEditClient.uploadVideo(sourceVideo);
			console.log("Video uploaded. URL:", videoUrl);

			setState((prev) => ({
				...prev,
				currentStage: "processing",
				statusMessage: VIDEO_EDIT_STATUS_MESSAGES.PROCESSING,
				progress: 20,
			}));

			// Call actual FAL AI API
			console.log("Calling videoEditClient.generateKlingAudio with params:", {
				video_url: videoUrl,
				...params,
			});

			const result = await videoEditClient.generateKlingAudio({
				video_url: videoUrl,
				...params,
			});

			console.log("=== END PROCESSING KLING DEBUG ===");
			return result;
		},
		[sourceVideo]
	);

	/**
	 * Process MMAudio V2
	 */
	const processMMAudioV2 = useCallback(
		async (params: Partial<MMAudioV2Params>) => {
			if (!sourceVideo) {
				throw new Error(VIDEO_EDIT_ERROR_MESSAGES.NO_VIDEO);
			}

			if (!params.prompt) {
				throw new Error(VIDEO_EDIT_ERROR_MESSAGES.NO_PROMPT);
			}

			debugLog("Processing MMAudio V2:", params);

			// Update progress state
			setState((prev) => ({
				...prev,
				currentStage: "uploading",
				statusMessage: VIDEO_EDIT_STATUS_MESSAGES.UPLOADING,
				progress: 10,
			}));

			// Upload video to FAL storage (required for API)
			const videoUrl = await videoEditClient.uploadVideo(sourceVideo);

			setState((prev) => ({
				...prev,
				currentStage: "processing",
				statusMessage: VIDEO_EDIT_STATUS_MESSAGES.PROCESSING,
				progress: 20,
			}));

			// Call actual FAL AI API
			const result = await videoEditClient.generateMMAudio({
				video_url: videoUrl,
				prompt: params.prompt!, // We already validated prompt exists above
				negative_prompt: params.negative_prompt,
				seed: params.seed,
				num_steps: params.num_steps,
				duration: params.duration,
				cfg_strength: params.cfg_strength,
				mask_away_clip: params.mask_away_clip,
			});

			return result;
		},
		[sourceVideo]
	);

	/**
	 * Process Topaz Upscale
	 */
	const processTopazUpscale = useCallback(
		async (params: Partial<TopazUpscaleParams>) => {
			if (!sourceVideo) {
				throw new Error(VIDEO_EDIT_ERROR_MESSAGES.NO_VIDEO);
			}

			debugLog("Processing Topaz Upscale:", params);

			// Estimate processing time based on upscale factor
			const factor = params.upscale_factor || 2.0;
			const estimatedSeconds = factor <= 2 ? 60 : factor <= 4 ? 180 : 600;
			setState((prev) => ({
				...prev,
				estimatedTime: estimatedSeconds,
				currentStage: "uploading",
				statusMessage: VIDEO_EDIT_STATUS_MESSAGES.UPLOADING,
				progress: 10,
			}));

			// Upload video to FAL storage (required for API)
			const videoUrl = await videoEditClient.uploadVideo(sourceVideo);

			setState((prev) => ({
				...prev,
				currentStage: "processing",
				statusMessage: VIDEO_EDIT_STATUS_MESSAGES.PROCESSING,
				progress: 20,
			}));

			// Call actual FAL API
			const result = await videoEditClient.upscaleTopaz({
				video_url: videoUrl,
				...params,
			});

			return result;
		},
		[sourceVideo]
	);

	/**
	 * Main process function
	 * WHY: Unified entry point for all processing
	 * Handles model-specific logic and error handling
	 */
	const handleProcess = useCallback(
		async (params: VideoEditParams) => {
			try {
				// Reset state
				setState({
					isProcessing: true,
					progress: 0,
					statusMessage: VIDEO_EDIT_STATUS_MESSAGES.UPLOADING,
					elapsedTime: 0,
					estimatedTime: undefined,
					currentStage: "uploading",
					result: null,
					error: null,
				});

				processingStartTime.current = Date.now();

				let result: VideoEditResult;

				// Route to appropriate processor
				switch (activeTab) {
					case "audio-gen":
						result = await processKlingVideoToAudio(
							params as Partial<KlingVideoToAudioParams>
						);
						break;
					case "audio-sync":
						result = await processMMAudioV2(params as Partial<MMAudioV2Params>);
						break;
					case "upscale":
						result = await processTopazUpscale(
							params as Partial<TopazUpscaleParams>
						);
						break;
					default:
						throw new Error("Invalid tab selected");
				}

				// Add to media store
				await addToMediaStore(result);

				// Update state
				setState((prev) => ({
					...prev,
					isProcessing: false,
					progress: 100,
					statusMessage: VIDEO_EDIT_STATUS_MESSAGES.COMPLETE,
					currentStage: "complete",
					result,
				}));

				// Notify parent
				if (onSuccess) {
					onSuccess(result);
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Processing failed";

				setState((prev) => ({
					...prev,
					isProcessing: false,
					progress: 0,
					statusMessage: VIDEO_EDIT_STATUS_MESSAGES.FAILED,
					currentStage: "failed",
					error: errorMessage,
				}));

				if (onError) {
					onError(errorMessage);
				}
			}
		},
		[
			activeTab,
			processKlingVideoToAudio,
			processMMAudioV2,
			processTopazUpscale,
			addToMediaStore,
			onSuccess,
			onError,
		]
	);

	/**
	 * Reset state
	 */
	const reset = useCallback(() => {
		setState({
			isProcessing: false,
			progress: 0,
			statusMessage: "",
			elapsedTime: 0,
			estimatedTime: undefined,
			currentStage: "complete",
			result: null,
			error: null,
		});

		if (pollingInterval.current) {
			clearInterval(pollingInterval.current);
			pollingInterval.current = null;
		}

		processingStartTime.current = null;
	}, []);

	return {
		// State
		...state,

		// Actions
		handleProcess,
		reset,

		// Media store state
		mediaStoreLoading,
		mediaStoreError,

		// Computed
		canProcess:
			!state.isProcessing && sourceVideo !== null && !mediaStoreLoading,
	};
}
