import type {
	AudioKeyframeProperty,
	MediaAudioSettings,
} from "@/types/timeline";

export interface AudioSettingsEditorBindings {
	settings: MediaAudioSettings;
	resolvedSettings: MediaAudioSettings;
	currentFrame: number;
	maxFadeDuration: number;
	onSettingsChange: (settings: MediaAudioSettings) => void;
	onPropertyChange: (property: AudioKeyframeProperty, value: number) => void;
	onToggleKeyframe: (property: AudioKeyframeProperty) => void;
	onSeekFrame: (frame: number) => void;
	onAnalyzeLoudness: () => Promise<void>;
	onRunAiDenoise: () => Promise<void>;
	onRunSeparation: () => Promise<void>;
	onRunVoiceConversion: (options: {
		targetVoiceUrl?: string;
		targetVoiceFile?: File;
	}) => Promise<void>;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}
