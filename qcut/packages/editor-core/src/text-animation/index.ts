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
	TextAnimationLayout,
	TextAnimationLoopPhase,
	TextAnimationMaskState,
	TextAnimationOrder,
	TextAnimationPhaseBase,
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
	TextJitterEffect,
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
