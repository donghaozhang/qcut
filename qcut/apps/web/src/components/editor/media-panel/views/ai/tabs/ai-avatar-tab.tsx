/**
 * Avatar Tab UI Component
 *
 * Renders the Avatar tab UI including:
 * - First/Last frame uploads
 * - Reference images grid (6 slots)
 * - Audio input upload
 * - Source video upload
 * - Optional prompt
 * - Kling Avatar v2 specific options
 *
 * @see ai-tsx-refactoring.md - Subtask 3.5
 */

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/ui/file-upload";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, ChevronDown, ChevronUp } from "lucide-react";

import { UPLOAD_CONSTANTS, AVATAR_MODELS } from "../constants/ai-constants";
import { AIPromptCharCounter } from "../components/ai-prompt-char-counter";
import { calculateKlingAvatarV2Cost } from "../utils/ai-cost-calculators";
import type {
	SyncLipsyncEmotion,
	SyncLipsyncModelMode,
	SyncLipsyncSyncMode,
} from "../types/ai-types";

// ============================================
// Types
// ============================================

export interface AIAvatarTabProps {
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

	// Avatar image
	avatarImage: File | null;
	avatarImagePreview: string | null;
	onAvatarImageChange: (file: File | null, preview: string | null) => void;

	// Last frame
	avatarLastFrame: File | null;
	avatarLastFramePreview: string | null;
	onAvatarLastFrameChange: (file: File | null, preview: string | null) => void;

	// Reference images
	referenceImages: (File | null)[];
	referenceImagePreviews: (string | null)[];
	onReferenceImageChange: (
		index: number,
		file: File | null,
		preview: string | null
	) => void;

	// Audio
	audioFile: File | null;
	onAudioFileChange: (file: File | null) => void;

	// Source video
	sourceVideo: File | null;
	onSourceVideoChange: (file: File | null) => void;

	// Kling Avatar v2
	klingAvatarV2Prompt: string;
	onKlingAvatarV2PromptChange: (value: string) => void;
	audioDuration: number | null;

	// Sync Lipsync React-1
	syncLipsyncSourceVideo: File | null;
	syncLipsyncSourceVideoPreview: string | null;
	syncLipsyncVideoDuration: number | null;
	syncLipsyncEmotion: SyncLipsyncEmotion;
	syncLipsyncModelMode: SyncLipsyncModelMode;
	syncLipsyncLipsyncMode: SyncLipsyncSyncMode;
	syncLipsyncTemperature: number;
	onSyncLipsyncSourceVideoChange: (file: File | null) => void;
	onSyncLipsyncEmotionChange: (emotion: SyncLipsyncEmotion) => void;
	onSyncLipsyncModelModeChange: (mode: SyncLipsyncModelMode) => void;
	onSyncLipsyncLipsyncModeChange: (mode: SyncLipsyncSyncMode) => void;
	onSyncLipsyncTemperatureChange: (temp: number) => void;

	// Veo 3.1 Extend-Video
	extendVideoAspectRatio: "auto" | "16:9" | "9:16";
	onExtendVideoAspectRatioChange: (value: "auto" | "16:9" | "9:16") => void;
	extendVideoGenerateAudio: boolean;
	onExtendVideoGenerateAudioChange: (value: boolean) => void;
}

// ============================================
// Component
// ============================================

/**
 * Avatar tab component for AI avatar generation.
 *
 * @example
 * ```tsx
 * <AIAvatarTab
 *   prompt={prompt}
 *   onPromptChange={setPrompt}
 *   maxChars={maxChars}
 *   selectedModels={selectedModels}
 *   isCompact={isCompact}
 *   onError={setError}
 *   avatarImage={avatarImage}
 *   avatarImagePreview={avatarImagePreview}
 *   onAvatarImageChange={(file, preview) => { ... }}
 *   // ... other props
 * />
 * ```
 */
export function AIAvatarTab({
	prompt,
	onPromptChange,
	maxChars,
	selectedModels,
	isCompact,
	onError,
	avatarImage,
	avatarImagePreview,
	onAvatarImageChange,
	avatarLastFrame,
	avatarLastFramePreview,
	onAvatarLastFrameChange,
	referenceImages,
	referenceImagePreviews,
	onReferenceImageChange,
	audioFile,
	onAudioFileChange,
	sourceVideo,
	onSourceVideoChange,
	klingAvatarV2Prompt,
	onKlingAvatarV2PromptChange,
	audioDuration,
	// Sync Lipsync React-1 props
	syncLipsyncSourceVideo,
	syncLipsyncSourceVideoPreview,
	syncLipsyncVideoDuration,
	syncLipsyncEmotion,
	syncLipsyncModelMode,
	syncLipsyncLipsyncMode,
	syncLipsyncTemperature,
	onSyncLipsyncSourceVideoChange,
	onSyncLipsyncEmotionChange,
	onSyncLipsyncModelModeChange,
	onSyncLipsyncLipsyncModeChange,
	onSyncLipsyncTemperatureChange,
	// Veo 3.1 Extend-Video props
	extendVideoAspectRatio,
	onExtendVideoAspectRatioChange,
	extendVideoGenerateAudio,
	onExtendVideoGenerateAudioChange,
}: AIAvatarTabProps) {
	// Collapsible state for additional settings
	const [isAdditionalSettingsOpen, setIsAdditionalSettingsOpen] =
		useState(false);

	// Model selection helpers
	const klingAvatarV2Selected =
		selectedModels.includes("kling_avatar_v2_standard") ||
		selectedModels.includes("kling_avatar_v2_pro");

	const syncLipsyncReact1Selected = selectedModels.includes(
		"sync_lipsync_react1"
	);

	const extendVideoSelected = selectedModels.some((m) =>
		m.includes("extend_video")
	);

	// Determine which upload fields to show based on selected model's requirements
	const selectedModelId = selectedModels[0]; // Get first selected model
	const selectedModel =
		selectedModelId && selectedModelId in AVATAR_MODELS
			? AVATAR_MODELS[selectedModelId as keyof typeof AVATAR_MODELS]
			: null;
	const requiredInputs: readonly string[] = selectedModel?.requiredInputs || [];

	// Check what inputs are required
	const needsCharacterImage = requiredInputs.includes("characterImage");
	const needsLastFrame = requiredInputs.includes("lastFrame");
	const needsAudioFile = requiredInputs.includes("audioFile");
	const needsSourceVideo = requiredInputs.includes("sourceVideo");
	const needsReferenceImages = requiredInputs.includes("referenceImages");

	return (
		<div className="space-y-4">
			{/* First Frame / Last Frame - Side by side */}
			{(needsCharacterImage || needsLastFrame) && (
				<div className="grid grid-cols-2 gap-2">
					{needsCharacterImage && (
						<FileUpload
							id="avatar-first-frame-input"
							label="First Frame"
							helperText=""
							fileType="image"
							acceptedTypes={UPLOAD_CONSTANTS.ALLOWED_AVATAR_IMAGE_TYPES}
							maxSizeBytes={UPLOAD_CONSTANTS.MAX_IMAGE_SIZE_BYTES}
							maxSizeLabel={UPLOAD_CONSTANTS.MAX_IMAGE_SIZE_LABEL}
							formatsLabel={UPLOAD_CONSTANTS.AVATAR_IMAGE_FORMATS_LABEL}
							file={avatarImage}
							preview={avatarImagePreview}
							onFileChange={(file, preview) => {
								onAvatarImageChange(file, preview || null);
								if (file) onError(null);
							}}
							onError={onError}
							isCompact={true}
						/>
					)}
					{needsLastFrame && (
						<FileUpload
							id="avatar-last-frame-input"
							label="Last Frame"
							helperText=""
							fileType="image"
							acceptedTypes={UPLOAD_CONSTANTS.ALLOWED_AVATAR_IMAGE_TYPES}
							maxSizeBytes={UPLOAD_CONSTANTS.MAX_IMAGE_SIZE_BYTES}
							maxSizeLabel={UPLOAD_CONSTANTS.MAX_IMAGE_SIZE_LABEL}
							formatsLabel={UPLOAD_CONSTANTS.AVATAR_IMAGE_FORMATS_LABEL}
							file={avatarLastFrame}
							preview={avatarLastFramePreview}
							onFileChange={(file, preview) => {
								onAvatarLastFrameChange(file, preview || null);
								if (file) onError(null);
							}}
							onError={onError}
							isCompact={true}
						/>
					)}
				</div>
			)}

			{/* Reference Images - 6 slots in 3x2 grid */}
			{needsReferenceImages && (
				<div className="space-y-2">
					<Label className="text-xs">Reference Images</Label>
					<div className="grid grid-cols-3 gap-2">
						{[0, 1, 2, 3, 4, 5].map((index) => (
							<FileUpload
								key={`reference-${index}`}
								id={`avatar-reference-${index}-input`}
								label={`Ref ${index + 1}`}
								helperText=""
								fileType="image"
								acceptedTypes={UPLOAD_CONSTANTS.ALLOWED_AVATAR_IMAGE_TYPES}
								maxSizeBytes={UPLOAD_CONSTANTS.MAX_IMAGE_SIZE_BYTES}
								maxSizeLabel={UPLOAD_CONSTANTS.MAX_IMAGE_SIZE_LABEL}
								formatsLabel={UPLOAD_CONSTANTS.AVATAR_IMAGE_FORMATS_LABEL}
								file={referenceImages[index]}
								preview={referenceImagePreviews[index]}
								onFileChange={(file, preview) => {
									onReferenceImageChange(index, file, preview || null);
									if (file) onError(null);
								}}
								onError={onError}
								isCompact={true}
							/>
						))}
					</div>
				</div>
			)}

			{/* Audio Input */}
			{needsAudioFile && (
				<FileUpload
					id="avatar-audio-input"
					label="Audio Input"
					helperText=""
					fileType="audio"
					acceptedTypes={UPLOAD_CONSTANTS.ALLOWED_AUDIO_TYPES}
					maxSizeBytes={UPLOAD_CONSTANTS.MAX_AUDIO_SIZE_BYTES}
					maxSizeLabel={UPLOAD_CONSTANTS.MAX_AUDIO_SIZE_LABEL}
					formatsLabel={UPLOAD_CONSTANTS.AUDIO_FORMATS_LABEL}
					file={audioFile}
					onFileChange={(file) => {
						onAudioFileChange(file);
						if (file) onError(null);
					}}
					onError={onError}
					isCompact={isCompact}
				/>
			)}

			{/* Source Video Upload */}
			{needsSourceVideo && (
				<FileUpload
					id="avatar-video-input"
					label="Source Video"
					helperText=""
					fileType="video"
					acceptedTypes={UPLOAD_CONSTANTS.ALLOWED_VIDEO_TYPES}
					maxSizeBytes={UPLOAD_CONSTANTS.MAX_VIDEO_SIZE_BYTES}
					maxSizeLabel={UPLOAD_CONSTANTS.MAX_VIDEO_SIZE_LABEL}
					formatsLabel={UPLOAD_CONSTANTS.VIDEO_FORMATS_LABEL}
					file={sourceVideo}
					onFileChange={(file) => {
						onSourceVideoChange(file);
						if (file) onError(null);
					}}
					onError={onError}
					isCompact={isCompact}
				/>
			)}

			{/* Optional Prompt for Avatar */}
			<div className="space-y-2">
				<Label htmlFor="avatar-prompt" className="text-xs">
					{!isCompact && "Additional "}Prompt {!isCompact && "(optional)"}
				</Label>
				<Textarea
					id="avatar-prompt"
					placeholder={
						isCompact
							? "Describe the avatar style..."
							: "Describe the desired avatar style or motion..."
					}
					value={prompt}
					onChange={(e) => onPromptChange(e.target.value)}
					className="min-h-[40px] text-xs resize-none"
				/>
				<AIPromptCharCounter length={prompt.length} maxChars={maxChars} />
			</div>

			{/* Kling Avatar v2 Options */}
			{klingAvatarV2Selected && (
				<div className="space-y-3 text-left border-t pt-3">
					<Label className="text-sm font-semibold">
						Kling Avatar v2 Options
					</Label>
					<div className="space-y-2">
						<Label
							htmlFor="kling-avatar-v2-prompt"
							className="text-xs text-muted-foreground"
						>
							Animation Prompt (Optional)
						</Label>
						<Textarea
							id="kling-avatar-v2-prompt"
							placeholder="Describe animation style, expressions, or movements..."
							value={klingAvatarV2Prompt}
							onChange={(e) => onKlingAvatarV2PromptChange(e.target.value)}
							className="min-h-[60px] text-xs resize-none"
						/>
						<p className="text-xs text-muted-foreground">
							Optional guidance for facial expressions and animation style
						</p>
					</div>
					{audioDuration !== null && (
						<div className="text-xs text-muted-foreground">
							Audio duration: {audioDuration.toFixed(1)}s · Estimated cost: $
							{calculateKlingAvatarV2Cost(
								audioDuration,
								selectedModels.includes("kling_avatar_v2_pro")
									? "pro"
									: "standard"
							).toFixed(2)}
						</div>
					)}
					{audioDuration === null && audioFile && (
						<div className="text-xs text-muted-foreground">
							Cost varies by audio length
						</div>
					)}
				</div>
			)}

			{/* Sync Lipsync React-1 Options */}
			{syncLipsyncReact1Selected && (
				<div className="space-y-3 text-left border-t pt-3">
					<Label className="text-sm font-semibold">
						Sync Lipsync React-1 Options
					</Label>

					{/* Source Video Upload */}
					<FileUpload
						id="sync-lipsync-video-input"
						label="Source Video"
						helperText="Max 15 seconds"
						fileType="video"
						acceptedTypes={UPLOAD_CONSTANTS.ALLOWED_VIDEO_TYPES}
						maxSizeBytes={UPLOAD_CONSTANTS.MAX_VIDEO_SIZE_BYTES}
						maxSizeLabel={UPLOAD_CONSTANTS.MAX_VIDEO_SIZE_LABEL}
						formatsLabel={UPLOAD_CONSTANTS.VIDEO_FORMATS_LABEL}
						file={syncLipsyncSourceVideo}
						preview={syncLipsyncSourceVideoPreview}
						onFileChange={(file) => {
							onSyncLipsyncSourceVideoChange(file);
							if (file) onError(null);
						}}
						onError={onError}
						isCompact={isCompact}
					/>

					{/* Duration warning */}
					{syncLipsyncVideoDuration !== null &&
						syncLipsyncVideoDuration > 15 && (
							<div className="text-xs text-destructive">
								Video is {syncLipsyncVideoDuration.toFixed(1)}s - must be 15s or
								shorter
							</div>
						)}

					{/* Emotion (required) */}
					<div className="space-y-2">
						<div className="flex items-center gap-1">
							<Label htmlFor="sync-lipsync-emotion" className="text-xs">
								Emotion<span className="text-destructive">*</span>
							</Label>
							<Tooltip>
								<TooltipTrigger asChild>
									<Info className="h-3 w-3 text-muted-foreground cursor-help" />
								</TooltipTrigger>
								<TooltipContent side="right" className="max-w-[200px]">
									Controls the emotional expression applied during lip-sync
								</TooltipContent>
							</Tooltip>
						</div>
						<Select
							value={syncLipsyncEmotion}
							onValueChange={(value) =>
								onSyncLipsyncEmotionChange(value as SyncLipsyncEmotion)
							}
						>
							<SelectTrigger id="sync-lipsync-emotion" className="h-8 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="neutral">neutral</SelectItem>
								<SelectItem value="happy">happy</SelectItem>
								<SelectItem value="sad">sad</SelectItem>
								<SelectItem value="angry">angry</SelectItem>
								<SelectItem value="disgusted">disgusted</SelectItem>
								<SelectItem value="surprised">surprised</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Additional Settings (collapsible) */}
					<Collapsible
						open={isAdditionalSettingsOpen}
						onOpenChange={setIsAdditionalSettingsOpen}
					>
						<CollapsibleTrigger className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
							<span>Additional Settings</span>
							{isAdditionalSettingsOpen ? (
								<ChevronUp className="h-4 w-4" />
							) : (
								<ChevronDown className="h-4 w-4" />
							)}
						</CollapsibleTrigger>
						<CollapsibleContent className="space-y-3 pt-2">
							{/* Model Mode */}
							<div className="space-y-2">
								<div className="flex items-center gap-1">
									<Label htmlFor="sync-lipsync-model-mode" className="text-xs">
										Model Mode
									</Label>
									<Tooltip>
										<TooltipTrigger asChild>
											<Info className="h-3 w-3 text-muted-foreground cursor-help" />
										</TooltipTrigger>
										<TooltipContent side="right" className="max-w-[200px]">
											Controls which region is modified during generation
										</TooltipContent>
									</Tooltip>
								</div>
								<Select
									value={syncLipsyncModelMode}
									onValueChange={(value) =>
										onSyncLipsyncModelModeChange(value as SyncLipsyncModelMode)
									}
								>
									<SelectTrigger
										id="sync-lipsync-model-mode"
										className="h-8 text-xs"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="face">
											face - Full face modification
										</SelectItem>
										<SelectItem value="lips">lips - Lip region only</SelectItem>
										<SelectItem value="head">
											head - Include head movement
										</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Lipsync Mode */}
							<div className="space-y-2">
								<div className="flex items-center gap-1">
									<Label
										htmlFor="sync-lipsync-lipsync-mode"
										className="text-xs"
									>
										Lipsync Mode
									</Label>
									<Tooltip>
										<TooltipTrigger asChild>
											<Info className="h-3 w-3 text-muted-foreground cursor-help" />
										</TooltipTrigger>
										<TooltipContent side="right" className="max-w-[200px]">
											How to handle audio/video duration mismatch
										</TooltipContent>
									</Tooltip>
								</div>
								<Select
									value={syncLipsyncLipsyncMode}
									onValueChange={(value) =>
										onSyncLipsyncLipsyncModeChange(value as SyncLipsyncSyncMode)
									}
								>
									<SelectTrigger
										id="sync-lipsync-lipsync-mode"
										className="h-8 text-xs"
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="bounce">
											bounce - Bounce shorter track
										</SelectItem>
										<SelectItem value="cut_off">
											cut_off - Cut when shorter ends
										</SelectItem>
										<SelectItem value="loop">
											loop - Loop shorter track
										</SelectItem>
										<SelectItem value="silence">
											silence - Pad with silence
										</SelectItem>
										<SelectItem value="remap">
											remap - Retime to match
										</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Temperature */}
							<div className="space-y-2">
								<div className="flex items-center gap-1">
									<Label htmlFor="sync-lipsync-temperature" className="text-xs">
										Temperature
									</Label>
									<Tooltip>
										<TooltipTrigger asChild>
											<Info className="h-3 w-3 text-muted-foreground cursor-help" />
										</TooltipTrigger>
										<TooltipContent side="right" className="max-w-[200px]">
											Controls expressiveness (0 = minimal, 1 = maximum)
										</TooltipContent>
									</Tooltip>
								</div>
								<div className="flex items-center gap-3">
									<Slider
										id="sync-lipsync-temperature"
										value={[syncLipsyncTemperature]}
										onValueChange={([value]) =>
											onSyncLipsyncTemperatureChange(value)
										}
										min={0}
										max={1}
										step={0.1}
										className="flex-1"
									/>
									<Input
										type="number"
										value={syncLipsyncTemperature}
										onChange={(e) => {
											const val = Number.parseFloat(e.target.value);
											if (!Number.isNaN(val) && val >= 0 && val <= 1) {
												onSyncLipsyncTemperatureChange(val);
											}
										}}
										min={0}
										max={1}
										step={0.1}
										className="w-16 h-8 text-xs"
									/>
								</div>
							</div>
						</CollapsibleContent>
					</Collapsible>

					{/* Duration info */}
					{syncLipsyncVideoDuration !== null && audioDuration !== null && (
						<div className="text-xs text-muted-foreground">
							Video: {syncLipsyncVideoDuration.toFixed(1)}s · Audio:{" "}
							{audioDuration.toFixed(1)}s
						</div>
					)}
				</div>
			)}

			{/* Veo 3.1 Extend-Video Options */}
			{extendVideoSelected && (
				<div className="space-y-3 text-left border-t pt-3">
					<Label className="text-sm font-semibold">
						Veo 3.1 Extend-Video Options
					</Label>
					<p className="text-xs text-muted-foreground">
						Upload a video (up to 8s, 720p/1080p, 16:9 or 9:16) to extend by 7
						seconds
					</p>

					<div className="grid grid-cols-2 gap-3">
						{/* Aspect Ratio */}
						<div className="space-y-2">
							<Label htmlFor="extend-video-aspect-ratio" className="text-xs">
								Aspect Ratio
							</Label>
							<Select
								value={extendVideoAspectRatio}
								onValueChange={onExtendVideoAspectRatioChange}
							>
								<SelectTrigger
									id="extend-video-aspect-ratio"
									className="h-8 text-xs"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto (detect)</SelectItem>
									<SelectItem value="16:9">16:9 Landscape</SelectItem>
									<SelectItem value="9:16">9:16 Portrait</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Generate Audio */}
						<div className="space-y-2">
							<Label className="text-xs">Generate Audio</Label>
							<div className="flex items-center gap-2 h-8">
								<Checkbox
									id="extend-video-audio"
									checked={extendVideoGenerateAudio}
									onCheckedChange={(checked) =>
										onExtendVideoGenerateAudioChange(checked === true)
									}
								/>
								<label
									htmlFor="extend-video-audio"
									className="text-xs text-muted-foreground cursor-pointer"
								>
									{extendVideoGenerateAudio
										? "On ($0.15-0.40/s)"
										: "Off ($0.10-0.20/s)"}
								</label>
							</div>
						</div>
					</div>

					{/* Cost estimate */}
					<div className="text-xs text-muted-foreground">
						Extends video by 7 seconds · Est. cost:{" "}
						{extendVideoGenerateAudio ? "$1.05-2.80" : "$0.70-1.40"}
					</div>
				</div>
			)}
		</div>
	);
}
