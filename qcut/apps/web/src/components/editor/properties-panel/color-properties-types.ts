import type {
	ColorCurvePoint,
	ColorCurveShapeProperty,
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
	onCurvePointsChange: (
		property: ColorCurveShapeProperty,
		points: ColorCurvePoint[]
	) => void;
	onToggleCurveKeyframe: (property: ColorCurveShapeProperty) => void;
	onSeekFrame: (frame: number) => void;
	onApplyAll: () => void;
	onSavePreset: (name?: string) => void;
	onInteractionStart: () => void;
	onInteractionEnd: () => void;
}
