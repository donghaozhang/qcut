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
import { useMediaPanelStore } from "@/components/editor/media-panel/store";
import { debugLog, debugError } from "@/lib/debug/debug-config";
import { registerCloudTaskRuntimeActions } from "@/lib/cloud-tasks/task-runtime-actions";
import { videoEditClient } from "@/lib/ai-clients/video-edit-client";
import { useCloudTaskStore } from "@/stores/cloud-task-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
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
		targetElementId,
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
	const activeTaskIdRef = useRef<string | null>(null);
	const canceledTaskIdsRef = useRef(new Set<string>());
	const retryOperationRef = useRef<
		| (({
				params,
				taskId,
			}: {
				params: VideoEditParams;
				taskId: string;
			}) => Promise<void>)
		| null
	>(null);

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
		if (activeTaskIdRef.current && state.isProcessing) {
			useCloudTaskStore.getState().updateProgress({
				id: activeTaskIdRef.current,
				progress: state.progress,
				message: state.statusMessage,
			});
		}
	}, [state.isProcessing, state.progress, state.statusMessage, onProgress]);

	/**
	 * Add result to media store
	 * WHY: Automatically adds processed video to timeline
	 * Edge case: activeProject might be null
	 */
	const addToMediaStore = useCallback(
		async (result: VideoEditResult): Promise<{
			mediaId?: string;
			timelineElementId?: string;
			timelineTrackId?: string;
		}> => {
			const prefersAudio = activeTab === "audio-gen" || activeTab === "audio-sync";
			const outputUrl = prefersAudio
				? (result.audioUrl ?? result.videoUrl)
				: result.videoUrl;
			if (!activeProject || !addMediaItem || !outputUrl) {
				debugLog("Cannot add to media store: missing requirements");
				return {};
			}

			try {
				setState((prev) => ({
					...prev,
					currentStage: "downloading",
					statusMessage: VIDEO_EDIT_STATUS_MESSAGES.DOWNLOADING,
					progress: 95,
				}));

				// Download video from FAL AI URL
				const response = await fetch(outputUrl);
				if (!response.ok) {
					throw new Error("Failed to download processed video");
				}

				const blob = await response.blob();
				const importsAudio = prefersAudio && Boolean(result.audioUrl);
				const extension = importsAudio ? "mp3" : "mp4";
				const mimeType = importsAudio ? "audio/mpeg" : "video/mp4";
				const filename = `video-edit-${result.modelId}-${Date.now()}.${extension}`;
				const file = new File([blob], filename, { type: mimeType });

				// Add to media store
				const mediaItem = {
					name: importsAudio
						? `AI 音效：${sourceVideo?.name || "video"}`
						: `处理结果：${sourceVideo?.name || "video"}`,
					type: importsAudio ? ("audio" as const) : ("video" as const),
					file,
					url: outputUrl,
					duration: result.duration || 10,
					...(importsAudio
						? {}
						: {
								width: result.width || 1920,
								height: result.height || 1080,
							}),
					metadata: {
						source: "ai-video-edit",
						model: result.modelId,
						targetElementId,
					},
				};

				const newItemId = await addMediaItem(activeProject.id, mediaItem);
				debugLog(`Added processed media to media store: ${newItemId}`);
				if (!importsAudio || !targetElementId) return { mediaId: newItemId };
				const generatedMedia = useMediaStore
					.getState()
					.mediaItems.find((item) => item.id === newItemId);
				if (!generatedMedia) return { mediaId: newItemId };
				const timeline = useTimelineStore.getState();
				const target = timeline._tracks
					.flatMap((track) => track.elements)
					.find((element) => element.id === targetElementId);
				const timelineTrackId = timeline.findOrCreateTrack("audio");
				const timelineElementId = timeline.addElementToTrack(
					timelineTrackId,
					{
						type: "media",
						mediaId: generatedMedia.id,
						name: generatedMedia.name,
						duration: generatedMedia.duration || result.duration || 10,
						startTime: target?.startTime ?? 0,
						trimStart: 0,
						trimEnd: 0,
					},
					{ pushHistory: true, selectElement: true }
				);
				return {
					mediaId: newItemId,
					timelineElementId: timelineElementId ?? undefined,
					timelineTrackId,
				};
			} catch (error) {
				debugError("Failed to add to media store:", error);
				return {};
			}
		},
		[activeProject, activeTab, addMediaItem, sourceVideo, targetElementId]
	);

	/**
	 * Process Kling Video to Audio
	 */
	const processKlingVideoToAudio = useCallback(
		async (params: Partial<KlingVideoToAudioParams>) => {
			if (!sourceVideo) {
				throw new Error(VIDEO_EDIT_ERROR_MESSAGES.NO_VIDEO);
			}

			debugLog("Processing Kling Video to Audio:", params);

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
			const result = await videoEditClient.generateKlingAudio({
				video_url: videoUrl,
				...params,
			});

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
	const runProcess = useCallback(
		async ({
			params,
			existingTaskId,
		}: {
			params: VideoEditParams;
			existingTaskId?: string;
		}): Promise<void> => {
			const cloudTasks = useCloudTaskStore.getState();
			const taskId =
				existingTaskId ??
				cloudTasks.createTask({
					kind:
						activeTab === "audio-gen" || activeTab === "audio-sync"
							? "audio-generation"
							: "generation",
					label:
						activeTab === "audio-gen"
							? "AI 音效生成"
							: activeTab === "audio-sync"
								? "AI 音画同步"
								: "AI 视频增强",
					payload: {
						activeTab,
						sourceName: sourceVideo?.name,
						targetElementId,
						params,
					},
					estimatedCostUsd: activeTab === "audio-gen" ? 0.035 : undefined,
				});
			canceledTaskIdsRef.current.delete(taskId);
			activeTaskIdRef.current = taskId;
			cloudTasks.startTask({
				id: taskId,
				message: VIDEO_EDIT_STATUS_MESSAGES.UPLOADING,
			});
			const open = () =>
				useMediaPanelStore.getState().setActiveTab("video-edit");
			const retry = () => {
				if (
					useCloudTaskStore.getState().tasks.find((task) => task.id === taskId)
						?.status !== "queued"
				) {
					useCloudTaskStore.getState().retryTask({ id: taskId });
				}
				return retryOperationRef.current?.({ params, taskId });
			};
			registerCloudTaskRuntimeActions({
				taskId,
				actions: {
					cancel: () => {
						canceledTaskIdsRef.current.add(taskId);
						useCloudTaskStore.getState().cancelTask({ id: taskId });
						setState((current) => ({
							...current,
							isProcessing: false,
							statusMessage: "任务已取消",
							currentStage: "failed",
						}));
					},
					retry,
					open,
				},
			});
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
						throw new Error("无效的处理类型");
				}
				if (canceledTaskIdsRef.current.has(taskId)) return;

				const inserted = await addToMediaStore(result);
				if (canceledTaskIdsRef.current.has(taskId)) return;

				// Update state
				setState((prev) => ({
					...prev,
					isProcessing: false,
					progress: 100,
					statusMessage: VIDEO_EDIT_STATUS_MESSAGES.COMPLETE,
					currentStage: "complete",
					result,
				}));
				useCloudTaskStore.getState().completeTask({
					id: taskId,
					message:
						inserted.timelineElementId !== undefined
							? "AI 音效已添加到时间线"
							: "AI 处理完成",
					actualCostUsd: result.cost,
					output: {
						mediaId: inserted.mediaId,
						timelineElementId: inserted.timelineElementId,
						timelineTrackId: inserted.timelineTrackId,
						videoUrl: result.videoUrl,
						audioUrl: result.audioUrl,
					},
				});
				registerCloudTaskRuntimeActions({
					taskId,
					actions: {
						open,
						retry,
						undo:
							inserted.mediaId && activeProject
								? async () => {
									if (
										inserted.timelineTrackId &&
										inserted.timelineElementId
									) {
										useTimelineStore
											.getState()
											.removeElementFromTrack(
												inserted.timelineTrackId,
												inserted.timelineElementId,
												true
											);
									}
									await useMediaStore
										.getState()
										.removeMediaItem(activeProject.id, inserted.mediaId!);
									useCloudTaskStore.getState().completeTask({
										id: taskId,
										message: "AI 音效结果已撤销",
										output: { mediaId: inserted.mediaId, undone: true },
									});
									registerCloudTaskRuntimeActions({
										taskId,
										actions: { open, retry },
									});
								}
								: undefined,
					},
				});

				// Notify parent
				if (onSuccess) {
					onSuccess(result);
				}
			} catch (error) {
				if (canceledTaskIdsRef.current.has(taskId)) return;
				const errorMessage =
					error instanceof Error ? error.message : "处理失败";

				setState((prev) => ({
					...prev,
					isProcessing: false,
					progress: 0,
					statusMessage: VIDEO_EDIT_STATUS_MESSAGES.FAILED,
					currentStage: "failed",
					error: errorMessage,
				}));
				useCloudTaskStore.getState().failTask({
					id: taskId,
					error: errorMessage,
				});

				if (onError) {
					onError(errorMessage);
				}
			} finally {
				if (activeTaskIdRef.current === taskId) {
					activeTaskIdRef.current = null;
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
			sourceVideo?.name,
			targetElementId,
		]
	);
	retryOperationRef.current = ({ params, taskId }) =>
		runProcess({ params, existingTaskId: taskId });
	const handleProcess = useCallback(
		(params: VideoEditParams) => runProcess({ params }),
		[runProcess]
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
