export {
	IDENTITY_TEXT_ANIMATION_VISUAL_STATE,
	TEXT_ANIMATION_SCHEMA_VERSION,
} from "./model.js";
export { compileTextAnimation } from "./compile.js";
export { evaluateTextAnimationFrame } from "./evaluate.js";
export {
	isCanonicalTextAnimations,
	normalizeTextAnimations,
} from "./normalize.js";
export {
	segmentGraphemesFallback,
	segmentText,
} from "./segmentation.js";
export { computeShatterTiles, shatterNoise } from "./shatter.js";
export type { ShatterTile } from "./shatter.js";
export {
	mixTextAnimationColors,
	multiplyTextAnimationColors,
	parseTextAnimationHexColor,
	sampleTextAnimationPalette,
} from "./color.js";
export {
	evaluateTextColorKeyframeTrack,
	evaluateTextKeyframeTrack,
} from "./keyframes.js";
export { selectorUnitWeight } from "./effect-state.js";

export type {
	CompiledTextAnimation,
	CompiledTextAnimationPhase,
	CompiledTextAnimationRhythm,
	CompiledTextAnimationUnit,
	TextAnimationActivePhase,
	TextAnimationDecorationState,
	TextAnimationDirection,
	TextAnimationDistance,
	TextAnimationEasing,
	TextAnimationEdgePhase,
	TextAnimationEffect,
	TextAnimationFrameState,
	TextAnimationGraphemeLayout,
	TextAnimationColorMixState,
	TextAnimationGlowState,
	TextAnimationLayout,
	TextAnimationLoopPhase,
	TextAnimationMaskState,
	TextAnimationOrder,
	TextAnimationPhaseBase,
	TextAnimationPostProcessState,
	TextAnimationProjectionState,
	TextAnimationRasterEffectState,
	TextAnimationPresetRef,
	TextAnimationRect,
	TextAnimations,
	TextAnimationsV1,
	TextAnimationSegment,
	TextAnimationSequence,
	TextAnimationTarget,
	TextAnimationTiming,
	TextAnimationUnit,
	TextAnimationUnitState,
	TextAnimationVisualState,
	TextBlurEffect,
	TextBounceEffect,
	TextFadeEffect,
	TextFlipEffect,
	TextFlip3DEffect,
	TextCylinder3DEffect,
	TextJitter3DEffect,
	TextJitterEffect,
	TextColorCycleEffect,
	TextKeyframesEffect,
	TextKeyframesSelector,
	TextSelectorShape,
	TextKeyframeChannel,
	TextColorKeyframePoint,
	TextKeyframePoint,
	TextArcEffect,
	TextSqueezeEffect,
	TextFoldEffect,
	TextSpiralEffect,
	TextScatterEffect,
	TextTumbleEffect,
	TextShatterEffect,
	TextAnimationShatterState,
	TextHeartEffect,
	TextLaserEffect,
	TextOrbitEffect,
	TextRotateEffect,
	TextScaleEffect,
	TextSlideEffect,
	TextTypewriterEffect,
} from "./model.js";

export type {
	TextAnimationNormalizationIssue,
	TextAnimationNormalizationResult,
	TextAnimationNormalizationSource,
} from "./normalize.js";
