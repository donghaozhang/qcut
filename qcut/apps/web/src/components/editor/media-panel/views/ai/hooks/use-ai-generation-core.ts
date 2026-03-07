/**
 * AI Generation Core Logic Hook
 *
 * Contains the main handleGenerate callback that orchestrates AI video generation.
 * Extracted from use-ai-generation.ts for maintainability.
 */

import { useCallback } from "react";
import {
	handleApiError,
	type ProgressCallback,
} from "@/lib/ai-clients/ai-video-client";
import { debugLogger } from "@/lib/debug/debug-logger";
import {
	routeTextToVideoHandler,
	routeImageToVideoHandler,
	routeUpscaleHandler,
	routeAvatarHandler,
	type TextToVideoSettings,
	type ImageToVideoSettings,
	type AvatarSettings,
	type UpscaleSettings,
	type ModelHandlerContext,
} from "./generation";
import {
	validateGenerationInputs,
	buildUnifiedParams,
	getModelCapabilities,
	processModelResponse,
	type ValidationContext,
	type ResponseHandlerContext,
} from "./use-ai-generation-helpers";
import { AI_MODELS } from "../constants/ai-constants";
import type {
	GeneratedVideoResult,
	UseAIGenerationProps,
} from "../types/ai-types";
import type { AIGenerationInternalState } from "./use-ai-generation-state";

export function useHandleGenerate(
	props: UseAIGenerationProps,
	state: AIGenerationInternalState
) {
	const {
		activeTab,
		prompt,
		selectedImage,
		avatarImage,
		audioFile,
		sourceVideo,
		sourceVideoFile = null,
		sourceVideoUrl = "",
		referenceImages,
		selectedModels,
		activeProject,
		onError,
		onComplete,
		hailuoT2VDuration = 6,
		t2vAspectRatio = "16:9",
		t2vResolution = "1080p",
		t2vDuration = 4,
		t2vNegativePrompt = "low resolution, error, worst quality, low quality, defects",
		t2vPromptExpansion = false,
		t2vSeed = -1,
		t2vSafetyChecker = false,
		viduQ2Duration = 4,
		viduQ2Resolution = "720p",
		viduQ2MovementAmplitude = "auto",
		viduQ2EnableBGM = false,
		ltxv2Duration = 6,
		ltxv2Resolution = "1080p",
		ltxv2FPS = 25,
		ltxv2GenerateAudio = true,
		ltxv2FastDuration = 6,
		ltxv2FastResolution = "1080p",
		ltxv2FastFPS = 25,
		ltxv2FastGenerateAudio = true,
		ltx23Duration = 6,
		ltx23Resolution = "1080p",
		ltx23FPS = 25,
		ltx23GenerateAudio = true,
		ltx23AspectRatio = "16:9",
		ltx23FastDuration = 6,
		ltx23FastResolution = "1080p",
		ltx23FastFPS = 25,
		ltx23FastGenerateAudio = true,
		ltx23FastAspectRatio = "16:9",
		ltxv2I2VDuration = 6,
		ltxv2I2VResolution = "1080p",
		ltxv2I2VFPS = 25,
		ltxv2I2VGenerateAudio = true,
		ltxv2ImageDuration = 6,
		ltxv2ImageResolution = "1080p",
		ltxv2ImageFPS = 25,
		ltxv2ImageGenerateAudio = true,
		ltx23I2VDuration = 6,
		ltx23I2VResolution = "1080p",
		ltx23I2VFPS = 25,
		ltx23I2VGenerateAudio = true,
		ltx23I2VAspectRatio = "16:9",
		ltx23I2VEndImageUrl = null,
		ltx23I2VEndImageFile = null,
		seedanceDuration = 5,
		seedanceResolution = "1080p",
		seedanceAspectRatio = "16:9",
		seedanceCameraFixed = false,
		seedanceEndFrameUrl,
		seedanceEndFrameFile = null,
		imageSeed,
		klingDuration = 5,
		klingCfgScale = 0.5,
		klingAspectRatio = "16:9",
		klingEnhancePrompt = true,
		klingNegativePrompt,
		kling26Duration = 5,
		kling26GenerateAudio = true,
		kling26NegativePrompt,
		wan25Duration = 5,
		wan25Resolution = "1080p",
		wan25AudioUrl,
		wan25AudioFile = null,
		wan25NegativePrompt,
		wan25EnablePromptExpansion = true,
		wan26T2VDuration = 5,
		wan26T2VResolution = "1080p",
		wan26T2VAspectRatio = "16:9",
		wan26T2VNegativePrompt,
		wan26T2VEnablePromptExpansion = true,
		wan26T2VMultiShots = false,
		wan26Duration = 5,
		wan26Resolution = "1080p",
		wan26AspectRatio = "16:9",
		wan26AudioUrl,
		wan26AudioFile = null,
		wan26NegativePrompt,
		wan26EnablePromptExpansion = true,
		klingAvatarV2Prompt = "",
		audioDuration = null,
		syncLipsyncEmotion = "neutral",
		syncLipsyncModelMode = "face",
		syncLipsyncSyncMode = "bounce",
		syncLipsyncTemperature = 0.5,
		videoDuration = null,
		extendVideoAspectRatio = "auto",
		extendVideoGenerateAudio = true,
		bytedanceTargetResolution = "1080p",
		bytedanceTargetFPS = "30fps",
		flashvsrUpscaleFactor = 4,
		flashvsrAcceleration = "regular",
		flashvsrQuality = 70,
		flashvsrColorFix = true,
		flashvsrPreserveAudio = false,
		flashvsrOutputFormat = "X264",
		flashvsrOutputQuality = "high",
		flashvsrOutputWriteMode = "balanced",
		flashvsrSeed,
	} = props;

	const {
		setIsGenerating,
		setJobId,
		setGenerationStartTime,
		setElapsedTime,
		setGeneratedVideos,
		setCurrentModelIndex,
		setGenerationProgress,
		setStatusMessage,
		setProgressLogs,
		addMediaItem,
		mediaStoreLoading,
		mediaStoreError,
		startStatusPolling,
		uploadImageToFal,
		uploadAudioToFal,
		veo31Settings,
		duration,
		aspectRatio,
		resolution,
		firstFrame,
		lastFrame,
	} = state;

	return useCallback(async () => {
		const startTimestamp = new Date().toISOString();
		console.log("step 3: handleGenerate invoked (AI video flow)");
		console.log("============================================================");
		console.log("=== handleGenerate CALLED ===");
		console.log("============================================================");
		console.log("Timestamp:", startTimestamp);
		console.log("Input parameters:");
		console.log("  - activeTab:", activeTab);
		console.log(
			"  - prompt:",
			prompt?.substring(0, 100) + (prompt && prompt.length > 100 ? "..." : "")
		);
		console.log("  - prompt length:", prompt?.length ?? 0);
		console.log("  - selectedModels:", selectedModels);
		console.log("  - hasSelectedImage:", !!selectedImage);
		console.log(
			"  - imageFile:",
			selectedImage
				? (selectedImage as File).name
					? `${(selectedImage as File).name} (${(selectedImage as File).size} bytes)`
					: "[image provided]"
				: "null"
		);
		console.log("  - activeProject:", activeProject?.id ?? "none");
		console.log("  - activeProject name:", activeProject?.name ?? "n/a");
		console.log(
			"  - addMediaItem available:",
			typeof addMediaItem === "function"
		);
		console.log("");

		const validationCtx: ValidationContext = {
			prompt,
			selectedModels,
			selectedImage,
			firstFrame,
			lastFrame,
			sourceVideo,
			audioFile,
			avatarImage,
			referenceImages: referenceImages ?? [],
		};
		const validationError = validateGenerationInputs(activeTab, validationCtx);

		if (validationError) {
			console.error("❌ Validation failed!");
			console.error("  - Reason:", validationError);
			console.error("  - Missing prompt:", !prompt);
			console.error("  - No models selected:", selectedModels.length === 0);
			console.error("  - No active project:", !activeProject);
			return;
		}

		console.log("✅ Validation passed, starting generation...");
		console.log("  - Models to process:", selectedModels.length);
		console.log("  - Active project:", !!activeProject);
		console.log("  - Media store available:", !!addMediaItem);
		setIsGenerating(true);
		setJobId(null);

		// Start the client-side timer
		const startTime = Date.now();
		setGenerationStartTime(startTime);
		setElapsedTime(0);

		// Reset any existing generated videos
		setGeneratedVideos([]);

		try {
			console.log("step 3a: pre-generation state check");
			console.log("   - activeProject:", !!activeProject, activeProject?.id);
			console.log(
				"   - addMediaItem available:",
				!!addMediaItem,
				typeof addMediaItem
			);
			console.log("   - mediaStoreLoading:", mediaStoreLoading);
			console.log("   - mediaStoreError:", mediaStoreError);

			const generations: GeneratedVideoResult[] = [];
			console.log(
				`\n📦 Starting generation for ${selectedModels.length} models`
			);

			// Sequential generation to avoid rate limits
			for (let i = 0; i < selectedModels.length; i++) {
				const modelId = selectedModels[i];
				const modelName = AI_MODELS.find((m) => m.id === modelId)?.name;
				const modelCapabilities = getModelCapabilities(modelId);
				const isSora2TextModel =
					activeTab === "text" && modelId.startsWith("sora2_");

				// Build unified params via extracted helper
				const unifiedParams = buildUnifiedParams({
					modelId,
					modelCapabilities,
					isSora2TextModel,
					t2vAspectRatio,
					t2vResolution,
					t2vDuration,
					t2vNegativePrompt,
					t2vPromptExpansion,
					t2vSeed,
					t2vSafetyChecker,
				});

				console.log(`step 4: sanitized params for ${modelId}`, {
					unifiedParams,
					requestedDuration: t2vDuration,
				});

				console.log(
					`\n🎬 [${i + 1}/${selectedModels.length}] Processing model: ${modelId} (${modelName})`
				);

				setStatusMessage(
					`Generating with ${modelName} (${i + 1}/${selectedModels.length})`
				);

				let response;
				setCurrentModelIndex(i);

				// Create progress callback for this model
				const progressCallback: ProgressCallback = (status) => {
					console.log(`  📊 Progress for ${modelId}:`, status);
					setGenerationProgress(status.progress || 0);
					setStatusMessage(status.message || `Generating with ${modelName}...`);

					// Add to progress logs
					if (status.message) {
						setProgressLogs((prev) => [...prev.slice(-4), status.message!]);
					}
				};

				console.log(
					`step 5: sending generation request for ${modelId} (${activeTab} tab)`,
					unifiedParams
				);

				// Build handler context
				const handlerCtx: ModelHandlerContext = {
					prompt: prompt.trim(),
					modelId,
					modelName: modelName || modelId,
					progressCallback,
				};

				// Route to appropriate handler based on tab
				let handlerResult;

				if (activeTab === "text") {
					console.log(`  📝 Processing text-to-video model ${modelId}...`);

					const t2vSettings: TextToVideoSettings = {
						veo31Settings,
						hailuoT2VDuration,
						ltxv2Duration,
						ltxv2Resolution,
						ltxv2FPS,
						ltxv2GenerateAudio,
						ltxv2FastDuration,
						ltxv2FastResolution,
						ltxv2FastFPS,
						ltxv2FastGenerateAudio,
						ltx23Duration,
						ltx23Resolution,
						ltx23FPS,
						ltx23GenerateAudio,
						ltx23AspectRatio,
						ltx23FastDuration,
						ltx23FastResolution,
						ltx23FastFPS,
						ltx23FastGenerateAudio,
						ltx23FastAspectRatio,
						unifiedParams,
						duration,
						aspectRatio,
						resolution,
						wan26T2VDuration,
						wan26T2VResolution,
						wan26T2VAspectRatio,
						wan26T2VNegativePrompt: wan26T2VNegativePrompt ?? "",
						wan26T2VEnablePromptExpansion,
						wan26T2VMultiShots,
					};

					handlerResult = await routeTextToVideoHandler(
						handlerCtx,
						t2vSettings
					);
					response = handlerResult.response;
					console.log("  ✅ Text-to-video response:", response);
				} else if (activeTab === "image") {
					console.log(`  🖼️ Calling generateVideoFromImage for ${modelId}...`);

					const i2vSettings: ImageToVideoSettings = {
						selectedImage,
						firstFrame,
						lastFrame,
						veo31Settings,
						viduQ2Duration,
						viduQ2Resolution,
						viduQ2MovementAmplitude,
						viduQ2EnableBGM,
						ltxv2I2VDuration,
						ltxv2I2VResolution,
						ltxv2I2VFPS,
						ltxv2I2VGenerateAudio,
						ltxv2ImageDuration,
						ltxv2ImageResolution,
						ltxv2ImageFPS,
						ltxv2ImageGenerateAudio,
						ltx23I2VDuration,
						ltx23I2VResolution,
						ltx23I2VFPS,
						ltx23I2VGenerateAudio,
						ltx23I2VAspectRatio,
						ltx23I2VEndImageUrl,
						ltx23I2VEndImageFile,
						seedanceDuration,
						seedanceResolution,
						seedanceAspectRatio,
						seedanceCameraFixed,
						seedanceEndFrameUrl: seedanceEndFrameUrl ?? null,
						seedanceEndFrameFile,
						klingDuration,
						klingCfgScale,
						klingAspectRatio,
						klingEnhancePrompt,
						klingNegativePrompt: klingNegativePrompt ?? "",
						kling26Duration,
						kling26GenerateAudio,
						kling26NegativePrompt: kling26NegativePrompt ?? "",
						wan25Duration,
						wan25Resolution,
						wan25AudioUrl: wan25AudioUrl ?? null,
						wan25AudioFile,
						wan25NegativePrompt: wan25NegativePrompt ?? "",
						wan25EnablePromptExpansion,
						wan26Duration,
						wan26Resolution,
						wan26AspectRatio,
						wan26AudioUrl: wan26AudioUrl ?? null,
						wan26AudioFile,
						wan26NegativePrompt: wan26NegativePrompt ?? "",
						wan26EnablePromptExpansion,
						imageSeed: imageSeed ?? null,
						duration,
						aspectRatio,
						resolution,
						uploadImageToFal,
						uploadAudioToFal,
					};

					handlerResult = await routeImageToVideoHandler(
						handlerCtx,
						i2vSettings
					);

					if (handlerResult.shouldSkip) {
						console.log(`  ⚠️ Skipping model - ${handlerResult.skipReason}`);
						continue;
					}

					response = handlerResult.response;
					console.log("  ✅ generateVideoFromImage returned:", response);
				} else if (activeTab === "upscale") {
					const upscaleSettings: UpscaleSettings = {
						sourceVideoFile,
						sourceVideoUrl: sourceVideoUrl || null,
						bytedanceTargetResolution,
						bytedanceTargetFPS,
						flashvsrUpscaleFactor: flashvsrUpscaleFactor ?? null,
						flashvsrAcceleration,
						flashvsrQuality,
						flashvsrColorFix,
						flashvsrPreserveAudio,
						flashvsrOutputFormat,
						flashvsrOutputQuality,
						flashvsrOutputWriteMode,
						flashvsrSeed: flashvsrSeed ?? null,
					};

					handlerResult = await routeUpscaleHandler(
						handlerCtx,
						upscaleSettings
					);

					if (handlerResult.shouldSkip) {
						console.log(`  ⚠️ Skipping model - ${handlerResult.skipReason}`);
						continue;
					}

					response = handlerResult.response;
				} else if (activeTab === "avatar") {
					const avatarSettings: AvatarSettings = {
						avatarImage: avatarImage ?? null,
						audioFile: audioFile ?? null,
						sourceVideo: sourceVideo ?? null,
						referenceImages: referenceImages ?? [],
						klingAvatarV2Prompt,
						audioDuration,
						uploadImageToFal,
						uploadAudioToFal,
						syncLipsyncEmotion,
						syncLipsyncModelMode,
						syncLipsyncLipsyncMode: syncLipsyncSyncMode,
						syncLipsyncTemperature,
						videoDuration,
						extendVideoAspectRatio,
						extendVideoGenerateAudio,
					};

					handlerResult = await routeAvatarHandler(handlerCtx, avatarSettings);

					if (handlerResult.shouldSkip) {
						console.log(`  ⚠️ Skipping model - ${handlerResult.skipReason}`);
						continue;
					}

					response = handlerResult.response;
				}

				// Process response via extracted helper
				const responseCtx: ResponseHandlerContext = {
					prompt: prompt.trim(),
					modelId,
					activeTab,
					activeProject,
					addMediaItem,
					onError: (error) => onError?.(error),
					setIsGenerating,
					setGenerationProgress,
					setStatusMessage,
					startStatusPolling,
				};

				const result = await processModelResponse(response, responseCtx);
				if (result) {
					generations.push({ modelId, video: result.video });
					if (result.fatal) return;
				}
			}

			console.log("\n✅✅✅ GENERATION LOOP COMPLETE ✅✅✅");
			console.log("  - Total generations created:", generations.length);
			console.log("  - Generations:", generations);

			setGeneratedVideos(generations);
			setStatusMessage(`Generated ${generations.length} videos successfully!`);

			console.log(
				"step 7: generation flow complete; updating UI and callbacks"
			);

			console.log(
				`📤 Calling onComplete callback with ${generations.length} videos`
			);
			onComplete?.(generations);
			console.log("✅ onComplete callback finished");
		} catch (error) {
			console.error("❌❌❌ GENERATION FAILED ❌❌❌", error);
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
		avatarImage,
		audioFile,
		sourceVideo,
		sourceVideoFile,
		sourceVideoUrl,
		referenceImages,
		selectedModels,
		activeProject,
		addMediaItem,
		mediaStoreLoading,
		mediaStoreError,
		onError,
		onComplete,
		startStatusPolling,
		veo31Settings,
		t2vAspectRatio,
		t2vResolution,
		t2vDuration,
		t2vNegativePrompt,
		t2vPromptExpansion,
		t2vSeed,
		t2vSafetyChecker,
		aspectRatio,
		duration,
		resolution,
		firstFrame,
		lastFrame,
		uploadImageToFal,
		seedanceDuration,
		seedanceResolution,
		seedanceAspectRatio,
		seedanceCameraFixed,
		seedanceEndFrameUrl,
		seedanceEndFrameFile,
		klingDuration,
		klingCfgScale,
		klingAspectRatio,
		klingEnhancePrompt,
		klingNegativePrompt,
		kling26Duration,
		kling26GenerateAudio,
		kling26NegativePrompt,
		wan25Duration,
		wan25Resolution,
		wan25AudioUrl,
		wan25AudioFile,
		wan25NegativePrompt,
		wan25EnablePromptExpansion,
		imageSeed,
		uploadAudioToFal,
		klingAvatarV2Prompt,
		audioDuration,
		syncLipsyncEmotion,
		syncLipsyncModelMode,
		syncLipsyncSyncMode,
		syncLipsyncTemperature,
		videoDuration,
		bytedanceTargetResolution,
		bytedanceTargetFPS,
		flashvsrUpscaleFactor,
		flashvsrAcceleration,
		flashvsrQuality,
		flashvsrColorFix,
		flashvsrPreserveAudio,
		flashvsrOutputFormat,
		flashvsrOutputQuality,
		flashvsrOutputWriteMode,
		flashvsrSeed,
		hailuoT2VDuration,
		ltxv2Duration,
		ltxv2FPS,
		ltxv2FastDuration,
		ltxv2FastFPS,
		ltxv2FastGenerateAudio,
		ltxv2FastResolution,
		ltxv2GenerateAudio,
		ltxv2I2VDuration,
		ltxv2I2VFPS,
		ltxv2I2VGenerateAudio,
		ltxv2I2VResolution,
		ltxv2ImageDuration,
		ltxv2ImageFPS,
		ltxv2ImageGenerateAudio,
		ltxv2ImageResolution,
		ltxv2Resolution,
		ltx23Duration,
		ltx23Resolution,
		ltx23FPS,
		ltx23GenerateAudio,
		ltx23AspectRatio,
		ltx23FastDuration,
		ltx23FastResolution,
		ltx23FastFPS,
		ltx23FastGenerateAudio,
		ltx23FastAspectRatio,
		ltx23I2VDuration,
		ltx23I2VResolution,
		ltx23I2VFPS,
		ltx23I2VGenerateAudio,
		ltx23I2VAspectRatio,
		ltx23I2VEndImageUrl,
		ltx23I2VEndImageFile,
		viduQ2Duration,
		viduQ2EnableBGM,
		viduQ2MovementAmplitude,
		viduQ2Resolution,
		wan26T2VDuration,
		wan26T2VResolution,
		wan26T2VAspectRatio,
		wan26T2VNegativePrompt,
		wan26T2VEnablePromptExpansion,
		wan26T2VMultiShots,
		wan26Duration,
		wan26Resolution,
		wan26AspectRatio,
		wan26AudioUrl,
		wan26AudioFile,
		wan26NegativePrompt,
		wan26EnablePromptExpansion,
		extendVideoAspectRatio,
		extendVideoGenerateAudio,
		setCurrentModelIndex,
		setGeneratedVideos,
		setJobId,
		setStatusMessage,
		setIsGenerating,
		setProgressLogs,
		setGenerationStartTime,
		setElapsedTime,
		setGenerationProgress,
	]);
}
