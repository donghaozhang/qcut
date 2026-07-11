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
	TRANSITION_SEAM_TOLERANCE_SECONDS,
	findClosestMediaSeam,
	getAudioCrossfadeMaxDuration,
	getTransitionMaxDuration,
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
