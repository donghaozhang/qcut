import type {
	ColorKeyframeProperty,
	MediaColorSettings,
} from "@/types/timeline";

export interface ColorSettingsEditorBindings {
	settings: MediaColorSettings;
	resolvedSettings: MediaColorSettings;
	currentFrame: number;
	onSettingsChange: (settings: MediaColorSettings) => void;
	onPropertyChange: (property: ColorKeyframeProperty, value: number) => void;
	onToggleKeyframe: (property: ColorKeyframeProperty) => void;
	onSeekFrame: (frame: number) => void;
	onApplyAll: () => void;
	onSavePreset: () => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}
