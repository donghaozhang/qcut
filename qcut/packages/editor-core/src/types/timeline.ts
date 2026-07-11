/**
 * Timeline domain types — tracks, elements, drag data.
 * Extracted from apps/web/src/types/timeline.ts
 *
 * Platform-agnostic: no React, no Zustand, no Electron imports.
 *
 * @module @qcut/editor-core/types/timeline
 */

import type { MediaColorSettings } from "./color.js";
import type { EffectChain, EffectInstance } from "./effects.js";

/** Media asset types */
export type MediaType = "image" | "video" | "audio";

/** Valid track types in the video editor timeline */
export type TrackType =
	| "media"
	| "text"
	| "audio"
	| "sticker"
	| "captions"
	| "adjustment"
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
	/** Full modifier state persisted with the timeline element. */
	effects?: EffectInstance[];
	effectChains?: EffectChain[];
	/** @deprecated Derived compatibility index for projects saved before effect persistence. */
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

export type MediaBlendMode =
	| "normal"
	| "multiply"
	| "screen"
	| "overlay"
	| "darken"
	| "lighten";

export type MediaFitMode = "cover" | "contain" | "fill";

export interface MediaCrop {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface MediaPerspective {
	topLeftX: number;
	topLeftY: number;
	topRightX: number;
	topRightY: number;
	bottomRightX: number;
	bottomRightY: number;
	bottomLeftX: number;
	bottomLeftY: number;
}

export type MediaKeyframeProperty =
	| "x"
	| "y"
	| "scaleX"
	| "scaleY"
	| "rotation"
	| "opacity"
	| "cropTop"
	| "cropRight"
	| "cropBottom"
	| "cropLeft"
	| keyof MediaPerspective;

export interface MediaPropertyKeyframe {
	id: string;
	/** Frame relative to the beginning of the media element. */
	frame: number;
	value: number;
	easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
}

export type MediaAnimationType =
	| "none"
	| "fade"
	| "slide-left"
	| "slide-right"
	| "slide-up"
	| "slide-down"
	| "zoom-in"
	| "zoom-out";

export type ClipTransitionType = "dissolve" | "fade-black" | "slide" | "wipe";

export type ClipTransitionDirection = "left" | "right" | "up" | "down";

export type ClipTransitionEasing = "linear" | "easeInOut";

/** A visual transition joining two touching media elements on one track. */
export interface ClipTransition {
	id: string;
	fromElementId: string;
	toElementId: string;
	presetId: string;
	type: ClipTransitionType;
	duration: number;
	direction?: ClipTransitionDirection;
	easing: ClipTransitionEasing;
}

export type MediaComboAnimationType = "none" | "pulse" | "drift";

export interface MediaAdjustments {
	brightness: number;
	contrast: number;
	saturation: number;
	temperature: number;
	tint: number;
	sharpness: number;
	fade: number;
	vignette: number;
}

export type MediaMaskType =
	| "none"
	| "rectangle"
	| "ellipse"
	| "linear"
	| "mirror"
	| "pen"
	| "text"
	| "star"
	| "heart"
	| "person"
	| "object";

export type MediaMaskBlendMode = "add" | "subtract" | "intersect";

export type MediaMaskKeyframeProperty =
	| "centerX"
	| "centerY"
	| "width"
	| "height"
	| "rotation"
	| "feather"
	| "roundness"
	| "expansion"
	| "opacity";

export interface MediaMaskPoint {
	id?: string;
	x: number;
	y: number;
	handleIn?: { x: number; y: number };
	handleOut?: { x: number; y: number };
}

export type MediaMaskStrokeStyle =
	| "none"
	| "solid"
	| "glow"
	| "offset"
	| "triple"
	| "sketch"
	| "dashed";

export interface MediaMaskStroke {
	style: MediaMaskStrokeStyle;
	color: string;
	width: number;
	opacity: number;
	glow: number;
	offsetX: number;
	offsetY: number;
}

export type MediaMaskTrackingDirection = "forward" | "backward" | "both";

export interface MediaMaskTracking {
	direction: MediaMaskTrackingDirection;
	status?: "idle" | "processing" | "ready" | "error";
	source?: "manual" | "optical-flow" | "mediapipe" | "sam3";
	error?: string;
}

export interface MediaMask {
	/** Stable identity used by the mask stack and per-mask keyframes. */
	id?: string;
	name?: string;
	enabled?: boolean;
	type: MediaMaskType;
	blendMode?: MediaMaskBlendMode;
	centerX: number;
	centerY: number;
	width: number;
	height: number;
	rotation: number;
	feather: number;
	roundness?: number;
	expansion?: number;
	opacity?: number;
	maintainAspectRatio?: boolean;
	invert: boolean;
	points?: MediaMaskPoint[];
	closed?: boolean;
	text?: string;
	fontFamily?: string;
	fontWeight?: "normal" | "bold";
	keyframes?: Partial<
		Record<MediaMaskKeyframeProperty, MediaPropertyKeyframe[]>
	>;
	tracking?: MediaMaskTracking;
	/** Optional alpha media generated by MediaPipe or SAM3. */
	sourceMediaId?: string;
	stroke?: MediaMaskStroke;
}

export type MediaCustomCutoutBrushMode = "foreground" | "background";

export interface MediaCustomCutoutPoint {
	x: number;
	y: number;
}

export interface MediaCustomCutoutStroke {
	id: string;
	/** Timeline frame relative to the beginning of the clip. */
	frame: number;
	mode: MediaCustomCutoutBrushMode;
	size: number;
	points: MediaCustomCutoutPoint[];
}

export interface MediaCustomCutout {
	enabled: boolean;
	applyStrokes: boolean;
	strokes: MediaCustomCutoutStroke[];
	status?: "idle" | "processing" | "ready" | "error";
	error?: string;
	sourceMediaId?: string;
	resultMaskId?: string;
	generatedFrom?: string;
}

export interface MediaChromaKey {
	enabled: boolean;
	color: string;
	similarity: number;
	blend: number;
	shadow: number;
	cleanup: number;
	spill: number;
	keyframes?: Partial<
		Record<MediaChromaKeyKeyframeProperty, MediaPropertyKeyframe[]>
	>;
}

export type MediaChromaKeyKeyframeProperty =
	| "similarity"
	| "blend"
	| "shadow"
	| "cleanup"
	| "spill";

export interface MediaEnhancements {
	stabilization: number;
	denoise: number;
	clarity: number;
	upscale: 1 | 2 | 4;
	relight: number;
	beauty: number;
}

export type AudioKeyframeProperty =
	| "volumeDb"
	| "fadeIn"
	| "fadeOut"
	| "pan"
	| "denoiseAmount"
	| "voiceClarity"
	| "voiceWarmth"
	| "voicePresence"
	| "pitchSemitones"
	| "eqLowGainDb"
	| "eqMidGainDb"
	| "eqHighGainDb"
	| "compressorThresholdDb"
	| "compressorRatio"
	| "reverbMix"
	| "echoMix";

export interface AudioLoudnessSettings {
	enabled: boolean;
	targetLufs: number;
	truePeakDb: number;
	loudnessRange: number;
	measuredLufs?: number;
	measuredTruePeakDb?: number;
	analysisStatus?: "idle" | "analyzing" | "ready" | "error";
	analysisError?: string;
}

export interface AudioDenoiseSettings {
	enabled: boolean;
	amount: number;
	noiseFloorDb: number;
	mode?: "realtime" | "ai";
	status?: "idle" | "processing" | "ready" | "error";
	processedMediaId?: string;
	error?: string;
}

export interface AudioVoiceEnhanceSettings {
	enabled: boolean;
	clarity: number;
	warmth: number;
	presence: number;
}

export interface AudioPitchSettings {
	enabled: boolean;
	semitones: number;
	preserveFormants: boolean;
}

export interface AudioEqualizerSettings {
	enabled: boolean;
	lowGainDb: number;
	midGainDb: number;
	highGainDb: number;
}

export interface AudioCompressorSettings {
	enabled: boolean;
	thresholdDb: number;
	ratio: number;
	attackMs: number;
	releaseMs: number;
	makeupGainDb: number;
}

export interface AudioLimiterSettings {
	enabled: boolean;
	ceilingDb: number;
	releaseMs: number;
}

export interface AudioReverbSettings {
	enabled: boolean;
	mix: number;
	roomSize: number;
	damping: number;
}

export interface AudioEchoSettings {
	enabled: boolean;
	mix: number;
	delayMs: number;
	feedback: number;
}

export interface AudioTelephoneSettings {
	enabled: boolean;
	mix: number;
}

export type AudioChannelMode = "stereo" | "mono" | "left" | "right" | "swap";

export type AudioParametricFilterType =
	| "bell"
	| "low-shelf"
	| "high-shelf"
	| "notch";

export interface AudioParametricEqBand {
	id: string;
	enabled: boolean;
	type: AudioParametricFilterType;
	frequencyHz: number;
	gainDb: number;
	q: number;
}

export interface AudioParametricEqualizerSettings {
	enabled: boolean;
	lowCutHz: number;
	highCutHz: number;
	bands: AudioParametricEqBand[];
}

export interface AudioRepairSettings {
	deEsser: {
		enabled: boolean;
		amount: number;
		frequencyHz: number;
	};
	deReverb: {
		enabled: boolean;
		amount: number;
	};
	deHum: {
		enabled: boolean;
		frequencyHz: 50 | 60;
		harmonics: number;
	};
	dePlosive: {
		enabled: boolean;
		amount: number;
	};
	deClick: {
		enabled: boolean;
		amount: number;
	};
	deClip: {
		enabled: boolean;
		amount: number;
	};
	noiseGate: {
		enabled: boolean;
		thresholdDb: number;
		attackMs: number;
		releaseMs: number;
	};
}

export interface AudioDuckingSettings {
	enabled: boolean;
	sourceTrackIds: string[];
	thresholdDb: number;
	reductionDb: number;
	attackMs: number;
	releaseMs: number;
}

export interface AudioAutoCrossfadeSettings {
	enabled: boolean;
	defaultDuration: number;
	curve: "linear" | "equal-power";
}

export interface AudioCrossfade {
	id: string;
	fromElementId: string;
	toElementId: string;
	duration: number;
	curve: "linear" | "equal-power";
}

export interface AudioBusEffectsSettings {
	parametricEqualizer: AudioParametricEqualizerSettings;
	compressor: AudioCompressorSettings;
	limiter: AudioLimiterSettings;
}

export interface TimelineTrackAudioSettings {
	gainDb: number;
	pan: number;
	solo: boolean;
	busId: string;
	effects: AudioBusEffectsSettings;
	ducking: AudioDuckingSettings;
	autoCrossfade: AudioAutoCrossfadeSettings;
}

export interface AudioMixBusSettings {
	id: string;
	name: string;
	gainDb: number;
	pan: number;
	muted: boolean;
	solo: boolean;
	effects: AudioBusEffectsSettings;
}

export interface ProjectAudioMixSettings {
	master: AudioMixBusSettings;
	buses: AudioMixBusSettings[];
}

export type AudioStemName =
	| "vocals"
	| "instrumental"
	| "drums"
	| "bass"
	| "other"
	| "guitar"
	| "piano";

export interface AudioSeparationSettings {
	enabled: boolean;
	status: "idle" | "processing" | "ready" | "error";
	stemMediaIds?: Partial<Record<AudioStemName, string>>;
	stemGains?: Partial<Record<AudioStemName, number>>;
	error?: string;
}

export interface AudioVoiceConversionSettings {
	enabled: boolean;
	status: "idle" | "processing" | "ready" | "error";
	sourceMediaId?: string;
	inputMediaId?: string;
	sourceStem?: AudioStemName;
	provider?: string;
	model?: string;
	error?: string;
}

export interface AudioCoverSettings {
	enabled: boolean;
	status: "idle" | "separating" | "converting" | "ready" | "error";
	convertedVocalMediaId?: string;
	targetVoiceLabel?: string;
	provider?: string;
	model?: string;
	error?: string;
}

export interface AudioLyricsWord {
	id: string;
	text: string;
	start: number;
	end: number;
	type: "word" | "spacing";
	speakerId?: string;
}

export interface AudioLyricsSettings {
	status: "idle" | "transcribing" | "ready" | "error";
	text: string;
	language?: string;
	words: AudioLyricsWord[];
	sourceMediaId?: string;
	captionTrackId?: string;
	sourceFormat?: "transcription" | "lrc" | "srt" | "vtt";
	speakerNames?: Record<string, string>;
	maxWordsPerLine?: number;
	error?: string;
}

export interface MediaAudioSettings {
	enabled: boolean;
	volumeDb: number;
	fadeIn: number;
	fadeOut: number;
	channelMode: AudioChannelMode;
	panEnabled: boolean;
	pan: number;
	loudness: AudioLoudnessSettings;
	denoise: AudioDenoiseSettings;
	voiceEnhance: AudioVoiceEnhanceSettings;
	pitch: AudioPitchSettings;
	equalizer: AudioEqualizerSettings;
	parametricEqualizer: AudioParametricEqualizerSettings;
	repair: AudioRepairSettings;
	compressor: AudioCompressorSettings;
	limiter: AudioLimiterSettings;
	reverb: AudioReverbSettings;
	echo: AudioEchoSettings;
	telephone: AudioTelephoneSettings;
	separation: AudioSeparationSettings;
	voiceConversion: AudioVoiceConversionSettings;
	cover: AudioCoverSettings;
	lyrics: AudioLyricsSettings;
	keyframes?: Partial<Record<AudioKeyframeProperty, MediaPropertyKeyframe[]>>;
}

export interface MediaElement extends BaseTimelineElement {
	type: "media";
	mediaId: string;
	volume?: number;
	scaleX?: number;
	scaleY?: number;
	maintainAspectRatio?: boolean;
	flipHorizontal?: boolean;
	flipVertical?: boolean;
	opacity?: number;
	blendMode?: MediaBlendMode;
	fitMode?: MediaFitMode;
	crop?: MediaCrop;
	perspective?: MediaPerspective;
	keyframes?: Partial<Record<MediaKeyframeProperty, MediaPropertyKeyframe[]>>;
	animationInType?: MediaAnimationType;
	animationInDuration?: number;
	animationOutType?: MediaAnimationType;
	animationOutDuration?: number;
	comboAnimationType?: MediaComboAnimationType;
	comboAnimationIntensity?: number;
	adjustments?: MediaAdjustments;
	/** Canonical non-destructive color grading state. */
	color?: MediaColorSettings;
	/** Legacy single-mask field retained for project compatibility. */
	mask?: MediaMask;
	/** Ordered non-destructive mask stack. */
	masks?: MediaMask[];
	customCutout?: MediaCustomCutout;
	chromaKey?: MediaChromaKey;
	enhancements?: MediaEnhancements;
	/** Canonical non-destructive audio processing state. */
	audio?: MediaAudioSettings;
	/** Legacy audio fields retained while older projects migrate to `audio`. */
	audioFadeIn?: number;
	audioFadeOut?: number;
	audioNormalize?: boolean;
	audioDenoise?: number;
	audioPan?: number;
	playbackRate?: number;
	speedKeyframes?: MediaPropertyKeyframe[];
	reverse?: boolean;
	freezeFrameTime?: number;
	freezeFrameDuration?: number;
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
	trackingTargetId?: string;
	trackingOffsetX?: number;
	trackingOffsetY?: number;
	trackingRotation?: boolean;
}

export interface StickerElement extends BaseTimelineElement {
	type: "sticker";
	stickerId: string;
	mediaId: string;
	/** Center position as a percentage of the project canvas. */
	x?: number;
	y?: number;
	/** Size as a percentage of the shorter project-canvas dimension. */
	width?: number;
	height?: number;
	rotation?: number;
	opacity?: number;
	maintainAspectRatio?: boolean;
	/** Legacy intra-track order. New projects use element order on the track. */
	zIndex?: number;
}

export interface AdjustmentElement extends BaseTimelineElement {
	type: "adjustment";
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
	words?: AudioLyricsWord[];
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
	| AdjustmentElement
	| CaptionElement
	| RemotionElement
	| MarkdownElement;

// ---------------------------------------------------------------------------
// Creation types (without id, for addElementToTrack)
// ---------------------------------------------------------------------------

export type CreateMediaElement = Omit<MediaElement, "id">;
export type CreateTextElement = Omit<TextElement, "id">;
export type CreateStickerElement = Omit<StickerElement, "id">;
export type CreateAdjustmentElement = Omit<AdjustmentElement, "id">;
export type CreateCaptionElement = Omit<CaptionElement, "id">;
export type CreateRemotionElement = Omit<RemotionElement, "id">;
export type CreateMarkdownElement = Omit<MarkdownElement, "id">;
export type CreateTimelineElement =
	| CreateMediaElement
	| CreateTextElement
	| CreateStickerElement
	| CreateAdjustmentElement
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
	transitions?: ClipTransition[];
	/** Zero-based UI order. Lower values appear higher and composite later. */
	order?: number;
	muted?: boolean;
	audio?: TimelineTrackAudioSettings;
	audioCrossfades?: AudioCrossfade[];
	hidden?: boolean;
	locked?: boolean;
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
