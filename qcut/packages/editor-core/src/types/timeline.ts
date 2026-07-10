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
	/** 8-color visual label for clip organization (violet/blue/green/yellow/red/rose/orange/mango) */
	colorLabel?: string;
}

export type TextKeyframeProperty =
	| "x"
	| "y"
	| "rotation"
	| "opacity"
	| "fontSize";

export interface TextPropertyKeyframe {
	id: string;
	/** Frame relative to the beginning of the text element. */
	frame: number;
	value: number;
	easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
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
	/** Horizontal character spacing in canvas pixels. */
	letterSpacing?: number;
	/** Line-height multiplier, where 1 is the font size. */
	lineHeight?: number;
	verticalAlign?: "top" | "middle" | "bottom";
	strokeColor?: string;
	strokeWidth?: number;
	strokeOpacity?: number;
	backgroundOpacity?: number;
	backgroundRadius?: number;
	backgroundPadding?: number;
	shadowColor?: string;
	shadowOpacity?: number;
	shadowOffsetX?: number;
	shadowOffsetY?: number;
	shadowBlur?: number;
	glowColor?: string;
	glowOpacity?: number;
	glowBlur?: number;
	/** Total text arc in degrees. Negative bends upward, positive bends downward. */
	curve?: number;
	animationType?: "none" | "fade" | "slide-up" | "slide-left";
	animationDuration?: number;
	animationDelay?: number;
	keyframes?: Partial<Record<TextKeyframeProperty, TextPropertyKeyframe[]>>;
	blendMode?:
		| "normal"
		| "multiply"
		| "screen"
		| "overlay"
		| "darken"
		| "lighten";
}

export interface StickerElement extends BaseTimelineElement {
	type: "sticker";
	stickerId: string;
	mediaId: string;
	opacity?: number;
}

/** Visual style properties for subtitle/caption elements */
export interface SubtitleStyle {
	fontFamily: string;
	fontSize: number;
	fontColor: string;
	fontOpacity: number;
	bold: boolean;
	italic: boolean;
	underline: boolean;
	outlineColor: string;
	outlineWidth: number;
	shadowColor: string;
	shadowOffset: { x: number; y: number };
	backgroundColor: string;
	bgOpacity: number;
	position: {
		align: "top" | "center" | "bottom";
		x: number;
		y: number;
	};
	lineSpacing: number;
	/** Karaoke animation mode (default: "none" — static subtitles) */
	karaokeMode?:
		| "none"
		| "word-highlight"
		| "word-by-word"
		| "karaoke"
		| "bounce"
		| "typewriter";
	/** Highlight color for active/completed words (default: "#ffff00") */
	highlightColor?: string;
	/** Color for upcoming (not-yet-reached) words in karaoke-fill mode */
	upcomingColor?: string;
	/** Scale factor for the active word (default: 1.15) */
	highlightScale?: number;
}

export interface CaptionElement extends BaseTimelineElement {
	type: "captions";
	text: string;
	language: string;
	confidence?: number;
	source: "transcription" | "manual" | "imported";
	style?: SubtitleStyle;
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
	/** Full style payload for template drags; older drag data can omit it. */
	textTemplate?: Partial<TextElement>;
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
