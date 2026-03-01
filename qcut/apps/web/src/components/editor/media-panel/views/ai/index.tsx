"use client";

import {
	BotIcon,
	Loader2,
	History,
	TypeIcon,
	ImageIcon,
	UserIcon,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useProjectStore } from "@/stores/project-store";
import { usePanelStore } from "@/stores/editor/panel-store";
import { useMediaPanelStore } from "../../store";
import { AIHistoryPanel } from "./components/ai-history-panel";
import { debugLogger } from "@/lib/debug/debug-logger";

// Import extracted hooks
import { useAIGeneration } from "./hooks/use-ai-generation";
import { useAIHistory } from "./hooks/use-ai-history";
import { useTextTabState } from "./hooks/use-ai-text-tab-state";
import { useImageTabState } from "./hooks/use-ai-image-tab-state";
import { useAvatarTabState } from "./hooks/use-ai-avatar-tab-state";
import { useUpscaleTabState } from "./hooks/use-ai-upscale-tab-state";
import { useAnglesTabState } from "./hooks/use-ai-angles-tab-state";

// Import constants and types
import { AI_MODELS, REVE_TEXT_TO_IMAGE_MODEL } from "./constants/ai-constants";
import {
	getCombinedCapabilities,
	resolveT2VModelId,
	type T2VModelId,
} from "./constants/text2video-models-config";
import type { AIActiveTab } from "./types/ai-types";
import type {
	ReveAspectRatioOption,
	ReveOutputFormatOption,
} from "./constants/ai-model-options";

// Import extracted Phase 3 hooks and components
import { useCostCalculation } from "./hooks/use-cost-calculation";
import { useAIPanelEffects } from "./hooks/use-ai-panel-effects";
import { AIModelSelectionGrid } from "./components/ai-model-selection-grid";

// Import extracted sub-components
import { AITabsContent } from "./components/ai-tabs-content";
import { AIModelSettingsPanel } from "./components/ai-model-settings-panel";
import { AIActionsSection } from "./components/ai-actions-section";

/**
 * Render the AI features panel including tabs for Text, Image, Avatar, and Upscale,
 * model selection, per-model settings, cost estimates, media uploads, generation controls,
 * and generated results/history integration.
 */
export function AiView({ mode }: { mode?: "upscale" | "angles" } = {}) {
	// ============================================
	// Shared State
	// ============================================
	const [prompt, setPrompt] = useState("");
	const [selectedModels, setSelectedModels] = useState<string[]>([
		"sora2_text_to_video_pro",
	]);
	const [selectedImage, setSelectedImage] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Reve Text-to-Image state
	const [reveAspectRatio, setReveAspectRatio] = useState<ReveAspectRatioOption>(
		REVE_TEXT_TO_IMAGE_MODEL.defaultAspectRatio
	);
	const [reveNumImages, setReveNumImages] = useState<number>(
		REVE_TEXT_TO_IMAGE_MODEL.defaultNumImages
	);
	const [reveOutputFormat, setReveOutputFormat] =
		useState<ReveOutputFormatOption>(
			REVE_TEXT_TO_IMAGE_MODEL.defaultOutputFormat
		);

	// Use global AI tab state (override to "upscale" when in upscale mode)
	const { aiActiveTab: globalActiveTab, setAiActiveTab: setActiveTab } =
		useMediaPanelStore();
	const activeTab = mode ? mode : globalActiveTab;

	// Set default recommended model when switching tabs
	const prevTabRef = useRef(activeTab);
	useEffect(() => {
		if (prevTabRef.current !== activeTab) {
			prevTabRef.current = activeTab;
			const defaults: Partial<Record<typeof activeTab, string>> = {
				text: "sora2_text_to_video_pro",
				image: "sora2_image_to_video_pro",
				avatar: "kling_avatar_v2_pro",
			};
			const def = defaults[activeTab];
			if (def) setSelectedModels([def]);
		}
	}, [activeTab]);

	// Get project store
	const { activeProject } = useProjectStore();

	// ============================================
	// Tab State Hooks
	// ============================================
	const textTabState = useTextTabState({ selectedModels });
	const imageTabState = useImageTabState({ selectedModels });
	const avatarTabState = useAvatarTabState();
	const upscaleTabState = useUpscaleTabState();
	const anglesTabState = useAnglesTabState();

	const { state: textState, setters: textSetters } = textTabState;
	const { state: imageState } = imageTabState;
	const { state: avatarState } = avatarTabState;
	const { state: upscaleState } = upscaleTabState;

	// ============================================
	// Computed Values
	// ============================================
	const combinedCapabilities = useMemo(() => {
		const textVideoModelIds = Array.from(
			new Set(
				selectedModels
					.map((modelId) => resolveT2VModelId(modelId))
					.filter((id): id is T2VModelId => Boolean(id))
			)
		);
		return getCombinedCapabilities(textVideoModelIds);
	}, [selectedModels]);

	// Side-effects: capability clamping, Reve reset, frame sync
	useAIPanelEffects({
		combinedCapabilities,
		t2vAspectRatio: textState.t2vAspectRatio,
		t2vResolution: textState.t2vResolution,
		t2vDuration: textState.t2vDuration,
		setT2vAspectRatio: textSetters.setT2vAspectRatio,
		setT2vResolution: textSetters.setT2vResolution,
		setT2vDuration: textSetters.setT2vDuration,
		selectedModels,
		setReveAspectRatio,
		setReveNumImages,
		setReveOutputFormat,
		firstFrame: imageState.firstFrame,
		lastFrame: imageState.lastFrame,
		firstFramePreview: imageState.firstFramePreview,
		setSelectedImage,
		setImagePreview,
	});

	// ============================================
	// Generation Hook
	// ============================================
	const generation = useAIGeneration({
		prompt,
		selectedModels,
		selectedImage,
		activeTab,
		activeProject,
		avatarImage: avatarState.avatarImage,
		audioFile: avatarState.audioFile,
		sourceVideo: avatarState.sourceVideo,
		sourceVideoFile: upscaleState.sourceVideoFile,
		sourceVideoUrl: upscaleState.sourceVideoUrl,
		referenceImages: avatarState.referenceImages,
		hailuoT2VDuration: textState.hailuoT2VDuration,
		t2vAspectRatio: textState.t2vAspectRatio,
		t2vResolution: textState.t2vResolution,
		t2vDuration: textState.t2vDuration,
		t2vNegativePrompt: textState.t2vNegativePrompt,
		t2vPromptExpansion: textState.t2vPromptExpansion,
		t2vSeed: textState.t2vSeed,
		t2vSafetyChecker: textState.t2vSafetyChecker,
		viduQ2Duration: imageState.viduQ2.duration,
		viduQ2Resolution: imageState.viduQ2.resolution,
		viduQ2MovementAmplitude: imageState.viduQ2.movementAmplitude,
		viduQ2EnableBGM: imageState.viduQ2.enableBGM,
		ltxv2Duration: textState.ltxv2Duration,
		ltxv2Resolution: textState.ltxv2Resolution,
		ltxv2FPS: textState.ltxv2FPS,
		ltxv2GenerateAudio: textState.ltxv2GenerateAudio,
		ltxv2FastDuration: textState.ltxv2FastDuration,
		ltxv2FastResolution: textState.ltxv2FastResolution,
		ltxv2FastFPS: textState.ltxv2FastFPS,
		ltxv2FastGenerateAudio: textState.ltxv2FastGenerateAudio,
		ltxv2I2VDuration: imageState.ltxv2I2V.duration,
		ltxv2I2VResolution: imageState.ltxv2I2V.resolution,
		ltxv2I2VFPS: imageState.ltxv2I2V.fps,
		ltxv2I2VGenerateAudio: imageState.ltxv2I2V.generateAudio,
		ltxv2ImageDuration: imageState.ltxv2Image.duration,
		ltxv2ImageResolution: imageState.ltxv2Image.resolution,
		ltxv2ImageFPS: imageState.ltxv2Image.fps,
		ltxv2ImageGenerateAudio: imageState.ltxv2Image.generateAudio,
		seedanceDuration: imageState.seedance.duration,
		seedanceResolution: imageState.seedance.resolution,
		seedanceAspectRatio: imageState.seedance.aspectRatio,
		seedanceCameraFixed: imageState.seedance.cameraFixed,
		seedanceEndFrameUrl: imageState.seedance.endFrameUrl
			? imageState.seedance.endFrameUrl.trim() || undefined
			: undefined,
		seedanceEndFrameFile: imageState.seedance.endFrameFile,
		imageSeed: imageState.imageSeed,
		klingDuration: imageState.kling.duration,
		klingCfgScale: imageState.kling.cfgScale,
		klingAspectRatio: imageState.kling.aspectRatio,
		klingEnhancePrompt: imageState.kling.enhancePrompt,
		klingNegativePrompt: imageState.kling.negativePrompt.trim() || undefined,
		kling26Duration: imageState.kling26.duration,
		kling26CfgScale: imageState.kling26.cfgScale,
		kling26AspectRatio: imageState.kling26.aspectRatio,
		kling26GenerateAudio: imageState.kling26.generateAudio,
		kling26NegativePrompt:
			imageState.kling26.negativePrompt.trim() || undefined,
		wan25Duration: imageState.wan25.duration,
		wan25Resolution: imageState.wan25.resolution,
		wan25AudioUrl: imageState.wan25.audioUrl
			? imageState.wan25.audioUrl.trim() || undefined
			: undefined,
		wan25AudioFile: imageState.wan25.audioFile,
		wan25NegativePrompt: imageState.wan25.negativePrompt.trim() || undefined,
		wan25EnablePromptExpansion: imageState.wan25.enablePromptExpansion,
		klingAvatarV2Prompt: avatarState.klingAvatarV2Prompt,
		audioDuration: avatarState.audioDuration,
		syncLipsyncEmotion: avatarState.syncLipsyncEmotion,
		syncLipsyncModelMode: avatarState.syncLipsyncModelMode,
		syncLipsyncSyncMode: avatarState.syncLipsyncLipsyncMode,
		syncLipsyncTemperature: avatarState.syncLipsyncTemperature,
		videoDuration: avatarState.syncLipsyncVideoDuration,
		extendVideoAspectRatio: avatarState.extendVideoAspectRatio,
		extendVideoGenerateAudio: avatarState.extendVideoGenerateAudio,
		bytedanceTargetResolution: upscaleState.bytedance.targetResolution,
		bytedanceTargetFPS: upscaleState.bytedance.targetFPS,
		flashvsrUpscaleFactor: upscaleState.flashvsr.upscaleFactor,
		flashvsrAcceleration: upscaleState.flashvsr.acceleration,
		flashvsrQuality: upscaleState.flashvsr.quality,
		flashvsrColorFix: upscaleState.flashvsr.colorFix,
		flashvsrPreserveAudio: upscaleState.flashvsr.preserveAudio,
		flashvsrOutputFormat: upscaleState.flashvsr.outputFormat,
		flashvsrOutputQuality: upscaleState.flashvsr.outputQuality,
		flashvsrOutputWriteMode: upscaleState.flashvsr.outputWriteMode,
		flashvsrSeed: upscaleState.flashvsr.seed,
		topazUpscaleFactor: upscaleState.topaz.upscaleFactor,
		topazTargetFPS: upscaleState.topaz.targetFPS,
		topazH264Output: upscaleState.topaz.h264Output,
		onProgress: (status) => {
			console.log(
				`[AI View] Progress: ${status.progress ?? 0}% - ${status.message ?? status.status}`
			);
		},
		onError: (err) => {
			console.error("[AI View] Error occurred:", err);
			setError(err);
		},
		onComplete: (videos) => {
			console.log("\n[AI View] GENERATION COMPLETE");
			console.log(`[AI View] Received ${videos.length} videos:`, videos);
			debugLogger.log("AiView", "GENERATION_COMPLETE", {
				videoCount: videos.length,
				models: selectedModels,
			});
		},
	});

	const history = useAIHistory();

	// ============================================
	// UI State
	// ============================================
	const aiPanelWidth = usePanelStore((s) => s.aiPanelWidth);
	const aiPanelMinWidth = usePanelStore((s) => s.aiPanelMinWidth);

	const safeAiPanelWidth = typeof aiPanelWidth === "number" ? aiPanelWidth : 22;
	const safeAiPanelMinWidth =
		typeof aiPanelMinWidth === "number" ? aiPanelMinWidth : 4;
	const isCollapsed = safeAiPanelWidth <= safeAiPanelMinWidth + 2;
	const isCompact = safeAiPanelWidth < 18;

	const toggleModel = (modelId: string) => {
		setSelectedModels((prev) =>
			prev.includes(modelId)
				? prev.filter((id) => id !== modelId)
				: [...prev, modelId]
		);
	};

	const {
		totalCost,
		bytedanceEstimatedCost,
		flashvsrEstimatedCost,
		hasRemixSelected,
	} = useCostCalculation({
		selectedModels,
		reveNumImages,
		generationDuration: generation.duration,
		generationResolution: generation.resolution,
		veo31Duration: generation.veo31Settings.duration,
		veo31GenerateAudio: generation.veo31Settings.generateAudio,
		hailuoT2VDuration: textState.hailuoT2VDuration,
		ltxv2FastDuration: textState.ltxv2FastDuration,
		ltxv2FastResolution: textState.ltxv2FastResolution,
		ltxv2ImageDuration: imageState.ltxv2Image.duration,
		ltxv2ImageResolution: imageState.ltxv2Image.resolution,
		bytedanceTargetResolution: upscaleState.bytedance.targetResolution,
		bytedanceTargetFPS: upscaleState.bytedance.targetFPS,
		flashvsrUpscaleFactor: upscaleState.flashvsr.upscaleFactor,
		videoMetadata: upscaleState.videoMetadata,
	});

	const maxChars = generation.isSora2Selected ? 5000 : 500;

	// Handle media store loading/error states
	if (generation.mediaStoreError) {
		return (
			<div className="flex items-center justify-center h-full p-4">
				<div className="text-center">
					<div className="text-red-500 mb-2">Failed to load media store</div>
					<div className="text-sm text-muted-foreground">
						{generation.mediaStoreError.message}
					</div>
				</div>
			</div>
		);
	}

	if (generation.mediaStoreLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="flex items-center space-x-2">
					<Loader2 className="h-4 w-4 animate-spin" />
					<span>Loading AI features...</span>
				</div>
			</div>
		);
	}

	return (
		<div
			className={`h-full flex flex-col transition-all duration-200 ${isCollapsed ? "p-2" : isCompact ? "p-3" : "p-4"}`}
			data-testid="ai-features-panel"
		>
			{/* Header (hidden in upscale mode) */}
			{!mode && (
				<div
					className={`flex items-center mb-4 ${isCollapsed ? "justify-center" : isCompact ? "flex-col gap-1" : "justify-between"}`}
				>
					<div
						className={`flex items-center ${isCompact && !isCollapsed ? "flex-col" : ""}`}
						style={{ marginLeft: "5px", gap: "7px" }}
					>
						<BotIcon className="size-5 text-primary" />
						{!isCollapsed && (
							<h3
								className={`text-sm font-medium ${isCompact ? "text-center text-xs" : ""}`}
							>
								{isCompact ? "AI" : "AI Video Generation"}
							</h3>
						)}
					</div>
					{history.hasHistory && !isCollapsed && (
						<Button
							type="button"
							size="sm"
							variant="text"
							onClick={history.openHistoryPanel}
							className={`h-8 ${isCompact ? "px-1" : "px-2"}`}
						>
							<History className="size-4 mr-1" />
							{!isCompact && `History (${history.historyCount})`}
							{isCompact && history.historyCount}
						</Button>
					)}
				</div>
			)}

			{/* Collapsed State */}
			{isCollapsed ? (
				<div className="flex-1 flex flex-col items-center justify-center gap-2">
					<BotIcon className="size-8 text-muted-foreground" />
					<div className="text-xs text-muted-foreground text-center">
						AI Video
					</div>
				</div>
			) : (
				<div
					className="flex-1 overflow-y-auto space-y-4"
					data-testid="ai-enhancement-panel"
				>
					{/* Tab Selector */}
					<Tabs
						value={activeTab}
						onValueChange={(value: string) =>
							setActiveTab(value as AIActiveTab)
						}
					>
						{!mode && (
							<TabsList className="grid w-full grid-cols-3">
								<TabsTrigger
									value="text"
									className="text-xs"
									data-testid="ai-tab-text"
								>
									<TypeIcon className="size-3 mr-1" />
									{!isCompact && "Text"}
								</TabsTrigger>
								<TabsTrigger
									value="image"
									className="text-xs"
									data-testid="ai-tab-image"
								>
									<ImageIcon className="size-3 mr-1" />
									{!isCompact && "Image"}
								</TabsTrigger>
								<TabsTrigger
									value="avatar"
									className="text-xs"
									data-testid="ai-tab-avatar"
								>
									<UserIcon className="size-3 mr-1" />
									{!isCompact && "Avatar"}
								</TabsTrigger>
							</TabsList>
						)}

						<AITabsContent
							prompt={prompt}
							setPrompt={setPrompt}
							maxChars={maxChars}
							selectedModels={selectedModels}
							isCompact={isCompact}
							setError={setError}
							textTabState={textTabState}
							imageTabState={imageTabState}
							avatarTabState={avatarTabState}
							upscaleTabState={upscaleTabState}
							anglesTabState={anglesTabState}
							combinedCapabilities={combinedCapabilities}
							generation={generation}
							bytedanceEstimatedCost={bytedanceEstimatedCost}
							flashvsrEstimatedCost={flashvsrEstimatedCost}
						/>
					</Tabs>

					{/* Model Selection Grid */}
					<AIModelSelectionGrid
						activeTab={activeTab}
						selectedModels={selectedModels}
						isCompact={isCompact}
						onToggleModel={toggleModel}
					/>

					{/* Model Settings */}
					<AIModelSettingsPanel
						activeTab={activeTab}
						selectedModels={selectedModels}
						generation={generation}
						prompt={prompt}
						setPrompt={setPrompt}
						setError={setError}
						reveAspectRatio={reveAspectRatio}
						setReveAspectRatio={setReveAspectRatio}
						reveNumImages={reveNumImages}
						setReveNumImages={setReveNumImages}
						reveOutputFormat={reveOutputFormat}
						setReveOutputFormat={setReveOutputFormat}
					/>

					{/* Actions: cost, feedback, validation, generate */}
					<AIActionsSection
						activeTab={activeTab}
						selectedModels={selectedModels}
						prompt={prompt}
						selectedImage={selectedImage}
						error={error}
						generation={generation}
						firstFrame={imageState.firstFrame}
						lastFrame={imageState.lastFrame}
						avatarImage={avatarState.avatarImage}
						syncLipsyncSourceVideo={avatarState.syncLipsyncSourceVideo}
						audioFile={avatarState.audioFile}
						totalCost={totalCost}
						hasRemixSelected={hasRemixSelected}
					/>
				</div>
			)}

			{/* History Panel */}
			<AIHistoryPanel
				isOpen={history.isHistoryPanelOpen}
				onClose={history.closeHistoryPanel}
				generationHistory={history.generationHistory}
				onSelectVideo={(video) => {
					generation.setGeneratedVideo(video);
					history.closeHistoryPanel();
				}}
				onRemoveFromHistory={history.removeFromHistory}
				aiModels={AI_MODELS}
			/>
		</div>
	);
}
