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
	collectTimelineEffectsByTarget,
	getEffectRenderWindow,
	getTimelineEffectsAtTime,
} from "./effect-elements.js";

export {
	CLIP_TRANSITION_MAX_DURATION_SECONDS,
	CLIP_TRANSITION_MASK_SHAPES,
	CLIP_TRANSITION_MIN_DURATION_SECONDS,
	CLIP_TRANSITION_TYPES,
	TRANSITION_SEAM_TOLERANCE_SECONDS,
	clampClipTransitionDuration,
	findClosestMediaSeam,
	getAudioCrossfadeMaxDuration,
	getTransitionMaxDuration,
	isClipTransitionEasing,
	isClipTransitionMaskShape,
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
	isEffectElement,
	isTextElement,
	isStickerElement,
	isAdjustmentElement,
	isCaptionElement,
	isRemotionElement,
	isHyperframesElement,
	isMarkdownElement,
	getRemotionElements,
	getActiveRemotionElements,
	getHyperframesElements,
	getActiveHyperframesElements,
} from "./type-guards.js";

export {
	canElementGoOnTrack,
	validateElementTrackCompatibility,
} from "./validation.js";

export {
	excludeLockedTrackIds,
	findTrackIdsForElements,
	findTrackIdsForGroup,
	getLockedTrackIds,
	preflightLockedTracks,
	type LockAwareTrack,
	type LockViolation,
} from "./lock-contract.js";

export {
	classifyRangeCollision,
	findRangeCollisions,
	planInsertShift,
	planOverwrite,
	rangesOverlap,
	type CollisionMode,
	type InsertPlan,
	type OverwritePlan,
	type RangeCollisionKind,
	type TimeRange,
	type TimelineRangeItem,
} from "./collision-policy.js";

export {
	planMainTrackReorder,
	type MainTrackReorderPlan,
} from "./reorder-plan.js";

export {
	captureMagnetDownstream,
	clampResizeTimelineDelta,
	planMagnetShiftedStartTimes,
	resolveResizeNeighborBounds,
	type MagnetDownstreamSnapshot,
	type ResizeNeighborBounds,
	type TimelineSpan,
} from "./resize-plan.js";

export {
	deriveTimelineLinks,
	resolveRippleDomain,
	type LinkAwareElement,
	type LinkAwareTrack,
	type RippleDomainResolution,
	type TimelineElementLink,
	type TimelineLinkType,
} from "./ripple-plan.js";
