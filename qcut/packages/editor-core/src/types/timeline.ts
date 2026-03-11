/**
 * Timeline domain types — tracks, elements, drag data.
 * Extracted from apps/web/src/types/timeline.ts
 *
 * Platform-agnostic: no React, no Zustand, no Electron imports.
 *
 * @module @qcut/editor-core/types/timeline
 */

/** Media asset types */
export type MediaType = "image" | "video" | "audio";

/** Valid track types in the video editor timeline */
export type TrackType =
	| "media"
	| "text"
	| "audio"
	| "sticker"
	| "captions"
	| "remotion"
	| "markdown";

/**
 * Base interface for all timeline elements.
 * Contains common properties shared across all element types.
 */
interface BaseTimelineElement {
	id: string;
	name: string;
	duration: number;
	startTime: number;
	trimStart: number;
	trimEnd: number;
	hidden?: boolean;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	rotation?: number;
	effectIds?: string[];
}

export interface MediaElement extends BaseTimelineElement {
	type: "media";
	mediaId: string;
	volume?: number;
}

export interface TextElement extends BaseTimelineElement {
	type: "text";
	content: string;
	fontSize: number;
	fontFamily: string;
	color: string;
	backgroundColor: string;
	textAlign: "left" | "center" | "right";
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	textDecoration: "none" | "underline" | "line-through";
	x: number;
	y: number;
	rotation: number;
	opacity: number;
}

export interface StickerElement extends BaseTimelineElement {
	type: "sticker";
	stickerId: string;
	mediaId: string;
	opacity?: number;
}

export interface CaptionElement extends BaseTimelineElement {
	type: "captions";
	text: string;
	language: string;
	confidence?: number;
	source: "transcription" | "manual" | "imported";
}

export interface RemotionElement extends BaseTimelineElement {
	type: "remotion";
	componentId: string;
	componentPath?: string;
	props: Record<string, unknown>;
	renderMode: "live" | "cached";
	opacity?: number;
	scale?: number;
}

export interface MarkdownElement extends BaseTimelineElement {
	type: "markdown";
	markdownContent: string;
	theme: "light" | "dark" | "transparent";
	fontSize: number;
	fontFamily: string;
	padding: number;
	backgroundColor: string;
	textColor: string;
	scrollMode: "static" | "auto-scroll";
	scrollSpeed: number;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	opacity: number;
}

/** Union of all timeline element types */
export type TimelineElement =
	| MediaElement
	| TextElement
	| StickerElement
	| CaptionElement
	| RemotionElement
	| MarkdownElement;

// ---------------------------------------------------------------------------
// Creation types (without id, for addElementToTrack)
// ---------------------------------------------------------------------------

export type CreateMediaElement = Omit<MediaElement, "id">;
export type CreateTextElement = Omit<TextElement, "id">;
export type CreateStickerElement = Omit<StickerElement, "id">;
export type CreateCaptionElement = Omit<CaptionElement, "id">;
export type CreateRemotionElement = Omit<RemotionElement, "id">;
export type CreateMarkdownElement = Omit<MarkdownElement, "id">;
export type CreateTimelineElement =
	| CreateMediaElement
	| CreateTextElement
	| CreateStickerElement
	| CreateCaptionElement
	| CreateRemotionElement
	| CreateMarkdownElement;

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------

export interface TimelineTrack {
	id: string;
	name: string;
	type: TrackType;
	elements: TimelineElement[];
	muted?: boolean;
	isMain?: boolean;
}

// ---------------------------------------------------------------------------
// Drag data types
// ---------------------------------------------------------------------------

export interface MediaItemDragData {
	id: string;
	type: MediaType;
	name: string;
}

export interface TextItemDragData {
	id: string;
	type: "text";
	name: string;
	content: string;
}

export interface StickerItemDragData {
	id: string;
	type: "sticker";
	name: string;
	iconName: string;
}

export interface RemotionItemDragData {
	id: string;
	type: "remotion";
	name: string;
	componentId: string;
	durationInFrames: number;
	fps: number;
}

export interface MarkdownItemDragData {
	id: string;
	type: "markdown";
	name: string;
	markdownContent: string;
}

export type DragData =
	| MediaItemDragData
	| TextItemDragData
	| StickerItemDragData
	| RemotionItemDragData
	| MarkdownItemDragData;
