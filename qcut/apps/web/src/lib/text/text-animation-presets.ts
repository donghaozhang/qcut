export {
	filterTextAnimationPresets,
	getTextAnimationPreset,
	TEXT_ANIMATION_PRESETS,
} from "./text-animation-presets/catalog";
export {
	getTextAnimationPhaseIntensity,
	textAnimationPresetSupportsIntensity,
	updateTextAnimationPhaseIntensity,
} from "./text-animation-presets/intensity";
export {
	applyTextAnimationPreset,
	createTextAnimationPhaseSnapshot,
	getSelectedTextAnimationPreset,
	getTextAnimationPhase,
	updateTextAnimationPhaseTiming,
} from "./text-animation-presets/snapshots";
export {
	TEXT_ANIMATION_PHASES,
	type TextAnimationPhase,
	type TextAnimationPresetDefinition,
	type TextAnimationPreviewKind,
} from "./text-animation-presets/types";
