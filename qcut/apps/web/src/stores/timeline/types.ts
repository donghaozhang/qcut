/**
 * Timeline Store Types
 *
 * Store-specific types for the timeline store module.
 * Re-exports shared timeline types from @/types/timeline.
 */

// Re-export shared timeline types
export type {
	TrackType,
	TimelineElement,
	CreateTimelineElement,
	CreateTextElement,
	TimelineTrack,
	TextElement,
	MarkdownElement,
	MediaElement,
	ClipTransition,
	RemotionElement,
	HyperframesElement,
	CaptionElement,
	StickerElement,
	AdjustmentElement,
	SubtitleStyle,
	DragData,
	TimelineTrackAudioSettings,
} from "@/types/timeline";

// Re-export shared timeline utility functions
export {
	sortTracksByOrder,
	ensureMainTrack,
	validateElementTrackCompatibility,
} from "@/types/timeline";

import type {
	TimelineTrack,
	TimelineElement,
	TrackType,
	CreateTimelineElement,
	CreateTextElement,
	TextElement,
	MarkdownElement,
	MediaElement,
	ClipTransition,
	RemotionElement,
	HyperframesElement,
	CaptionElement,
	StickerElement,
	AdjustmentElement,
	DragData,
	TimelineTrackAudioSettings,
	SubtitleStyle,
} from "@/types/timeline";
import type { MediaItem } from "../media/media-store";
import type { EffectChain, EffectInstance } from "@/types/effects";

/**
 * Selected element reference for multi-selection
 */
export interface SelectedElement {
	trackId: string;
	elementId: string;
}

export interface SelectedTransition {
	trackId: string;
	transitionId: string;
}

export type CaptionStyleScope = "element" | "selection" | "track" | "project";

/**
 * Drag operation state for timeline elements
 */
export interface DragState {
	/** Whether a drag operation is currently active */
	isDragging: boolean;
	/** ID of the element being dragged */
	elementId: string | null;
	/** ID of the track containing the dragged element */
	trackId: string | null;
	/** Initial mouse X position when drag started */
	startMouseX: number;
	/** Initial element start time when drag started */
	startElementTime: number;
	/** Time offset from element start where click occurred */
	clickOffsetTime: number;
	/** Current time position during drag */
	currentTime: number;
}

/**
 * Initial drag state constant
 */
export const INITIAL_DRAG_STATE: DragState = {
	isDragging: false,
	elementId: null,
	trackId: null,
	startMouseX: 0,
	startElementTime: 0,
	clickOffsetTime: 0,
	currentTime: 0,
};

/**
 * Operation context for decoupled operation modules
 * Provides state access and mutation methods without Zustand dependencies
 */
export interface OperationContext {
	// State access
	getTracks: () => TimelineTrack[];
	getSelectedElements: () => SelectedElement[];
	isRippleEnabled: () => boolean;

	// State mutation
	updateTracks: (tracks: TimelineTrack[]) => void;
	updateTracksAndSave: (tracks: TimelineTrack[]) => void;
	pushHistory: () => void;

	// Track operations
	addTrack: (type: TrackType) => string;
	insertTrackAt: (type: TrackType, index: number) => string;

	// Cross-cutting concerns
	selectElement: (trackId: string, elementId: string) => void;
	deselectElement: (trackId: string, elementId: string) => void;
}

/**
 * Timeline store interface that manages video editor timeline state
 * Handles tracks, elements, history, and all timeline operations
 */
export interface TimelineStore {
	/** Private track storage - do not access directly, use tracks property instead */
	_tracks: TimelineTrack[];
	/** Undo history stack storing previous timeline states */
	history: TimelineTrack[][];
	/** Redo stack for restoring undone states */
	redoStack: TimelineTrack[][];

	/** Auto-save status message for UI feedback */
	autoSaveStatus: string;
	/** Whether an auto-save operation is currently running */
	isAutoSaving: boolean;
	/** Timestamp (ms) of the last successful auto-save */
	lastAutoSaveAt: number | null;

	/** Always returns properly ordered tracks with main track ensured */
	tracks: TimelineTrack[];

	/** Manual method to force recomputation of track ordering */
	getSortedTracks: () => TimelineTrack[];

	/** Whether snapping to grid and elements is enabled */
	snappingEnabled: boolean;

	/** Toggle snapping on/off */
	toggleSnapping: () => void;

	/** Whether ripple editing mode is enabled (moving elements affects subsequent elements) */
	rippleEditingEnabled: boolean;
	/** Toggle ripple editing mode on/off */
	toggleRippleEditing: () => void;

	/** Whether the effects track is visible in the timeline */
	showEffectsTrack: boolean;
	/** Toggle effects track visibility */
	toggleEffectsTrack: () => void;
	/** Automatically show effects track (called when effects are applied) */
	autoShowEffectsTrack: () => void;

	/** Array of currently selected timeline elements */
	selectedElements: SelectedElement[];
	/** Currently selected clip-to-clip transition. */
	selectedTransition: SelectedTransition | null;
	/** Select an element, optionally as part of multi-selection */
	selectElement: (trackId: string, elementId: string, multi?: boolean) => void;
	/** Deselect a specific element */
	deselectElement: (trackId: string, elementId: string) => void;
	/** Clear all selected elements */
	clearSelectedElements: () => void;
	/** Set the entire selection to the provided elements array */
	setSelectedElements: (elements: SelectedElement[]) => void;
	selectTransition: (selection: SelectedTransition) => void;
	clearSelectedTransition: () => void;

	/** Current drag operation state for timeline elements */
	dragState: DragState;
	/** Update drag state with partial values */
	setDragState: (dragState: Partial<DragState>) => void;
	/** Start a drag operation with initial parameters */
	startDrag: (
		elementId: string,
		trackId: string,
		startMouseX: number,
		startElementTime: number,
		clickOffsetTime: number
	) => void;
	/** Update the current time during drag operation */
	updateDragTime: (currentTime: number) => void;
	/** End the current drag operation */
	endDrag: () => void;

	/** Add a new track of the specified type to the timeline */
	addTrack: (type: TrackType) => string;
	/** Insert a new track at the specified index position */
	insertTrackAt: (type: TrackType, index: number) => string;
	/** Move an existing track to a zero-based UI position */
	moveTrack: (trackId: string, toIndex: number) => void;
	/** Rename an existing track. */
	renameTrack: (trackId: string, name: string) => void;
	/** Remove a track from the timeline */
	removeTrack: (trackId: string) => void;
	/** Remove a track with ripple editing (affects subsequent elements) */
	removeTrackWithRipple: (trackId: string) => void;
	/** Add an element to the specified track */
	addElementToTrack: (
		trackId: string,
		element: CreateTimelineElement,
		options?: { pushHistory?: boolean; selectElement?: boolean }
	) => string | null;
	addTextGroupAtTime: (input: {
		elements: CreateTextElement[];
		currentTime?: number;
		groupId?: string;
	}) => boolean;
	/** Remove an element from a track, optionally pushing to history */
	removeElementFromTrack: (
		trackId: string,
		elementId: string,
		pushHistory?: boolean
	) => void;
	/** Move an element from one track to another */
	moveElementToTrack: (
		fromTrackId: string,
		toTrackId: string,
		elementId: string
	) => void;
	/** Update the trim start and end values for an element */
	updateElementTrim: (
		trackId: string,
		elementId: string,
		trimStart: number,
		trimEnd: number,
		pushHistory?: boolean
	) => void;
	/** Update the duration of an element */
	updateElementDuration: (
		trackId: string,
		elementId: string,
		duration: number,
		pushHistory?: boolean
	) => void;
	/** Update the start time of an element */
	updateElementStartTime: (
		trackId: string,
		elementId: string,
		startTime: number,
		pushHistory?: boolean
	) => void;
	slipElement: (input: {
		trackId: string;
		elementId: string;
		timelineDelta: number;
		pushHistory?: boolean;
	}) => number;
	rollEdit: (input: {
		trackId: string;
		fromElementId: string;
		toElementId: string;
		timelineDelta: number;
		pushHistory?: boolean;
	}) => number;
	addTransition: (input: {
		trackId: string;
		fromElementId: string;
		toElementId: string;
		videoMediaIds: ReadonlySet<string>;
		presetId: string;
		type: ClipTransition["type"];
		duration: number;
		direction?: ClipTransition["direction"];
		easing?: ClipTransition["easing"];
		tuning?: ClipTransition["tuning"];
		maskShape?: ClipTransition["maskShape"];
	}) => string | null;
	updateTransition: (input: {
		trackId: string;
		transitionId: string;
		videoMediaIds: ReadonlySet<string>;
		updates: Partial<
			Pick<
				ClipTransition,
				| "presetId"
				| "type"
				| "duration"
				| "direction"
				| "easing"
				| "tuning"
				| "maskShape"
			>
		>;
	}) => void;
	removeTransition: (input: { trackId: string; transitionId: string }) => void;
	setTransitionAudioCrossfade: (input: {
		trackId: string;
		fromElementId: string;
		toElementId: string;
		duration: number;
		enabled: boolean;
	}) => void;
	/** Toggle mute state for a track */
	toggleTrackMute: (trackId: string) => void;
	/** Update persistent gain, pan, routing, effects, and automation for a track. */
	updateTrackAudio: (
		trackId: string,
		updates: Partial<TimelineTrackAudioSettings>,
		pushHistory?: boolean
	) => void;
	updateTrackHeight: (
		trackId: string,
		height: number,
		pushHistory?: boolean
	) => void;
	setTrackHeightMode: (mode: "compact" | "default") => void;
	groupSelectedElements: () => string | null;
	ungroupElements: (groupId: string) => number;
	createMediaContainerFromSelection: (
		kind: "compound" | "multicam"
	) => string | null;
	breakApartMediaContainer: (trackId: string, elementId: string) => number;
	selectMulticamClip: (
		trackId: string,
		elementId: string,
		clipId: string
	) => boolean;
	/** Toggle track solo while preserving the existing mute state. */
	toggleTrackSolo: (trackId: string) => void;
	/** Toggle whether a visual track participates in preview and export */
	toggleTrackHidden: (trackId: string) => void;
	/** Toggle whether timeline edits are allowed on a track */
	toggleTrackLocked: (trackId: string) => void;
	/** Toggle hidden/visible state for an element */
	toggleElementHidden: (trackId: string, elementId: string) => void;

	// Split operations for elements
	splitElement: (
		trackId: string,
		elementId: string,
		splitTime: number,
		savePushHistory?: boolean
	) => string | null;
	splitAndKeepLeft: (
		trackId: string,
		elementId: string,
		splitTime: number,
		savePushHistory?: boolean
	) => void;
	splitAndKeepRight: (
		trackId: string,
		elementId: string,
		splitTime: number,
		savePushHistory?: boolean
	) => void;
	separateAudio: (trackId: string, elementId: string) => string | null;

	// Get all audio elements for export
	getAudioElements: () => Array<{
		element: TimelineElement;
		trackId: string;
		absoluteStart: number;
	}>;

	// Replace media for an element
	replaceElementMedia: (
		trackId: string,
		elementId: string,
		newFile: File
	) => Promise<{ success: boolean; error?: string }>;

	// Ripple editing functions
	updateElementStartTimeWithRipple: (
		trackId: string,
		elementId: string,
		newStartTime: number
	) => void;
	removeElementFromTrackWithRipple: (
		trackId: string,
		elementId: string,
		pushHistory?: boolean,
		forceRipple?: boolean
	) => void;
	rippleDeleteAcrossTracks: (
		startTime: number,
		endTime: number,
		excludeTrackIds?: string[]
	) => void;
	deleteTimeRange: (request: {
		startTime: number;
		endTime: number;
		trackIds?: string[];
		ripple?: boolean;
		crossTrackRipple?: boolean;
	}) => {
		deletedElements: number;
		splitElements: number;
		totalRemovedDuration: number;
	};

	// Computed values
	getTotalDuration: () => number;
	getProjectThumbnail: (projectId: string) => Promise<string | null>;
	getProjectDuration: (projectId: string) => Promise<number | null>;

	// History actions
	undo: () => void;
	redo: () => void;
	pushHistory: () => void;

	// Persistence actions
	loadProjectTimeline: ({
		projectId,
		sceneId,
	}: {
		projectId: string;
		sceneId?: string;
	}) => Promise<void>;
	saveProjectTimeline: ({
		projectId,
		sceneId,
	}: {
		projectId: string;
		sceneId?: string;
	}) => Promise<void>;
	/** Save timeline immediately without debounce - for critical operations */
	saveImmediate: () => Promise<void>;
	clearTimeline: () => void;
	/** Restore timeline tracks (for rollback on load failure) */
	restoreTracks: (tracks: TimelineTrack[]) => void;
	updateTextElement: (
		trackId: string,
		elementId: string,
		updates: Partial<
			Pick<
				TextElement,
				| "content"
				| "fontSize"
				| "fontFamily"
				| "color"
				| "backgroundColor"
				| "textAlign"
				| "fontWeight"
				| "fontStyle"
				| "textDecoration"
				| "x"
				| "y"
				| "rotation"
				| "opacity"
				| "width"
				| "height"
				| "letterSpacing"
				| "lineHeight"
				| "verticalAlign"
				| "strokeColor"
				| "strokeWidth"
				| "strokeOpacity"
				| "backgroundOpacity"
				| "backgroundRadius"
				| "backgroundPadding"
				| "shadowColor"
				| "shadowOpacity"
				| "shadowOffsetX"
				| "shadowOffsetY"
				| "shadowBlur"
				| "glowColor"
				| "glowOpacity"
				| "glowBlur"
				| "curve"
				| "animationType"
				| "animationDuration"
				| "animationDelay"
				| "keyframes"
				| "blendMode"
				| "trackingTargetId"
				| "trackingOffsetX"
				| "trackingOffsetY"
				| "trackingRotation"
			>
		>,
		pushHistory?: boolean
	) => void;
	updateTextGroupContents: ({
		contents,
		groupId,
		pushHistory,
	}: {
		contents: readonly string[];
		groupId: string;
		pushHistory?: boolean;
	}) => number;
	updateCaptionElement: (
		trackId: string,
		elementId: string,
		updates: Partial<Pick<CaptionElement, "text" | "language" | "style">>,
		pushHistory?: boolean
	) => void;
	applyCaptionStyle: ({
		trackId,
		elementId,
		style,
		scope,
		pushHistory,
	}: {
		trackId: string;
		elementId: string;
		style: Partial<SubtitleStyle>;
		scope: CaptionStyleScope;
		pushHistory?: boolean;
	}) => number;
	updateStickerElement: (
		trackId: string,
		elementId: string,
		updates: Partial<
			Pick<
				StickerElement,
				| "x"
				| "y"
				| "width"
				| "height"
				| "rotation"
				| "opacity"
				| "maintainAspectRatio"
				| "zIndex"
			>
		>,
		pushHistory?: boolean
	) => void;
	updateMarkdownElement: (
		trackId: string,
		elementId: string,
		updates: Partial<
			Pick<
				MarkdownElement,
				| "markdownContent"
				| "theme"
				| "fontSize"
				| "fontFamily"
				| "padding"
				| "backgroundColor"
				| "textColor"
				| "scrollMode"
				| "scrollSpeed"
				| "duration"
				| "x"
				| "y"
				| "width"
				| "height"
				| "rotation"
				| "opacity"
			>
		>,
		pushHistory?: boolean
	) => void;
	updateAdjustmentElement: (
		trackId: string,
		elementId: string,
		updates: Partial<
			Pick<
				AdjustmentElement,
				| "name"
				| "duration"
				| "opacity"
				| "color"
				| "adjustments"
				| "effects"
				| "effectChains"
			>
		>,
		pushHistory?: boolean
	) => void;

	// Interactive element manipulation (for effects)
	setElementEffectState: ({
		elementId,
		effects,
		effectChains,
		pushHistory,
	}: {
		elementId: string;
		effects: EffectInstance[];
		effectChains: EffectChain[];
		pushHistory?: boolean;
	}) => void;
	// Batched transform updater - use this to update multiple properties atomically and avoid history spam
	updateElementTransform: (
		elementId: string,
		updates: {
			position?: { x: number; y: number };
			size?: { width: number; height: number; x?: number; y?: number };
			rotation?: number;
		},
		options?: { pushHistory?: boolean }
	) => void;
	// Individual transform updaters - these delegate to updateElementTransform internally
	updateElementPosition: (
		elementId: string,
		position: { x: number; y: number }
	) => void;
	updateElementSize: (
		elementId: string,
		size: { width: number; height: number; x?: number; y?: number }
	) => void;
	updateElementRotation: (elementId: string, rotation: number) => void;
	updateMediaElement: (
		trackId: string,
		elementId: string,
		updates: Partial<
			Pick<
				MediaElement,
				| "mediaId"
				| "name"
				| "duration"
				| "trimStart"
				| "trimEnd"
				| "volume"
				| "x"
				| "y"
				| "width"
				| "height"
				| "rotation"
				| "effectIds"
				| "colorLabel"
				| "scaleX"
				| "scaleY"
				| "maintainAspectRatio"
				| "flipHorizontal"
				| "flipVertical"
				| "opacity"
				| "blendMode"
				| "fitMode"
				| "crop"
				| "perspective"
				| "keyframes"
				| "animationInType"
				| "animationInDuration"
				| "animationOutType"
				| "animationOutDuration"
				| "comboAnimationType"
				| "comboAnimationIntensity"
				| "adjustments"
				| "color"
				| "mask"
				| "masks"
				| "customCutout"
				| "chromaKey"
				| "enhancements"
				| "audio"
				| "audioFadeIn"
				| "audioFadeOut"
				| "audioNormalize"
				| "audioDenoise"
				| "audioPan"
				| "playbackRate"
				| "speedKeyframes"
				| "reverse"
				| "freezeFrameTime"
				| "freezeFrameDuration"
			>
		>,
		pushHistory?: boolean
	) => void;
	updateRemotionElement: (
		trackId: string,
		elementId: string,
		updates: Partial<
			Pick<RemotionElement, "props" | "renderMode" | "opacity" | "scale">
		>,
		pushHistory?: boolean
	) => void;
	updateHyperframesElement: (
		trackId: string,
		elementId: string,
		updates: Partial<
			Pick<
				HyperframesElement,
				| "variableValues"
				| "renderMode"
				| "opacity"
				| "scale"
				| "duration"
				| "durationIsEstimated"
				| "trimStart"
				| "trimEnd"
			>
		>,
		pushHistory?: boolean
	) => void;
	checkElementOverlap: (
		trackId: string,
		startTime: number,
		duration: number,
		excludeElementId?: string
	) => boolean;
	findOrCreateTrack: (trackType: TrackType) => string;
	addMediaAtTime: (item: MediaItem, currentTime?: number) => boolean;
	addTextAtTime: (item: Partial<TextElement>, currentTime?: number) => boolean;
	addMarkdownAtTime: (item: MarkdownElement, currentTime?: number) => boolean;
	addMediaToNewTrack: (item: MediaItem) => boolean;
	addTextToNewTrack: (item: TextElement | DragData) => boolean;
	addMarkdownToNewTrack: (item: MarkdownElement | DragData) => boolean;

	// Effects-related methods
	/**
	 * Add an effect to a timeline element
	 * @param elementId - ID of the element to add effect to
	 * @param effectId - ID of the effect to add
	 * @side-effects Pushes to history for undo/redo, updates tracks, triggers auto-save
	 */
	addEffectToElement: (elementId: string, effectId: string) => void;

	/**
	 * Remove an effect from a timeline element
	 * @param elementId - ID of the element to remove effect from
	 * @param effectId - ID of the effect to remove
	 * @side-effects Pushes to history for undo/redo, updates tracks, triggers auto-save
	 */
	removeEffectFromElement: (elementId: string, effectId: string) => void;

	/**
	 * Get all effect IDs for a timeline element
	 * @param elementId - ID of the element to get effects for
	 * @returns Array of effect IDs, empty array if element has no effects or doesn't exist
	 */
	getElementEffectIds: (elementId: string) => string[];

	/**
	 * Clear all effects from a timeline element
	 * @param elementId - ID of the element to clear effects from
	 * @side-effects Pushes to history for undo/redo, updates tracks, triggers auto-save
	 */
	clearElementEffects: (elementId: string) => void;
}
