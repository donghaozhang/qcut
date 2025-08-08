/**
 * AI Generation Management Hook
 *
 * Extracted from ai.tsx as part of safe refactoring process.
 * Manages AI video generation, progress tracking, and API integration.
 *
 * @see ai-view-refactoring-guide.md for refactoring plan
 * @see ai-refactoring-subtasks.md for implementation tracking
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  generateVideo,
  generateVideoFromImage,
  handleApiError,
  getGenerationStatus,
  ProgressCallback,
} from "@/lib/ai-video-client";
import { AIVideoOutputManager } from "@/lib/ai-video-output";
import { debugLogger } from "@/lib/debug-logger";
import { getMediaStoreUtils } from "@/stores/media-store-loader";
import { debugLog, debugError, debugWarn } from "@/lib/debug-config";
import { useAsyncMediaStoreActions } from "@/hooks/use-async-media-store";

import {
  AI_MODELS,
  UI_CONSTANTS,
  PROGRESS_CONSTANTS,
  STATUS_MESSAGES,
  ERROR_MESSAGES,
} from "./ai-constants";
import type {
  GeneratedVideo,
  GeneratedVideoResult,
  AIGenerationState,
  UseAIGenerationProps,
  ProgressCallback as AIProgressCallback,
} from "./ai-types";

/**
 * Custom hook for managing AI video generation
 * Handles generation logic, progress tracking, polling, and API integration
 */
export function useAIGeneration(props: UseAIGenerationProps) {
  const {
    prompt,
    selectedModels,
    selectedImage,
    activeTab,
    activeProject,
    onProgress,
    onError,
    onComplete,
    onJobIdChange,
    onGeneratedVideoChange,
  } = props;

  // Core generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState<number | undefined>();
  const [currentModelIndex, setCurrentModelIndex] = useState(0);
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(
    null
  );

  // Critical state variables identified in validation
  const [jobId, setJobId] = useState<string | null>(null);
  const [generatedVideo, setGeneratedVideo] = useState<GeneratedVideo | null>(
    null
  );
  const [generatedVideos, setGeneratedVideos] = useState<
    GeneratedVideoResult[]
  >([]);

  // Polling lifecycle management
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(
    null
  );

  // Service instance management
  const [outputManager] = useState(
    () => new AIVideoOutputManager("./ai-generated-videos")
  );

  // Store hooks
  const {
    addMediaItem,
    loading: mediaStoreLoading,
    error: mediaStoreError,
  } = useAsyncMediaStoreActions();

  // Client-side elapsed time timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isGenerating && generationStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - generationStartTime) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating, generationStartTime]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Notify parent of state changes
  useEffect(() => {
    if (onJobIdChange) {
      onJobIdChange(jobId);
    }
  }, [jobId, onJobIdChange]);

  useEffect(() => {
    if (onGeneratedVideoChange) {
      onGeneratedVideoChange(generatedVideo);
    }
  }, [generatedVideo, onGeneratedVideoChange]);

  useEffect(() => {
    if (onProgress) {
      onProgress(generationProgress, statusMessage);
    }
  }, [generationProgress, statusMessage, onProgress]);

  // Helper function to download video to memory
  const downloadVideoToMemory = useCallback(
    async (videoUrl: string): Promise<Uint8Array> => {
      debugLog("📥 Starting video download from:", videoUrl);

      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download video: ${response.status} ${response.statusText}`
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not readable");
      }

      const chunks: Uint8Array[] = [];
      let receivedLength = 0;

      // Read the stream
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        if (value) {
          chunks.push(value);
          receivedLength += value.length;
        }
      }

      // Concatenate chunks into single Uint8Array
      const result = new Uint8Array(receivedLength);
      let position = 0;

      for (const chunk of chunks) {
        result.set(chunk, position);
        position += chunk.length;
      }

      debugLog(`📥 Download complete: ${result.length} bytes`);
      return result;
    },
    []
  );

  // Status polling function
  const startStatusPolling = useCallback(
    (jobId: string) => {
      // Clear any existing polling interval before starting a new one
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }

      setGenerationProgress(PROGRESS_CONSTANTS.POLLING_START_PROGRESS);
      setStatusMessage(STATUS_MESSAGES.STARTING);

      const pollStatus = async () => {
        try {
          const status = await getGenerationStatus(jobId);

          if (status.progress) {
            setGenerationProgress(status.progress);
          }

          if (status.status === "processing") {
            setStatusMessage(
              `${STATUS_MESSAGES.PROCESSING} ${status.progress || 0}%`
            );
          } else if (status.status === "completed" && status.video_url) {
            // Clear polling
            if (pollingInterval) {
              clearInterval(pollingInterval);
              setPollingInterval(null);
            }

            setGenerationProgress(PROGRESS_CONSTANTS.COMPLETE_PROGRESS);
            setStatusMessage(STATUS_MESSAGES.COMPLETE);

            const newVideo: GeneratedVideo = {
              jobId,
              videoUrl: status.video_url,
              videoPath: undefined,
              fileSize: undefined,
              duration: undefined,
              prompt: prompt.trim(),
              model: selectedModels[0] || "unknown",
            };

            setGeneratedVideo(newVideo);

            // Automatically add to media store
            if (activeProject) {
              try {
                const response = await fetch(newVideo.videoUrl);
                const blob = await response.blob();
                const file = new File(
                  [blob],
                  `generated-video-${newVideo.jobId.substring(0, 8)}.mp4`,
                  { type: "video/mp4" }
                );

                if (!addMediaItem) {
                  throw new Error("Media store not ready");
                }

                await addMediaItem(activeProject.id, {
                  name: `AI: ${newVideo.prompt.substring(0, 30)}...`,
                  type: "video",
                  file,
                  url: newVideo.videoUrl,
                  duration: newVideo.duration || 5,
                  width: 1920,
                  height: 1080,
                });

                debugLogger.log("AIGeneration", "VIDEO_ADDED_TO_MEDIA_STORE", {
                  videoUrl: newVideo.videoUrl,
                  projectId: activeProject.id,
                });
              } catch (error) {
                debugLogger.log(
                  "AIGeneration",
                  "VIDEO_ADD_TO_MEDIA_STORE_FAILED",
                  {
                    error:
                      error instanceof Error ? error.message : "Unknown error",
                    projectId: activeProject.id,
                  }
                );
              }
            }

            setIsGenerating(false);
          } else if (status.status === "failed") {
            // Clear polling
            if (pollingInterval) {
              clearInterval(pollingInterval);
              setPollingInterval(null);
            }

            const errorMessage =
              status.error || ERROR_MESSAGES.GENERATION_FAILED;
            onError?.(errorMessage);
            setIsGenerating(false);
          }
        } catch (error) {
          debugLogger.log("AIGeneration", "STATUS_POLLING_ERROR", {
            error: error instanceof Error ? error.message : "Unknown error",
            jobId,
          });
          setGenerationProgress((prev) => Math.min(prev + 5, 90));
        }
      };

      // Poll immediately, then every 3 seconds
      pollStatus();
      const interval = setInterval(
        pollStatus,
        UI_CONSTANTS.POLLING_INTERVAL_MS
      );
      setPollingInterval(interval);
    },
    [
      pollingInterval,
      prompt,
      selectedModels,
      activeProject,
      addMediaItem,
      onError,
    ]
  );

  // Mock generation function for testing
  const handleMockGenerate = useCallback(async () => {
    if (activeTab === "text") {
      if (!prompt.trim() || selectedModels.length === 0) return;
    } else {
      if (!selectedImage || selectedModels.length === 0) return;
    }

    setIsGenerating(true);
    setJobId(null);
    setGeneratedVideos([]);

    // Start the client-side timer
    const startTime = Date.now();
    setGenerationStartTime(startTime);
    setElapsedTime(0);

    try {
      const mockGenerations: GeneratedVideoResult[] = [];

      for (let i = 0; i < selectedModels.length; i++) {
        const modelId = selectedModels[i];
        const modelName = AI_MODELS.find((m) => m.id === modelId)?.name;

        setStatusMessage(
          `🧪 Mock generating with ${modelName} (${i + 1}/${selectedModels.length})`
        );

        // Simulate API delay
        await new Promise((resolve) => setTimeout(resolve, 1500));

        const mockVideo: GeneratedVideo = {
          jobId: `mock-job-${Date.now()}-${i}`,
          videoUrl:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          videoPath:
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          fileSize: 2_097_152,
          duration: 15,
          prompt: prompt.trim(),
          model: modelId,
        };

        mockGenerations.push({ modelId, video: mockVideo });

        debugLogger.log("AIGeneration", "MOCK_VIDEO_GENERATED", {
          modelName,
          mockJobId: mockVideo.jobId,
          modelId,
        });
      }

      setGeneratedVideos(mockGenerations);
      setStatusMessage(
        `🧪 Mock generated ${mockGenerations.length} videos successfully!`
      );
      onComplete?.(mockGenerations);
    } catch (error) {
      const errorMessage =
        "Mock generation error: " +
        (error instanceof Error ? error.message : "Unknown error");
      onError?.(errorMessage);
      debugLogger.log("AIGeneration", "MOCK_GENERATION_FAILED", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [activeTab, prompt, selectedImage, selectedModels, onError, onComplete]);

  // Main generation function
  const handleGenerate = useCallback(async () => {
    if (activeTab === "text") {
      if (!prompt.trim() || selectedModels.length === 0) return;
    } else {
      if (!selectedImage || selectedModels.length === 0) return;
    }

    setIsGenerating(true);
    setJobId(null);

    // Start the client-side timer
    const startTime = Date.now();
    setGenerationStartTime(startTime);
    setElapsedTime(0);

    // Reset any existing generated videos
    setGeneratedVideos([]);

    try {
      const generations: GeneratedVideoResult[] = [];

      // Sequential generation to avoid rate limits
      for (let i = 0; i < selectedModels.length; i++) {
        const modelId = selectedModels[i];
        const modelName = AI_MODELS.find((m) => m.id === modelId)?.name;

        setStatusMessage(
          `Generating with ${modelName} (${i + 1}/${selectedModels.length})`
        );

        let response;
        setCurrentModelIndex(i);

        // Create progress callback for this model
        const progressCallback: ProgressCallback = (status) => {
          setGenerationProgress(status.progress || 0);
          setStatusMessage(status.message || `Generating with ${modelName}...`);

          // Add to progress logs
          if (status.message) {
            setProgressLogs((prev) => [...prev.slice(-4), status.message!]);
          }
        };

        if (activeTab === "text") {
          response = await generateVideo(
            {
              prompt: prompt.trim(),
              model: modelId,
            },
            progressCallback
          );
        } else if (selectedImage) {
          response = await generateVideoFromImage({
            image: selectedImage,
            prompt: prompt.trim(),
            model: modelId,
          });
        }

        if (response?.job_id) {
          // For now, just add the response as a generated video
          // The actual polling and download will be handled by the status polling
          const newVideo: GeneratedVideo = {
            jobId: response.job_id,
            videoUrl: "", // Will be filled when polling completes
            videoPath: undefined,
            fileSize: undefined,
            duration: undefined,
            prompt: prompt.trim(),
            model: modelId,
          };

          // Add to generations array so results are properly tracked
          generations.push({ modelId, video: newVideo });

          // Start status polling for this job
          startStatusPolling(response.job_id);

          debugLogger.log("AIGeneration", "GENERATION_STARTED", {
            jobId: response.job_id,
            model: modelId,
            modelName,
          });
        }
      }

      setGeneratedVideos(generations);
      setStatusMessage(`Generated ${generations.length} videos successfully!`);
      onComplete?.(generations);
    } catch (error) {
      const errorMessage = handleApiError(error);
      onError?.(errorMessage);
      debugLogger.log("AIGeneration", "GENERATION_FAILED", {
        error: errorMessage,
        activeTab,
        selectedModelsCount: selectedModels.length,
      });
    } finally {
      setIsGenerating(false);
    }
  }, [
    activeTab,
    prompt,
    selectedImage,
    selectedModels,
    onError,
    onComplete,
    startStatusPolling,
  ]);

  // Reset generation state
  const resetGenerationState = useCallback(() => {
    setIsGenerating(false);
    setGenerationProgress(PROGRESS_CONSTANTS.INITIAL_PROGRESS);
    setStatusMessage("");
    setElapsedTime(0);
    setEstimatedTime(undefined);
    setCurrentModelIndex(0);
    setProgressLogs([]);
    setGenerationStartTime(null);
    setJobId(null);
    setGeneratedVideo(null);
    setGeneratedVideos([]);

    // Critical: Cleanup polling interval
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [pollingInterval]);

  // Export the complete generation state
  const generationState: AIGenerationState = {
    isGenerating,
    generationProgress,
    statusMessage,
    elapsedTime,
    estimatedTime,
    currentModelIndex,
    progressLogs,
    generationStartTime,
    jobId,
    generatedVideo,
    generatedVideos,
    pollingInterval,
  };

  return {
    // State
    isGenerating,
    generationProgress,
    statusMessage,
    elapsedTime,
    estimatedTime,
    currentModelIndex,
    progressLogs,
    generationStartTime,
    jobId,
    setJobId,
    generatedVideo,
    setGeneratedVideo,
    generatedVideos,
    setGeneratedVideos,
    pollingInterval,
    setPollingInterval,

    // Service instance
    outputManager,

    // Actions
    handleGenerate,
    handleMockGenerate,
    resetGenerationState,
    startStatusPolling,
    downloadVideoToMemory,

    // Complete state object
    generationState,

    // Computed values
    canGenerate:
      activeTab === "text"
        ? prompt.trim().length > 0 && selectedModels.length > 0
        : selectedImage !== null && selectedModels.length > 0,
    isPolling: pollingInterval !== null,
    hasResults: generatedVideos.length > 0,

    // Media store state
    mediaStoreLoading,
    mediaStoreError,
  };
}

export type UseAIGenerationReturn = ReturnType<typeof useAIGeneration>;
