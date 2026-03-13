/**
 * @qcut/editor-core type exports
 * @module @qcut/editor-core/types
 */

export type {
	BackgroundType,
	CanvasSize,
	CanvasMode,
	CanvasPreset,
} from "./editor.js";

export type {
	BlurIntensity,
	Scene,
	TProject,
} from "./project.js";

export type {
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
} from "./timeline.js";

export type {
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
} from "./captions.js";

export type {
	TranscriptionWord as PersistedTranscriptionWord,
	TranscriptionSegment as PersistedTranscriptionSegment,
	PersistedTranscription,
	TranscriptionAvailability,
} from "./transcription.js";
