import { DEFAULT_MEDIA_AUDIO_SETTINGS } from "@/lib/audio/audio-properties";
import { removeAudioKeyframeProperties } from "@/lib/audio/audio-keyframe-properties";
import {
	AudioKeyframedControl,
	AudioModuleSection,
	AudioNumberControl,
} from "./audio-property-controls";
import type { AudioSettingsEditorBindings } from "./audio-properties-types";
import { AudioPresetControls } from "./audio-preset-controls";
import { useTranslation } from "@/lib/i18n";

export function AudioEffectSettings({
	bindings,
}: {
	bindings: AudioSettingsEditorBindings;
}) {
	const { t } = useTranslation();
	const {
		settings,
		resolvedSettings,
		currentFrame,
		onSettingsChange,
		onPropertyChange,
		onToggleKeyframe,
		onSeekFrame,
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
	const numberProps = { onInteractionStart, onInteractionEnd };

	return (
		<div data-testid="audio-effect-settings">
			<AudioPresetControls bindings={bindings} />
			<AudioModuleSection
				title={t("audioProperties.section.equalizer")}
				enabled={settings.equalizer.enabled}
				onEnabledChange={(enabled) =>
					onSettingsChange({
						...settings,
						equalizer: { ...settings.equalizer, enabled },
					})
				}
				onReset={() =>
					onSettingsChange({
						...removeAudioKeyframeProperties({
							settings,
							properties: ["eqLowGainDb", "eqMidGainDb", "eqHighGainDb"],
						}),
						equalizer: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.equalizer },
					})
				}
				defaultExpanded
				testId="audio-module-equalizer"
			>
				<AudioKeyframedControl property="eqLowGainDb" {...keyframedProps} />
				<AudioKeyframedControl property="eqMidGainDb" {...keyframedProps} />
				<AudioKeyframedControl property="eqHighGainDb" {...keyframedProps} />
			</AudioModuleSection>

			<AudioModuleSection
				title={t("audioProperties.section.compressor")}
				enabled={settings.compressor.enabled}
				onEnabledChange={(enabled) =>
					onSettingsChange({
						...settings,
						compressor: { ...settings.compressor, enabled },
					})
				}
				onReset={() =>
					onSettingsChange({
						...removeAudioKeyframeProperties({
							settings,
							properties: ["compressorThresholdDb", "compressorRatio"],
						}),
						compressor: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.compressor },
					})
				}
				testId="audio-module-compressor"
			>
				<AudioKeyframedControl
					property="compressorThresholdDb"
					{...keyframedProps}
				/>
				<AudioKeyframedControl property="compressorRatio" {...keyframedProps} />
				<AudioNumberControl
					label={t("audioProperties.label.attack")}
					value={settings.compressor.attackMs}
					min={0}
					max={200}
					step={1}
					suffix="ms"
					onChange={(attackMs) =>
						onSettingsChange({
							...settings,
							compressor: { ...settings.compressor, attackMs },
						})
					}
					{...numberProps}
				/>
				<AudioNumberControl
					label={t("audioProperties.label.release")}
					value={settings.compressor.releaseMs}
					min={10}
					max={1000}
					step={5}
					suffix="ms"
					onChange={(releaseMs) =>
						onSettingsChange({
							...settings,
							compressor: { ...settings.compressor, releaseMs },
						})
					}
					{...numberProps}
				/>
				<AudioNumberControl
					label={t("audioProperties.label.makeupGain")}
					value={settings.compressor.makeupGainDb}
					min={0}
					max={24}
					step={0.5}
					suffix="dB"
					onChange={(makeupGainDb) =>
						onSettingsChange({
							...settings,
							compressor: { ...settings.compressor, makeupGainDb },
						})
					}
					{...numberProps}
				/>
			</AudioModuleSection>

			<AudioModuleSection
				title={t("audioProperties.section.limiter")}
				enabled={settings.limiter.enabled}
				onEnabledChange={(enabled) =>
					onSettingsChange({
						...settings,
						limiter: { ...settings.limiter, enabled },
					})
				}
				onReset={() =>
					onSettingsChange({
						...settings,
						limiter: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.limiter },
					})
				}
				testId="audio-module-limiter"
			>
				<AudioNumberControl
					label={t("audioProperties.label.ceiling")}
					value={settings.limiter.ceilingDb}
					min={-12}
					max={0}
					step={0.1}
					suffix="dB"
					onChange={(ceilingDb) =>
						onSettingsChange({
							...settings,
							limiter: { ...settings.limiter, ceilingDb },
						})
					}
					{...numberProps}
				/>
				<AudioNumberControl
					label={t("audioProperties.label.release")}
					value={settings.limiter.releaseMs}
					min={10}
					max={1000}
					step={5}
					suffix="ms"
					onChange={(releaseMs) =>
						onSettingsChange({
							...settings,
							limiter: { ...settings.limiter, releaseMs },
						})
					}
					{...numberProps}
				/>
			</AudioModuleSection>

			<AudioModuleSection
				title={t("audioProperties.section.reverb")}
				enabled={settings.reverb.enabled}
				onEnabledChange={(enabled) =>
					onSettingsChange({
						...settings,
						reverb: { ...settings.reverb, enabled },
					})
				}
				onReset={() =>
					onSettingsChange({
						...removeAudioKeyframeProperties({
							settings,
							properties: ["reverbMix"],
						}),
						reverb: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.reverb },
					})
				}
				testId="audio-module-reverb"
			>
				<AudioKeyframedControl property="reverbMix" {...keyframedProps} />
				<AudioNumberControl
					label={t("audioProperties.label.roomSize")}
					value={settings.reverb.roomSize}
					min={0}
					max={100}
					suffix="%"
					onChange={(roomSize) =>
						onSettingsChange({
							...settings,
							reverb: { ...settings.reverb, roomSize },
						})
					}
					{...numberProps}
				/>
				<AudioNumberControl
					label={t("audioProperties.label.damping")}
					value={settings.reverb.damping}
					min={0}
					max={100}
					suffix="%"
					onChange={(damping) =>
						onSettingsChange({
							...settings,
							reverb: { ...settings.reverb, damping },
						})
					}
					{...numberProps}
				/>
			</AudioModuleSection>

			<AudioModuleSection
				title={t("audioProperties.section.echo")}
				enabled={settings.echo.enabled}
				onEnabledChange={(enabled) =>
					onSettingsChange({ ...settings, echo: { ...settings.echo, enabled } })
				}
				onReset={() =>
					onSettingsChange({
						...removeAudioKeyframeProperties({
							settings,
							properties: ["echoMix"],
						}),
						echo: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.echo },
					})
				}
				testId="audio-module-echo"
			>
				<AudioKeyframedControl property="echoMix" {...keyframedProps} />
				<AudioNumberControl
					label={t("audioProperties.label.delay")}
					value={settings.echo.delayMs}
					min={20}
					max={1000}
					step={5}
					suffix="ms"
					onChange={(delayMs) =>
						onSettingsChange({
							...settings,
							echo: { ...settings.echo, delayMs },
						})
					}
					{...numberProps}
				/>
				<AudioNumberControl
					label={t("audioProperties.label.feedback")}
					value={settings.echo.feedback}
					min={0}
					max={85}
					suffix="%"
					onChange={(feedback) =>
						onSettingsChange({
							...settings,
							echo: { ...settings.echo, feedback },
						})
					}
					{...numberProps}
				/>
			</AudioModuleSection>

			<AudioModuleSection
				title={t("audioProperties.section.telephone")}
				enabled={settings.telephone.enabled}
				onEnabledChange={(enabled) =>
					onSettingsChange({
						...settings,
						telephone: { ...settings.telephone, enabled },
					})
				}
				onReset={() =>
					onSettingsChange({
						...settings,
						telephone: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.telephone },
					})
				}
				testId="audio-module-telephone"
			>
				<AudioNumberControl
					label={t("audioProperties.label.mix")}
					value={settings.telephone.mix}
					min={0}
					max={100}
					suffix="%"
					onChange={(mix) =>
						onSettingsChange({
							...settings,
							telephone: { ...settings.telephone, mix },
						})
					}
					{...numberProps}
				/>
			</AudioModuleSection>
		</div>
	);
}
