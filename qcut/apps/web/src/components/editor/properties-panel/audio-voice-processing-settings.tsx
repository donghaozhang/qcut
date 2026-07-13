import { DEFAULT_MEDIA_AUDIO_SETTINGS } from "@/lib/audio/audio-properties";
import { removeAudioKeyframeProperties } from "@/lib/audio/audio-keyframe-properties";
import {
	AudioKeyframedControl,
	AudioModuleSection,
	AudioToggleRow,
} from "./audio-property-controls";
import type { AudioSettingsEditorBindings } from "./audio-properties-types";

function keyframedProps({
	bindings,
}: {
	bindings: AudioSettingsEditorBindings;
}) {
	return {
		settings: bindings.settings,
		resolvedSettings: bindings.resolvedSettings,
		currentFrame: bindings.currentFrame,
		onChange: bindings.onPropertyChange,
		onToggleKeyframe: bindings.onToggleKeyframe,
		onSeekFrame: bindings.onSeekFrame,
		onInteractionStart: bindings.onInteractionStart,
		onInteractionEnd: bindings.onInteractionEnd,
	};
}

export function AudioVoiceEnhancementSettings({
	bindings,
}: {
	bindings: AudioSettingsEditorBindings;
}) {
	const { settings, onSettingsChange } = bindings;
	return (
		<AudioModuleSection
			title="人声增强"
			enabled={settings.voiceEnhance.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					voiceEnhance: { ...settings.voiceEnhance, enabled },
				})
			}
			onReset={() =>
				onSettingsChange({
					...removeAudioKeyframeProperties({
						settings,
						properties: ["voiceClarity", "voiceWarmth", "voicePresence"],
					}),
					voiceEnhance: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.voiceEnhance },
				})
			}
			testId="audio-module-voice-enhance"
		>
			<AudioKeyframedControl
				property="voiceClarity"
				{...keyframedProps({ bindings })}
			/>
			<AudioKeyframedControl
				property="voiceWarmth"
				{...keyframedProps({ bindings })}
			/>
			<AudioKeyframedControl
				property="voicePresence"
				{...keyframedProps({ bindings })}
			/>
		</AudioModuleSection>
	);
}

export function AudioPitchSettings({
	bindings,
}: {
	bindings: AudioSettingsEditorBindings;
}) {
	const { settings, onSettingsChange } = bindings;
	return (
		<AudioModuleSection
			title="音调"
			enabled={settings.pitch.enabled}
			onEnabledChange={(enabled) =>
				onSettingsChange({
					...settings,
					pitch: { ...settings.pitch, enabled },
				})
			}
			onReset={() =>
				onSettingsChange({
					...removeAudioKeyframeProperties({
						settings,
						properties: ["pitchSemitones"],
					}),
					pitch: { ...DEFAULT_MEDIA_AUDIO_SETTINGS.pitch },
				})
			}
			testId="audio-module-pitch"
		>
			<AudioKeyframedControl
				property="pitchSemitones"
				{...keyframedProps({ bindings })}
			/>
			<AudioToggleRow
				label="保留共振峰"
				checked={settings.pitch.preserveFormants}
				onCheckedChange={(preserveFormants) =>
					onSettingsChange({
						...settings,
						pitch: { ...settings.pitch, preserveFormants },
					})
				}
			/>
		</AudioModuleSection>
	);
}
