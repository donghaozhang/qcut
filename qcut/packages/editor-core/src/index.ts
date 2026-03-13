/**
 * @qcut/editor-core — Platform-agnostic editor domain logic for QCut.
 *
 * This package contains:
 * - Domain types (timeline, project, editor, captions)
 * - Timeline utility functions (track management, element operations)
 * - Type guards and validation
 * - History/undo-redo command pattern
 * - Storage provider interface
 *
 * No React, Zustand, or Electron dependencies.
 *
 * @module @qcut/editor-core
 */

// Types
export type {
	BackgroundType,
	CanvasSize,
	CanvasMode,
	CanvasPreset,
	BlurIntensity,
	Scene,
	TProject,
	MediaType,
	TrackType,
	MediaElement,
	TextElement,
	StickerElement,
	CaptionElement,
	SubtitleStyle,
	RemotionElement,
	MarkdownElement,
	TimelineElement,
	CreateMediaElement,
	CreateTextElement,
	CreateStickerElement,
	CreateCaptionElement,
	CreateRemotionElement,
	CreateMarkdownElement,
	CreateTimelineElement,
	TimelineTrack,
	MediaItemDragData,
	TextItemDragData,
	StickerItemDragData,
	RemotionItemDragData,
	MarkdownItemDragData,
	DragData,
	TranscriptionSegment,
	TranscriptionResult,
	TranscriptionRequest,
	TranscriptionError,
	CaptionSegment,
	CaptionTrackData,
	TranscriptionStatus,
	TranscriptionProgress,
	CaptionFormat,
	CaptionExportOptions,
} from "./types/index.js";

// Timeline utilities
export {
	sortTracksByOrder,
	getMainTrack,
	ensureMainTrack,
	getTrackName,
	createTrack,
	getEffectiveDuration,
	getElementEndTime,
	getElementNameWithSuffix,
	isMediaElement,
	isTextElement,
	isStickerElement,
	isCaptionElement,
	isRemotionElement,
	isMarkdownElement,
	getRemotionElements,
	getActiveRemotionElements,
	canElementGoOnTrack,
	validateElementTrackCompatibility,
} from "./timeline/index.js";

// Commands (history/undo-redo)
export {
	type HistoryState,
	createHistory,
	pushState,
	undo,
	redo,
	canUndo,
	canRedo,
	clearHistory,
} from "./commands/index.js";

// Storage interface
export type { EditorStorageProvider } from "./storage/index.js";

// Transcription persistence types
export type {
	PersistedTranscriptionWord,
	PersistedTranscriptionSegment,
	PersistedTranscription,
	TranscriptionAvailability,
} from "./types/index.js";

// Search
export {
	searchTranscriptions,
	type SearchResult,
	type SearchOptions,
} from "./search/index.js";

// Utils
export { generateUUID } from "./utils.js";
