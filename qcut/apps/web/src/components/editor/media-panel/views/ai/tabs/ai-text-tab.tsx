/**
 * Text Tab UI Component
 *
 * Renders the Text-to-Video tab UI including:
 * - Prompt textarea with character count
 * - Collapsible additional settings section
 * - Model-specific settings (Hailuo, LTX Pro, LTX Fast)
 *
 * @see ai-tsx-refactoring.md - Subtask 3.3
 */

import { ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { LTXV2_FAST_CONFIG } from "../constants/ai-constants";
import {
	LTXV2_FAST_RESOLUTION_LABELS,
	LTXV2_FAST_RESOLUTION_PRICE_SUFFIX,
	LTXV2_FAST_FPS_LABELS,
	type LTXV2FastDuration,
	type LTXV2FastResolution,
	type LTXV2FastFps,
} from "../constants/ai-model-options";
import type { T2VModelCapabilities } from "../constants/text2video-models-config";
import { calculateLTXV2Cost } from "../utils/ai-cost-calculators";

// ============================================
// Types
// ============================================

export interface AITextTabProps {
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
	/** Combined capabilities from selected models */
	combinedCapabilities: T2VModelCapabilities;
	/** Whether Sora 2 is selected (for character limit display) */
	isSora2Selected: boolean;

	// Unified T2V settings
	t2vSettingsExpanded: boolean;
	onT2vSettingsExpandedChange: (value: boolean) => void;
	t2vAspectRatio: string;
	onT2vAspectRatioChange: (value: string) => void;
	t2vResolution: string;
	onT2vResolutionChange: (value: string) => void;
	t2vDuration: number;
	onT2vDurationChange: (value: number) => void;
	t2vNegativePrompt: string;
	onT2vNegativePromptChange: (value: string) => void;
	t2vPromptExpansion: boolean;
	onT2vPromptExpansionChange: (value: boolean) => void;
	t2vSeed: number;
	onT2vSeedChange: (value: number) => void;
	t2vSafetyChecker: boolean;
	onT2vSafetyCheckerChange: (value: boolean) => void;
	/** Count of active (non-default) settings */
	activeSettingsCount: number;

	// Hailuo settings
	hailuoT2VDuration: 6 | 10;
	onHailuoT2VDurationChange: (value: 6 | 10) => void;

	// LTX Video Pro settings
	ltxv2Duration: 6 | 8 | 10;
	onLTXV2DurationChange: (value: 6 | 8 | 10) => void;
	ltxv2Resolution: "1080p" | "1440p" | "2160p";
	onLTXV2ResolutionChange: (value: "1080p" | "1440p" | "2160p") => void;
	ltxv2FPS: 25 | 50;
	onLTXV2FPSChange: (value: 25 | 50) => void;
	ltxv2GenerateAudio: boolean;
	onLTXV2GenerateAudioChange: (value: boolean) => void;

	// LTX Video Fast settings
	ltxv2FastDuration: LTXV2FastDuration;
	onLTXV2FastDurationChange: (value: LTXV2FastDuration) => void;
	ltxv2FastResolution: LTXV2FastResolution;
	onLTXV2FastResolutionChange: (value: LTXV2FastResolution) => void;
	ltxv2FastFPS: LTXV2FastFps;
	onLTXV2FastFPSChange: (value: LTXV2FastFps) => void;
	ltxv2FastGenerateAudio: boolean;
	onLTXV2FastGenerateAudioChange: (value: boolean) => void;
}

// ============================================
// Component
// ============================================

/**
 * Text tab component for AI text-to-video generation.
 *
 * @example
 * ```tsx
 * <AITextTab
 *   prompt={prompt}
 *   onPromptChange={setPrompt}
 *   maxChars={maxChars}
 *   selectedModels={selectedModels}
 *   isCompact={isCompact}
 *   combinedCapabilities={combinedCapabilities}
 *   // ... other props
 * />
 * ```
 */
export function AITextTab({
	prompt,
	onPromptChange,
	maxChars,
	selectedModels,
	isCompact,
	combinedCapabilities,
	isSora2Selected,
	t2vSettingsExpanded,
	onT2vSettingsExpandedChange,
	t2vAspectRatio,
	onT2vAspectRatioChange,
	t2vResolution,
	onT2vResolutionChange,
	t2vDuration,
	onT2vDurationChange,
	t2vNegativePrompt,
	onT2vNegativePromptChange,
	t2vPromptExpansion,
	onT2vPromptExpansionChange,
	t2vSeed,
	onT2vSeedChange,
	t2vSafetyChecker,
	onT2vSafetyCheckerChange,
	activeSettingsCount,
	hailuoT2VDuration,
	onHailuoT2VDurationChange,
	ltxv2Duration,
	onLTXV2DurationChange,
	ltxv2Resolution,
	onLTXV2ResolutionChange,
	ltxv2FPS,
	onLTXV2FPSChange,
	ltxv2GenerateAudio,
	onLTXV2GenerateAudioChange,
	ltxv2FastDuration,
	onLTXV2FastDurationChange,
	ltxv2FastResolution,
	onLTXV2FastResolutionChange,
	ltxv2FastFPS,
	onLTXV2FastFPSChange,
	ltxv2FastGenerateAudio,
	onLTXV2FastGenerateAudioChange,
}: AITextTabProps) {
	// Model selection helpers
	const hailuoStandardSelected = selectedModels.includes(
		"hailuo23_standard_t2v"
	);
	const hailuoProSelected = selectedModels.includes("hailuo23_pro_t2v");
	const ltxv2ProTextSelected = selectedModels.includes("ltxv2_pro_t2v");
	const ltxv2FastTextSelected = selectedModels.includes("ltxv2_fast_t2v");

	// LTX Fast extended duration constraints
	const ltxv2FastExtendedResolutions = LTXV2_FAST_CONFIG.RESOLUTIONS.EXTENDED;
	const ltxv2FastExtendedFps = LTXV2_FAST_CONFIG.FPS_OPTIONS.EXTENDED;
	const isExtendedLTXV2FastTextDuration =
		ltxv2FastDuration > LTXV2_FAST_CONFIG.EXTENDED_DURATION_THRESHOLD;

	const remainingChars = maxChars - prompt.length;

	return (
		<div className="space-y-4">
			{/* Prompt input */}
			<div className="space-y-2">
				<Label htmlFor="prompt" className="text-xs">
					Prompt {!isCompact && "for Video Generation"}
				</Label>
				<Textarea
					id="prompt"
					placeholder={
						isCompact
							? "Describe the video..."
							: "Describe the video you want to generate..."
					}
					value={prompt}
					onChange={(e) => onPromptChange(e.target.value)}
					className={`${isCompact ? "min-h-[80px]" : "min-h-[120px]"} text-xs resize-none`}
					maxLength={maxChars}
					autoResize
					maxHeight={isCompact ? 160 : 240}
				/>
				<div
					className={`text-xs ${remainingChars < 50 ? "text-orange-500" : remainingChars < 20 ? "text-red-500" : "text-muted-foreground"} text-right`}
				>
					{remainingChars} characters remaining
					{isSora2Selected && (
						<span className="ml-2 text-primary">(Sora 2: 5000 max)</span>
					)}
				</div>

				{/* Additional Settings */}
				{selectedModels.length > 0 && (
					<Collapsible
						open={t2vSettingsExpanded}
						onOpenChange={onT2vSettingsExpandedChange}
					>
						<div className="flex items-center justify-between border-t pt-3">
							<CollapsibleTrigger asChild>
								<Button
									variant="link"
									size="sm"
									className="flex items-center gap-2 p-0 h-auto"
									type="button"
								>
									<Label className="text-sm font-semibold cursor-pointer">
										Additional Settings
									</Label>
									<ChevronDown
										className={`h-4 w-4 transition-transform ${t2vSettingsExpanded ? "rotate-180" : ""}`}
									/>
								</Button>
							</CollapsibleTrigger>

							{!t2vSettingsExpanded && (
								<Badge variant="secondary" className="text-xs">
									{activeSettingsCount} active
								</Badge>
							)}
						</div>

						<CollapsibleContent className="space-y-4 mt-4">
							{combinedCapabilities.supportsAspectRatio && (
								<div className="space-y-2">
									<Label className="text-xs font-medium">Aspect Ratio</Label>
									<Select
										value={t2vAspectRatio}
										onValueChange={onT2vAspectRatioChange}
										disabled={
											!combinedCapabilities.supportedAspectRatios ||
											combinedCapabilities.supportedAspectRatios.length === 0
										}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue placeholder="Select aspect ratio" />
										</SelectTrigger>
										<SelectContent>
											{(
												combinedCapabilities.supportedAspectRatios || ["16:9"]
											).map((ratio: string) => (
												<SelectItem key={ratio} value={ratio}>
													{ratio}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}

							{combinedCapabilities.supportsResolution && (
								<div className="space-y-2">
									<Label className="text-xs font-medium">Resolution</Label>
									<Select
										value={t2vResolution}
										onValueChange={onT2vResolutionChange}
										disabled={
											!combinedCapabilities.supportedResolutions ||
											combinedCapabilities.supportedResolutions.length === 0
										}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue placeholder="Select resolution" />
										</SelectTrigger>
										<SelectContent>
											{(
												combinedCapabilities.supportedResolutions || ["1080p"]
											).map((res: string) => (
												<SelectItem key={res} value={res}>
													{res}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}

							{combinedCapabilities.supportsDuration && (
								<div className="space-y-2">
									<Label className="text-xs font-medium">Duration</Label>
									<Select
										value={t2vDuration.toString()}
										onValueChange={(value) =>
											onT2vDurationChange(Number(value) || 4)
										}
										disabled={
											!combinedCapabilities.supportedDurations ||
											combinedCapabilities.supportedDurations.length === 0
										}
									>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue placeholder="Select duration" />
										</SelectTrigger>
										<SelectContent>
											{(combinedCapabilities.supportedDurations || [5]).map(
												(dur: number) => (
													<SelectItem key={dur} value={dur.toString()}>
														{dur} seconds
													</SelectItem>
												)
											)}
										</SelectContent>
									</Select>
								</div>
							)}

							{combinedCapabilities.supportsNegativePrompt && (
								<div className="space-y-1">
									<Label className="text-xs font-medium">Negative Prompt</Label>
									<Textarea
										value={t2vNegativePrompt}
										onChange={(e) => onT2vNegativePromptChange(e.target.value)}
										placeholder="low resolution, error, worst quality, low quality, defects"
										className="min-h-[60px] text-xs resize-none"
										maxLength={500}
									/>
								</div>
							)}

							{combinedCapabilities.supportsPromptExpansion && (
								<div className="flex items-center space-x-2">
									<Checkbox
										id="t2v-prompt-expansion"
										checked={t2vPromptExpansion}
										onCheckedChange={(checked) =>
											onT2vPromptExpansionChange(Boolean(checked))
										}
									/>
									<Label htmlFor="t2v-prompt-expansion" className="text-xs">
										Enable prompt expansion
									</Label>
								</div>
							)}

							{combinedCapabilities.supportsSeed && (
								<div className="space-y-1">
									<Label className="text-xs font-medium">Seed</Label>
									<Input
										type="number"
										inputMode="numeric"
										value={Number.isNaN(t2vSeed) ? "" : t2vSeed}
										onChange={(e) => {
											const val = Number(e.target.value);
											onT2vSeedChange(Number.isNaN(val) ? -1 : val);
										}}
										placeholder="-1 for random"
										className="h-8 text-xs"
									/>
								</div>
							)}

							{combinedCapabilities.supportsSafetyChecker && (
								<div className="flex items-center space-x-2">
									<Checkbox
										id="t2v-safety-checker"
										checked={t2vSafetyChecker}
										onCheckedChange={(checked) =>
											onT2vSafetyCheckerChange(Boolean(checked))
										}
									/>
									<Label htmlFor="t2v-safety-checker" className="text-xs">
										Enable safety checker
									</Label>
								</div>
							)}
						</CollapsibleContent>
					</Collapsible>
				)}

				{/* Hailuo Pro Settings */}
				{hailuoProSelected && (
					<>
						<div className="text-xs text-muted-foreground text-left">
							Tip: Add camera cues like [Pan left], [Zoom in], or [Track
							forward] to guide Pro shots.
						</div>
						{/* Show duration selector for Pro if Standard is not selected */}
						{!hailuoStandardSelected && (
							<div className="space-y-1 text-left mt-2">
								<Label
									htmlFor="hailuo-pro-duration"
									className="text-xs font-medium"
								>
									Hailuo 2.3 Pro Duration
								</Label>
								<Select
									value={hailuoT2VDuration.toString()}
									onValueChange={(value) =>
										onHailuoT2VDurationChange(value === "10" ? 10 : 6)
									}
								>
									<SelectTrigger
										id="hailuo-pro-duration"
										className="h-8 text-xs"
									>
										<SelectValue placeholder="Select duration" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="6">6 seconds ($0.49)</SelectItem>
										<SelectItem value="10">10 seconds ($0.49)</SelectItem>
									</SelectContent>
								</Select>
								<div className="text-xs text-muted-foreground">
									Pro: Fixed price $0.49 for 6s or 10s
								</div>
							</div>
						)}
					</>
				)}

				{/* Hailuo Standard Settings */}
				{hailuoStandardSelected && (
					<div className="space-y-1 text-left">
						<Label
							htmlFor="hailuo-standard-duration"
							className="text-xs font-medium"
						>
							Hailuo 2.3 {hailuoProSelected ? "Shared" : "Standard"} Duration
						</Label>
						<Select
							value={hailuoT2VDuration.toString()}
							onValueChange={(value) =>
								onHailuoT2VDurationChange(value === "10" ? 10 : 6)
							}
						>
							<SelectTrigger
								id="hailuo-standard-duration"
								className="h-8 text-xs"
							>
								<SelectValue placeholder="Select duration" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="6">
									6 seconds (
									{hailuoProSelected ? "Standard: $0.28, Pro: $0.49" : "$0.28"})
								</SelectItem>
								<SelectItem value="10">
									10 seconds (
									{hailuoProSelected ? "Standard: $0.56, Pro: $0.49" : "$0.56"})
								</SelectItem>
							</SelectContent>
						</Select>
						<div className="text-xs text-muted-foreground">
							{hailuoProSelected
								? "Duration applies to both Standard and Pro models"
								: "Standard: 6s: $0.28 | 10s: $0.56"}
						</div>
					</div>
				)}

				{/* LTX Video Pro Settings */}
				{ltxv2ProTextSelected && (
					<div className="space-y-2 text-left border-t pt-3">
						<Label className="text-xs font-medium">
							LTX Video 2.0 Pro Settings
						</Label>
						<div className="space-y-1">
							<Label htmlFor="ltxv2-duration" className="text-xs">
								Duration
							</Label>
							<Select
								value={ltxv2Duration.toString()}
								onValueChange={(value) =>
									onLTXV2DurationChange(Number(value) as 6 | 8 | 10)
								}
							>
								<SelectTrigger id="ltxv2-duration" className="h-8 text-xs">
									<SelectValue placeholder="Select duration" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="6">6 seconds</SelectItem>
									<SelectItem value="8">8 seconds</SelectItem>
									<SelectItem value="10">10 seconds</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1">
							<Label htmlFor="ltxv2-resolution" className="text-xs">
								Resolution
							</Label>
							<Select
								value={ltxv2Resolution}
								onValueChange={(value) =>
									onLTXV2ResolutionChange(value as "1080p" | "1440p" | "2160p")
								}
							>
								<SelectTrigger id="ltxv2-resolution" className="h-8 text-xs">
									<SelectValue placeholder="Select resolution" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="1080p">1080p</SelectItem>
									<SelectItem value="1440p">1440p</SelectItem>
									<SelectItem value="2160p">2160p (4K)</SelectItem>
								</SelectContent>
							</Select>
							<div className="text-xs text-muted-foreground">
								Cost: $
								{calculateLTXV2Cost(
									ltxv2Resolution,
									ltxv2Duration,
									"pro"
								).toFixed(2)}
							</div>
						</div>

						<div className="space-y-1">
							<Label htmlFor="ltxv2-fps" className="text-xs">
								Frame Rate
							</Label>
							<Select
								value={ltxv2FPS.toString()}
								onValueChange={(value) =>
									onLTXV2FPSChange(Number(value) as 25 | 50)
								}
							>
								<SelectTrigger id="ltxv2-fps" className="h-8 text-xs">
									<SelectValue placeholder="Select frame rate" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="25">25 FPS</SelectItem>
									<SelectItem value="50">50 FPS</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="flex items-center space-x-2">
							<Checkbox
								id="ltxv2-audio"
								checked={ltxv2GenerateAudio}
								onCheckedChange={(checked) =>
									onLTXV2GenerateAudioChange(Boolean(checked))
								}
							/>
							<Label htmlFor="ltxv2-audio" className="text-xs">
								Generate audio
							</Label>
						</div>
					</div>
				)}

				{/* LTX Video Fast Settings */}
				{ltxv2FastTextSelected && (
					<div className="space-y-3 text-left border-t pt-3">
						<Label className="text-sm font-semibold">
							LTX Video 2.0 Fast Settings
						</Label>

						<div className="space-y-1">
							<Label
								htmlFor="ltxv2-fast-duration"
								className="text-xs font-medium"
							>
								Duration
							</Label>
							<Select
								value={ltxv2FastDuration.toString()}
								onValueChange={(value) =>
									onLTXV2FastDurationChange(Number(value) as LTXV2FastDuration)
								}
							>
								<SelectTrigger id="ltxv2-fast-duration" className="h-8 text-xs">
									<SelectValue placeholder="Select duration" />
								</SelectTrigger>
								<SelectContent>
									{LTXV2_FAST_CONFIG.DURATIONS.map((durationOption) => (
										<SelectItem
											key={durationOption}
											value={durationOption.toString()}
										>
											{durationOption} seconds
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1">
							<Label
								htmlFor="ltxv2-fast-resolution"
								className="text-xs font-medium"
							>
								Resolution
							</Label>
							<Select
								value={ltxv2FastResolution}
								onValueChange={(value) =>
									onLTXV2FastResolutionChange(value as LTXV2FastResolution)
								}
							>
								<SelectTrigger
									id="ltxv2-fast-resolution"
									className="h-8 text-xs"
								>
									<SelectValue placeholder="Select resolution" />
								</SelectTrigger>
								<SelectContent>
									{LTXV2_FAST_CONFIG.RESOLUTIONS.STANDARD.map(
										(resolutionOption) => {
											const disabled =
												isExtendedLTXV2FastTextDuration &&
												!ltxv2FastExtendedResolutions.includes(
													resolutionOption as (typeof ltxv2FastExtendedResolutions)[number]
												);

											return (
												<SelectItem
													key={resolutionOption}
													value={resolutionOption}
													disabled={disabled}
												>
													{LTXV2_FAST_RESOLUTION_LABELS[resolutionOption]}
													{LTXV2_FAST_RESOLUTION_PRICE_SUFFIX[
														resolutionOption
													] ?? ""}
												</SelectItem>
											);
										}
									)}
								</SelectContent>
							</Select>
							<div className="text-xs text-muted-foreground">
								Estimated cost: $
								{calculateLTXV2Cost(
									ltxv2FastResolution,
									ltxv2FastDuration,
									"fast"
								).toFixed(2)}
							</div>
						</div>

						<div className="space-y-1">
							<Label htmlFor="ltxv2-fast-fps" className="text-xs font-medium">
								Frame Rate
							</Label>
							<Select
								value={ltxv2FastFPS.toString()}
								onValueChange={(value) =>
									onLTXV2FastFPSChange(Number(value) as LTXV2FastFps)
								}
							>
								<SelectTrigger id="ltxv2-fast-fps" className="h-8 text-xs">
									<SelectValue placeholder="Select frame rate" />
								</SelectTrigger>
								<SelectContent>
									{LTXV2_FAST_CONFIG.FPS_OPTIONS.STANDARD.map((fpsOption) => {
										const disabled =
											isExtendedLTXV2FastTextDuration &&
											!ltxv2FastExtendedFps.includes(
												fpsOption as (typeof ltxv2FastExtendedFps)[number]
											);

										return (
											<SelectItem
												key={fpsOption}
												value={fpsOption.toString()}
												disabled={disabled}
											>
												{LTXV2_FAST_FPS_LABELS[fpsOption]}
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
						</div>

						<div className="flex items-center space-x-2">
							<Checkbox
								id="ltxv2-fast-audio"
								checked={ltxv2FastGenerateAudio}
								onCheckedChange={(checked) =>
									onLTXV2FastGenerateAudioChange(Boolean(checked))
								}
							/>
							<Label htmlFor="ltxv2-fast-audio" className="text-xs">
								Generate audio
							</Label>
						</div>

						{isExtendedLTXV2FastTextDuration && (
							<div className="text-xs text-muted-foreground">
								Longer clips (12-20s) are limited to 1080p at 25 FPS.
							</div>
						)}

						<div className="text-xs text-muted-foreground">
							6-20 second clips with optional audio at up to 4K. Longer clips
							automatically use 1080p at 25 FPS.
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
