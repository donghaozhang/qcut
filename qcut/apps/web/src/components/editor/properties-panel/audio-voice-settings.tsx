import type { AudioSettingsEditorBindings } from "./audio-properties-types";
import { AudioVoiceConversionSettings } from "./audio-ai-voice-settings";
import { AudioVoicePresetControls } from "./audio-preset-controls";

export function AudioVoiceSettings({
	bindings,
}: {
	bindings: AudioSettingsEditorBindings;
}) {
	return (
		<div data-testid="audio-voice-settings">
			<AudioVoicePresetControls bindings={bindings} />
			<AudioVoiceConversionSettings bindings={bindings} />
		</div>
	);
}
