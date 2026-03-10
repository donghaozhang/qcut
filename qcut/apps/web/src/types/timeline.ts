// Domain types re-exported from @qcut/editor-core
export type {
	MediaType,
	TrackType,
	MediaElement,
	TextElement,
	StickerElement,
	CaptionElement,
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
} from "@qcut/editor-core";

// Re-export domain functions from @qcut/editor-core
export {
	sortTracksByOrder,
	getMainTrack,
	ensureMainTrack,
	canElementGoOnTrack,
	validateElementTrackCompatibility,
	isMediaElement,
	isTextElement,
	isStickerElement,
	isCaptionElement,
	isRemotionElement,
	isMarkdownElement,
	getRemotionElements,
	getActiveRemotionElements,
	generateUUID,
} from "@qcut/editor-core";

// ---------------------------------------------------------------------------
// React/UI-specific types (stay in apps/web, not in editor-core)
// ---------------------------------------------------------------------------

import type {
	TimelineElement as _TimelineElement,
	TimelineTrack as _TimelineTrack,
} from "@qcut/editor-core";

export interface TimelineElementProps {
	element: _TimelineElement;
	track: _TimelineTrack;
	zoomLevel: number;
	isSelected: boolean;
	onElementMouseDown: (e: React.MouseEvent, element: _TimelineElement) => void;
	onElementClick: (e: React.MouseEvent, element: _TimelineElement) => void;
}

export interface ResizeState {
	elementId: string;
	side: "left" | "right";
	startX: number;
	initialTrimStart: number;
	initialTrimEnd: number;
}
