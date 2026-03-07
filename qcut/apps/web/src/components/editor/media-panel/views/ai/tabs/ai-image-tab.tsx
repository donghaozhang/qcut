/**
 * Image Tab UI Component
 *
 * Renders the Image-to-Video tab UI including:
 * - Frame upload grid section
 * - Motion prompt section
 * - Model-specific settings (Vidu Q2, LTX I2V, Seedance, Kling, WAN 2.5)
 *
 * @see ai-tsx-refactoring.md - Subtask 3.4
 */

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { AIImageUploadSection } from "../components/ai-image-upload";
import { AiKlingV25Settings } from "../components/ai-kling-v25-settings";
import { AiKlingV26Settings } from "../components/ai-kling-v26-settings";
import { AiLtxFastI2VSettings } from "../components/ai-ltx-fast-i2v-settings";
import { AiLtxI2VSettings } from "../components/ai-ltx-i2v-settings";
import {
	AiLtx23Settings,
	type LTX23Duration,
	type LTX23Resolution,
	type LTX23FPS,
} from "../components/ai-ltx23-settings";
import { AiSeedanceSettings } from "../components/ai-seedance-settings";
import { AiViduQ2Settings } from "../components/ai-vidu-q2-settings";
import { AiWan25Settings } from "../components/ai-wan25-settings";
import {
	type LTXV2FastDuration,
	type LTXV2FastResolution,
	type LTXV2FastFps,
	type SeedanceDuration,
	type SeedanceResolution,
	type SeedanceAspectRatio,
	type KlingAspectRatio,
	type Kling26AspectRatio,
	type Wan25Duration,
	type Wan25Resolution,
} from "../constants/ai-model-options";

// ============================================
// Types
// ============================================

export interface AIImageTabProps {
	/** Current prompt value */
	prompt: string;
	/** Callback when prompt changes */
	onPromptChange: (value: string) => void;
	/** Maximum character limit for prompt */
	maxChars: number;
	/** Selected AI models */
	selectedModels: string[];
	/** Whether compact mode is active */
	isCompact: boolean;
	/** Callback for errors */
	onError: (error: string | null) => void;

	// Frame uploads
	firstFrame: File | null;
	firstFramePreview: string | null;
	lastFrame: File | null;
	lastFramePreview: string | null;
	imageTabSourceVideo: File | null;
	onFirstFrameChange: (file: File | null, preview: string | null) => void;
	onLastFrameChange: (file: File | null, preview: string | null) => void;
	onSourceVideoChange: (file: File | null) => void;

	// Vidu Q2 settings
	viduQ2Duration: 2 | 3 | 4 | 5 | 6 | 7 | 8;
	onViduQ2DurationChange: (value: 2 | 3 | 4 | 5 | 6 | 7 | 8) => void;
	viduQ2Resolution: "720p" | "1080p";
	onViduQ2ResolutionChange: (value: "720p" | "1080p") => void;
	viduQ2MovementAmplitude: "auto" | "small" | "medium" | "large";
	onViduQ2MovementAmplitudeChange: (
		value: "auto" | "small" | "medium" | "large"
	) => void;
	viduQ2EnableBGM: boolean;
	onViduQ2EnableBGMChange: (value: boolean) => void;

	// LTX I2V settings
	ltxv2I2VDuration: 6 | 8 | 10;
	onLTXV2I2VDurationChange: (value: 6 | 8 | 10) => void;
	ltxv2I2VResolution: "1080p" | "1440p" | "2160p";
	onLTXV2I2VResolutionChange: (value: "1080p" | "1440p" | "2160p") => void;
	ltxv2I2VFPS: 25 | 50;
	onLTXV2I2VFPSChange: (value: 25 | 50) => void;
	ltxv2I2VGenerateAudio: boolean;
	onLTXV2I2VGenerateAudioChange: (value: boolean) => void;

	// LTX 2.3 Fast I2V settings
	ltx23I2VDuration: LTX23Duration;
	onLTX23I2VDurationChange: (value: LTX23Duration) => void;
	ltx23I2VResolution: LTX23Resolution;
	onLTX23I2VResolutionChange: (value: LTX23Resolution) => void;
	ltx23I2VFPS: LTX23FPS;
	onLTX23I2VFPSChange: (value: LTX23FPS) => void;
	ltx23I2VGenerateAudio: boolean;
	onLTX23I2VGenerateAudioChange: (value: boolean) => void;
	ltx23I2VAspectRatio: string;
	onLTX23I2VAspectRatioChange: (value: string) => void;

	// LTX Image settings (Fast I2V)
	ltxv2ImageDuration: LTXV2FastDuration;
	onLTXV2ImageDurationChange: (value: LTXV2FastDuration) => void;
	ltxv2ImageResolution: LTXV2FastResolution;
	onLTXV2ImageResolutionChange: (value: LTXV2FastResolution) => void;
	ltxv2ImageFPS: LTXV2FastFps;
	onLTXV2ImageFPSChange: (value: LTXV2FastFps) => void;
	ltxv2ImageGenerateAudio: boolean;
	onLTXV2ImageGenerateAudioChange: (value: boolean) => void;

	// Seedance settings
	seedanceDuration: SeedanceDuration;
	onSeedanceDurationChange: (value: SeedanceDuration) => void;
	seedanceResolution: SeedanceResolution;
	onSeedanceResolutionChange: (value: SeedanceResolution) => void;
	seedanceAspectRatio: SeedanceAspectRatio;
	onSeedanceAspectRatioChange: (value: SeedanceAspectRatio) => void;
	seedanceCameraFixed: boolean;
	onSeedanceCameraFixedChange: (value: boolean) => void;
	seedanceEndFrameUrl: string | undefined;
	onSeedanceEndFrameUrlChange: (value: string | undefined) => void;
	seedanceEndFrameFile: File | null;
	seedanceEndFramePreview: string | null;
	onSeedanceEndFrameFileChange: (
		file: File | null,
		preview: string | null
	) => void;

	// Kling v2.5 settings
	klingDuration: 5 | 10;
	onKlingDurationChange: (value: 5 | 10) => void;
	klingCfgScale: number;
	onKlingCfgScaleChange: (value: number) => void;
	klingAspectRatio: KlingAspectRatio;
	onKlingAspectRatioChange: (value: KlingAspectRatio) => void;
	klingEnhancePrompt: boolean;
	onKlingEnhancePromptChange: (value: boolean) => void;
	klingNegativePrompt: string;
	onKlingNegativePromptChange: (value: string) => void;

	// Kling v2.6 settings
	kling26Duration: 5 | 10;
	onKling26DurationChange: (value: 5 | 10) => void;
	kling26CfgScale: number;
	onKling26CfgScaleChange: (value: number) => void;
	kling26AspectRatio: Kling26AspectRatio;
	onKling26AspectRatioChange: (value: Kling26AspectRatio) => void;
	kling26GenerateAudio: boolean;
	onKling26GenerateAudioChange: (value: boolean) => void;
	kling26NegativePrompt: string;
	onKling26NegativePromptChange: (value: string) => void;

	// WAN 2.5 settings
	wan25Duration: Wan25Duration;
	onWan25DurationChange: (value: Wan25Duration) => void;
	wan25Resolution: Wan25Resolution;
	onWan25ResolutionChange: (value: Wan25Resolution) => void;
	wan25EnablePromptExpansion: boolean;
	onWan25EnablePromptExpansionChange: (value: boolean) => void;
	wan25NegativePrompt: string;
	onWan25NegativePromptChange: (value: string) => void;
	wan25AudioUrl: string | undefined;
	onWan25AudioUrlChange: (value: string | undefined) => void;
	wan25AudioFile: File | null;
	wan25AudioPreview: string | null;
	onWan25AudioFileChange: (file: File | null, preview: string | null) => void;

	// Advanced options
	imageSeed: number | undefined;
	onImageSeedChange: (value: number | undefined) => void;

	// Generation hook (for frame sync)
	generation?: {
		setFirstFrame?: (file: File | null) => void;
		setLastFrame?: (file: File | null) => void;
	};
}

// ============================================
// Component
// ============================================

/**
 * Image tab component for AI image-to-video generation.
 */
export function AIImageTab({
	prompt,
	onPromptChange,
	maxChars,
	selectedModels,
	isCompact,
	onError,
	firstFrame,
	firstFramePreview,
	lastFrame,
	lastFramePreview,
	imageTabSourceVideo,
	onFirstFrameChange,
	onLastFrameChange,
	onSourceVideoChange,
	viduQ2Duration,
	onViduQ2DurationChange,
	viduQ2Resolution,
	onViduQ2ResolutionChange,
	viduQ2MovementAmplitude,
	onViduQ2MovementAmplitudeChange,
	viduQ2EnableBGM,
	onViduQ2EnableBGMChange,
	ltxv2I2VDuration,
	onLTXV2I2VDurationChange,
	ltxv2I2VResolution,
	onLTXV2I2VResolutionChange,
	ltxv2I2VFPS,
	onLTXV2I2VFPSChange,
	ltxv2I2VGenerateAudio,
	onLTXV2I2VGenerateAudioChange,
	ltx23I2VDuration,
	onLTX23I2VDurationChange,
	ltx23I2VResolution,
	onLTX23I2VResolutionChange,
	ltx23I2VFPS,
	onLTX23I2VFPSChange,
	ltx23I2VGenerateAudio,
	onLTX23I2VGenerateAudioChange,
	ltx23I2VAspectRatio,
	onLTX23I2VAspectRatioChange,
	ltxv2ImageDuration,
	onLTXV2ImageDurationChange,
	ltxv2ImageResolution,
	onLTXV2ImageResolutionChange,
	ltxv2ImageFPS,
	onLTXV2ImageFPSChange,
	ltxv2ImageGenerateAudio,
	onLTXV2ImageGenerateAudioChange,
	seedanceDuration,
	onSeedanceDurationChange,
	seedanceResolution,
	onSeedanceResolutionChange,
	seedanceAspectRatio,
	onSeedanceAspectRatioChange,
	seedanceCameraFixed,
	onSeedanceCameraFixedChange,
	seedanceEndFrameUrl,
	onSeedanceEndFrameUrlChange,
	seedanceEndFrameFile,
	seedanceEndFramePreview,
	onSeedanceEndFrameFileChange,
	klingDuration,
	onKlingDurationChange,
	klingCfgScale,
	onKlingCfgScaleChange,
	klingAspectRatio,
	onKlingAspectRatioChange,
	klingEnhancePrompt,
	onKlingEnhancePromptChange,
	klingNegativePrompt,
	onKlingNegativePromptChange,
	kling26Duration,
	onKling26DurationChange,
	kling26CfgScale,
	onKling26CfgScaleChange,
	kling26AspectRatio,
	onKling26AspectRatioChange,
	kling26GenerateAudio,
	onKling26GenerateAudioChange,
	kling26NegativePrompt,
	onKling26NegativePromptChange,
	wan25Duration,
	onWan25DurationChange,
	wan25Resolution,
	onWan25ResolutionChange,
	wan25EnablePromptExpansion,
	onWan25EnablePromptExpansionChange,
	wan25NegativePrompt,
	onWan25NegativePromptChange,
	wan25AudioUrl,
	onWan25AudioUrlChange,
	wan25AudioFile,
	wan25AudioPreview,
	onWan25AudioFileChange,
	imageSeed,
	onImageSeedChange,
	generation,
}: AIImageTabProps) {
	// Model selection helpers
	const viduQ2Selected = selectedModels.includes("vidu_q2_turbo_i2v");
	const ltxv2I2VSelected = selectedModels.includes("ltxv2_i2v");
	const ltxv2ImageSelected = selectedModels.includes("ltxv2_fast_i2v");
	const ltxv2FastTextSelected = selectedModels.includes("ltxv2_fast_t2v");
	const seedanceFastSelected = selectedModels.includes("seedance_pro_fast_i2v");
	const seedanceProSelected = selectedModels.includes("seedance_pro_i2v");
	const seedanceSelected = seedanceFastSelected || seedanceProSelected;
	const klingI2VSelected = selectedModels.includes("kling_v2_5_turbo_i2v");
	const kling26I2VSelected = selectedModels.includes("kling_v26_pro_i2v");
	const wan25Selected = selectedModels.includes("wan_25_preview_i2v");

	return (
		<div className="space-y-4">
			{/* Image upload - supports both I2V and F2V modes */}
			<AIImageUploadSection
				selectedModels={selectedModels}
				firstFrame={firstFrame}
				firstFramePreview={firstFramePreview}
				lastFrame={lastFrame}
				lastFramePreview={lastFramePreview}
				sourceVideo={imageTabSourceVideo}
				onFirstFrameChange={(file, preview) => {
					onFirstFrameChange(file, preview || null);
					if (generation?.setFirstFrame) {
						generation.setFirstFrame(file);
					}
				}}
				onLastFrameChange={(file, preview) => {
					onLastFrameChange(file, preview || null);
					if (generation?.setLastFrame) {
						generation.setLastFrame(file);
					}
				}}
				onSourceVideoChange={(file) => {
					onSourceVideoChange(file);
					if (file) onError(null);
				}}
				onError={onError}
				isCompact={isCompact}
			/>

			{/* Prompt for image-to-video */}
			<div className="space-y-2">
				<Label htmlFor="image-prompt" className="text-xs">
					{!isCompact && "Additional "}Prompt
					{!isCompact && " (optional)"}
				</Label>
				<Textarea
					id="image-prompt"
					placeholder={
						isCompact
							? "Describe motion..."
							: "Describe how the image should move..."
					}
					value={prompt}
					onChange={(e) => onPromptChange(e.target.value)}
					className="min-h-[40px] text-xs resize-none"
					maxLength={maxChars}
				/>
			</div>

			{/* Vidu Q2 Settings */}
			{viduQ2Selected && (
				<AiViduQ2Settings
					duration={viduQ2Duration}
					onDurationChange={onViduQ2DurationChange}
					resolution={viduQ2Resolution}
					onResolutionChange={onViduQ2ResolutionChange}
					movementAmplitude={viduQ2MovementAmplitude}
					onMovementAmplitudeChange={onViduQ2MovementAmplitudeChange}
					bgm={viduQ2EnableBGM}
					onBgmChange={onViduQ2EnableBGMChange}
					isCompact={isCompact}
				/>
			)}

			{/* LTX I2V Settings */}
			{ltxv2I2VSelected && (
				<AiLtxI2VSettings
					duration={ltxv2I2VDuration}
					onDurationChange={onLTXV2I2VDurationChange}
					resolution={ltxv2I2VResolution}
					onResolutionChange={onLTXV2I2VResolutionChange}
					fps={ltxv2I2VFPS}
					onFpsChange={onLTXV2I2VFPSChange}
					generateAudio={ltxv2I2VGenerateAudio}
					onGenerateAudioChange={onLTXV2I2VGenerateAudioChange}
					isCompact={isCompact}
				/>
			)}

			{/* LTX Fast I2V Settings */}
			{ltxv2ImageSelected && (
				<AiLtxFastI2VSettings
					duration={ltxv2ImageDuration}
					onDurationChange={onLTXV2ImageDurationChange}
					resolution={ltxv2ImageResolution}
					onResolutionChange={onLTXV2ImageResolutionChange}
					fps={ltxv2ImageFPS}
					onFpsChange={onLTXV2ImageFPSChange}
					generateAudio={ltxv2ImageGenerateAudio}
					onGenerateAudioChange={onLTXV2ImageGenerateAudioChange}
					isCompact={isCompact}
				/>
			)}

			{/* LTX Fast T2V Settings (shown in Image tab when selected) */}
			{ltxv2FastTextSelected && (
				<div className="space-y-3 text-left border-t pt-3">
					<Label className="text-sm font-semibold">
						LTX Video 2.0 Fast Settings
					</Label>
					<div className="text-xs text-muted-foreground">
						Configure LTX Fast settings in the Text tab.
					</div>
				</div>
			)}

			{/* Seedance Settings */}
			{seedanceSelected && (
				<AiSeedanceSettings
					duration={seedanceDuration}
					onDurationChange={onSeedanceDurationChange}
					resolution={seedanceResolution}
					onResolutionChange={onSeedanceResolutionChange}
					aspectRatio={seedanceAspectRatio}
					onAspectRatioChange={onSeedanceAspectRatioChange}
					cameraFixed={seedanceCameraFixed}
					onCameraFixedChange={onSeedanceCameraFixedChange}
					endFrameUrl={seedanceEndFrameUrl}
					onEndFrameUrlChange={onSeedanceEndFrameUrlChange}
					endFrameFile={seedanceEndFrameFile}
					endFramePreview={seedanceEndFramePreview}
					onEndFrameFileChange={onSeedanceEndFrameFileChange}
					isProSelected={seedanceProSelected}
					isCompact={isCompact}
					onError={onError}
				/>
			)}

			{/* Kling v2.5 Settings */}
			{klingI2VSelected && (
				<AiKlingV25Settings
					duration={klingDuration}
					onDurationChange={onKlingDurationChange}
					aspectRatio={klingAspectRatio}
					onAspectRatioChange={onKlingAspectRatioChange}
					cfgScale={klingCfgScale}
					onCfgScaleChange={onKlingCfgScaleChange}
					enhancePrompt={klingEnhancePrompt}
					onEnhancePromptChange={onKlingEnhancePromptChange}
					negativePrompt={klingNegativePrompt}
					onNegativePromptChange={onKlingNegativePromptChange}
					isCompact={isCompact}
				/>
			)}

			{/* Kling v2.6 Settings */}
			{kling26I2VSelected && (
				<AiKlingV26Settings
					duration={kling26Duration}
					onDurationChange={onKling26DurationChange}
					aspectRatio={kling26AspectRatio}
					onAspectRatioChange={onKling26AspectRatioChange}
					cfgScale={kling26CfgScale}
					onCfgScaleChange={onKling26CfgScaleChange}
					generateAudio={kling26GenerateAudio}
					onGenerateAudioChange={onKling26GenerateAudioChange}
					negativePrompt={kling26NegativePrompt}
					onNegativePromptChange={onKling26NegativePromptChange}
					isCompact={isCompact}
				/>
			)}

			{/* WAN 2.5 Settings */}
			{wan25Selected && (
				<AiWan25Settings
					duration={wan25Duration}
					onDurationChange={onWan25DurationChange}
					resolution={wan25Resolution}
					onResolutionChange={onWan25ResolutionChange}
					enablePromptExpansion={wan25EnablePromptExpansion}
					onEnablePromptExpansionChange={onWan25EnablePromptExpansionChange}
					negativePrompt={wan25NegativePrompt}
					onNegativePromptChange={onWan25NegativePromptChange}
					audioUrl={wan25AudioUrl}
					onAudioUrlChange={onWan25AudioUrlChange}
					audioFile={wan25AudioFile}
					audioPreview={wan25AudioPreview}
					onAudioFileChange={onWan25AudioFileChange}
					isCompact={isCompact}
					onError={onError}
				/>
			)}

			{/* Advanced Options (Seed) */}
			{(seedanceSelected || wan25Selected) && (
				<div className="space-y-2 text-left border-t pt-3">
					<Label className="text-sm font-semibold">Advanced Options</Label>
					<div className="space-y-1">
						<Label htmlFor="image-seed" className="text-xs">
							Seed (optional)
						</Label>
						<Input
							id="image-seed"
							type="number"
							value={imageSeed ?? ""}
							onChange={(event) => {
								const nextValue = event.target.value.trim();
								if (!nextValue) {
									onImageSeedChange(undefined);
									return;
								}
								const parsed = Number(nextValue);
								if (!Number.isNaN(parsed)) {
									onImageSeedChange(parsed);
								}
							}}
							placeholder="Enter seed for reproducible animation"
							className="h-8 text-xs"
						/>
						<div className="text-xs text-muted-foreground">
							Use the same seed to reproduce motion across runs.
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
