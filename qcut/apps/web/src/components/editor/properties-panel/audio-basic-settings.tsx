import { DEFAULT_MEDIA_AUDIO_SETTINGS } from "@/lib/audio/audio-properties";
import { removeAudioKeyframeProperties } from "@/lib/audio/audio-keyframe-properties";
import {
	AudioKeyframedControl,
	AudioModuleSection,
	AudioNumberControl,
	activateButtonFromKeyboard,
} from "./audio-property-controls";
import type { AudioSettingsEditorBindings } from "./audio-properties-types";
import { Activity, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import type { AudioDenoiseSettings } from "@/types/timeline";
import { AudioSeparationSettings } from "./audio-ai-voice-settings";
import {
	AudioPitchSettings,
	AudioVoiceEnhancementSettings,
} from "./audio-voice-processing-settings";
import { AudioLevelMeter } from "./audio-level-meter";
import { useTranslation } from "@/lib/i18n";

function denoiseStatusText({
	denoise,
	t,
}: {
	denoise: AudioDenoiseSettings;
	t: ReturnType<typeof useTranslation>["t"];
}): string {
	if (denoise.status === "ready") return t("audioProperties.denoise.ready");
	if (denoise.status === "error") {
		return denoise.error || t("audioProperties.denoise.failed");
	}
	return t("audioProperties.denoise.description");
}

export function AudioBasicSettings({
	bindings,
	trackId,
}: {
	bindings: AudioSettingsEditorBindings;
	trackId: string;
}) {
	const { t } = useTranslation();
	const {
		settings,
		resolvedSettings,
		currentFrame,
		maxFadeDuration,
		onSettingsChange,
		onPropertyChange,
		onToggleKeyframe,
		onSeekFrame,
		onAnalyzeLoudness,
		onRunAiDenoise,
		onInteractionStart,
		onInteractionEnd,
	} = bindings;
	const keyframedProps = {
		settings,
		resolvedSettings,
		currentFrame,
		onChange: onPropertyChange,
		onToggleKeyframe,
		onSeekFrame,
		onInteractionStart,
		onInteractionEnd,
	};

	return (
		<div data-testid="audio-basic-settings">
			<AudioLevelMeter trackId={trackId} />
			<AudioModuleSection
				title={t("audioProperties.section.basic")}
				enabled={settings.enabled}
				onEnabledChange={(enabled) =>
					onSettingsChange({ ...settings, enabled })
				}
				onReset={() =>
					onSettingsChange({
						...removeAudioKeyframeProperties({
							settings,
							properties: ["volumeDb", "fadeIn", "fadeOut"],
						}),
						enabled: true,
						volumeDb: 0,
						fadeIn: 0,
						fadeOut: 0,
					})
				}
				defaultExpanded
				testId="audio-module-basic"
			>
				<AudioKeyframedControl property="volumeDb" {...keyframedProps} />
				<AudioKeyframedControl
					property="fadeIn"
					max={maxFadeDuration}
					{...keyframedProps}
				/>
				<AudioKeyframedControl
					property="fadeOut"
					max={maxFadeDuration}
					{...keyframedProps}
				/>
			</AudioModuleSection>

			<AudioModuleSection
				title={t("audioProperties.section.loudness")}
				enabled={settings.loudness.enabled}
				onEnabledChange={(enabled) =>
					onSettingsChange({
						...settings,
						loudness: { ...settings.loudness, enabled },
					})
				}
				onReset={() =>
					onSettingsChange({
						...settings,
						loudness: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.loudness },
					})
				}
				testId="audio-module-loudness"
			>
				<AudioNumberControl
					label={t("audioProperties.label.targetLoudness")}
					value={settings.loudness.targetLufs}
					min={-24}
					max={-8}
					step={0.5}
					suffix="LUFS"
					onChange={(targetLufs) =>
						onSettingsChange({
							...settings,
							loudness: { ...settings.loudness, targetLufs },
						})
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
				<AudioNumberControl
					label={t("audioProperties.label.truePeak")}
					value={settings.loudness.truePeakDb}
					min={-6}
					max={0}
					step={0.1}
					suffix="dB"
					onChange={(truePeakDb) =>
						onSettingsChange({
							...settings,
							loudness: { ...settings.loudness, truePeakDb },
						})
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
				<AudioNumberControl
					label={t("audioProperties.label.loudnessRange")}
					value={settings.loudness.loudnessRange}
					min={1}
					max={30}
					step={1}
					suffix="LU"
					onChange={(loudnessRange) =>
						onSettingsChange({
							...settings,
							loudness: { ...settings.loudness, loudnessRange },
						})
					}
					onInteractionStart={onInteractionStart}
					onInteractionEnd={onInteractionEnd}
				/>
				<div className="flex items-center justify-between gap-2">
					<div className="text-[10px] tabular-nums text-muted-foreground">
						{settings.loudness.measuredLufs !== undefined
							? `${settings.loudness.measuredLufs.toFixed(1)} LUFS / ${(settings.loudness.measuredTruePeakDb ?? -120).toFixed(1)} dBTP`
							: t("audioProperties.loudness.notAnalyzed")}
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={settings.loudness.analysisStatus === "analyzing"}
						onClick={() => void onAnalyzeLoudness()}
						onKeyDown={(event) => activateButtonFromKeyboard({ event })}
					>
						{settings.loudness.analysisStatus === "analyzing" ? (
							<LoaderCircle className="size-3 animate-spin" />
						) : (
							<Activity className="size-3" />
						)}
						{t("audioProperties.loudness.analyze")}
					</Button>
				</div>
				{settings.loudness.analysisStatus === "error" ? (
					<p className="text-[10px] text-destructive">
						{settings.loudness.analysisError ??
							t("audioProperties.loudness.failed")}
					</p>
				) : null}
			</AudioModuleSection>

			<AudioModuleSection
				title={t("audioProperties.section.denoise")}
				enabled={settings.denoise.enabled}
				onEnabledChange={(enabled) =>
					onSettingsChange({
						...settings,
						denoise: { ...settings.denoise, enabled },
					})
				}
				onReset={() =>
					onSettingsChange({
						...removeAudioKeyframeProperties({
							settings,
							properties: ["denoiseAmount"],
						}),
						denoise: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.denoise },
					})
				}
				testId="audio-module-denoise"
			>
				<ToggleGroup
					type="single"
					value={settings.denoise.mode ?? "realtime"}
					onValueChange={(mode) => {
						if (mode !== "realtime" && mode !== "ai") return;
						onSettingsChange({
							...settings,
							denoise: { ...settings.denoise, mode },
						});
					}}
					className="grid w-full grid-cols-2"
				>
					<ToggleGroupItem
						value="realtime"
						aria-label={t("audioProperties.denoise.realtimeLabel")}
					>
						{t("audioProperties.denoise.realtime")}
					</ToggleGroupItem>
					<ToggleGroupItem
						value="ai"
						aria-label={t("audioProperties.denoise.aiLabel")}
					>
						{t("audioProperties.denoise.ai")}
					</ToggleGroupItem>
				</ToggleGroup>
				{(settings.denoise.mode ?? "realtime") === "realtime" ? (
					<>
						<AudioKeyframedControl
							property="denoiseAmount"
							{...keyframedProps}
						/>
						<AudioNumberControl
							label={t("audioProperties.label.noiseFloor")}
							value={settings.denoise.noiseFloorDb}
							min={-80}
							max={-20}
							step={1}
							suffix="dB"
							onChange={(noiseFloorDb) =>
								onSettingsChange({
									...settings,
									denoise: { ...settings.denoise, noiseFloorDb },
								})
							}
							onInteractionStart={onInteractionStart}
							onInteractionEnd={onInteractionEnd}
						/>
					</>
				) : (
					<div className="flex items-center justify-between gap-2">
						<span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
							{denoiseStatusText({ denoise: settings.denoise, t })}
						</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={settings.denoise.status === "processing"}
							onClick={() =>
								void onRunAiDenoise().catch((error) =>
									toast.error(
										error instanceof Error
											? error.message
											: t("audioProperties.denoise.failed")
									)
								)
							}
							onKeyDown={(event) => activateButtonFromKeyboard({ event })}
						>
							{settings.denoise.status === "processing" ? (
								<LoaderCircle className="size-3 animate-spin" />
							) : (
								<Activity className="size-3" />
							)}
							{settings.denoise.status === "ready"
								? t("audioProperties.denoise.reprocess")
								: t("audioProperties.denoise.start")}
						</Button>
					</div>
				)}
			</AudioModuleSection>

			<AudioVoiceEnhancementSettings bindings={bindings} />
			<AudioSeparationSettings bindings={bindings} />
			<AudioPitchSettings bindings={bindings} />

			<AudioModuleSection
				title={t("audioProperties.section.pan")}
				enabled={settings.panEnabled}
				onEnabledChange={(panEnabled) =>
					onSettingsChange({ ...settings, panEnabled })
				}
				onReset={() =>
					onSettingsChange({
						...removeAudioKeyframeProperties({
							settings,
							properties: ["pan"],
						}),
						panEnabled: false,
						pan: 0,
					})
				}
				testId="audio-module-pan"
			>
				<AudioKeyframedControl property="pan" {...keyframedProps} />
			</AudioModuleSection>
		</div>
	);
}
