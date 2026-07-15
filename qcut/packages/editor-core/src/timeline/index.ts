/**
 * @qcut/editor-core timeline exports
 * @module @qcut/editor-core/timeline
 */

export {
	sortTracksByOrder,
	normalizeTrackOrder,
	moveTrack,
	compareTrackTypePriority,
	getMainTrack,
	ensureMainTrack,
	getTrackName,
	createTrack,
} from "./track-utils.js";

export {
	buildCompositionPlan,
	type BuildCompositionPlanOptions,
	type CompositionAudioElement,
	type CompositionDurationContext,
	type CompositionLayer,
	type CompositionPlan,
} from "./composition-plan.js";

export {
	getEffectiveDuration,
	getElementEndTime,
	getElementNameWithSuffix,
} from "./element-utils.js";

export {
	CLIP_TRANSITION_MAX_DURATION_SECONDS,
	CLIP_TRANSITION_MIN_DURATION_SECONDS,
	CLIP_TRANSITION_TYPES,
	TRANSITION_SEAM_TOLERANCE_SECONDS,
	clampClipTransitionDuration,
	findClosestMediaSeam,
	getAudioCrossfadeMaxDuration,
	getTransitionMaxDuration,
	isClipTransitionType,
	reconcileTrackAudioCrossfades,
	reconcileTimelineTransitions,
	reconcileTrackTransitions,
	resolveAudioCrossfade,
	resolveClipTransition,
	type MediaSeam,
	type ResolvedAudioCrossfade,
	type ResolvedClipTransition,
} from "./transitions.js";

export {
	CLIP_TRANSITION_PROGRESS_STOPS,
	easeClipTransitionProgress,
	getClipTransitionLayerPresentation,
	type ClipTransitionLayerPresentation,
	type ClipTransitionRole,
} from "./transition-presentation.js";

export {
	clipTransitionSupportsDirection,
	getClipTransitionTuningControls,
	getClipTransitionTuningValue,
	removeClipTransitionTuningKeyframe,
	resolveClipTransitionTuning,
	transitionTuningDefaults,
	upsertClipTransitionTuningKeyframe,
	type ClipTransitionTuningControl,
	type ResolvedClipTransitionTuning,
} from "./transition-tuning.js";

export {
	isMediaElement,
	isTextElement,
	isStickerElement,
	isAdjustmentElement,
	isCaptionElement,
	isRemotionElement,
	isMarkdownElement,
	getRemotionElements,
	getActiveRemotionElements,
} from "./type-guards.js";

export {
	canElementGoOnTrack,
	validateElementTrackCompatibility,
} from "./validation.js";
