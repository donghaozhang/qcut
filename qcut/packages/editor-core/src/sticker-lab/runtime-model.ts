export type StickerRuntimeCompletion = "freeze-last" | "hide";

export type StickerRuntimeRepeat =
	/** GIF-style repeats after the first iteration; zero means play once. */
	{ kind: "finite"; additionalIterations: number } | { kind: "infinite" };

export interface StickerRuntimeTimelineWindow {
	timelineStartSeconds: number;
	/** Half-open interval: a sticker is inactive exactly at start + duration. */
	timelineDurationSeconds: number;
	/** Accumulated source phase retained when a clip is split or trimmed. */
	sourceOffsetSeconds?: number;
}

export interface StickerRuntimePixelRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface StickerRuntimePixelSize {
	width: number;
	height: number;
}

export interface StickerRuntimeNormalizedRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface StickerRuntimeFrameBase {
	startSeconds: number;
	durationSeconds: number;
}

export interface DirectGifRuntimeFrame extends StickerRuntimeFrameBase {
	/** Original container value. durationSeconds includes explicit zero-delay policy. */
	delayCentiseconds: number;
	disposalMethod: number;
	frameRect: StickerRuntimePixelRect;
	hasTransparency: boolean;
	transparentColorIndex?: number;
}

export interface DirectGifRuntimeDescriptor {
	kind: "direct-gif";
	canvasSize: StickerRuntimePixelSize;
	cycleDurationSeconds: number;
	frames: readonly DirectGifRuntimeFrame[];
	repeat: StickerRuntimeRepeat;
	completion: StickerRuntimeCompletion;
}

export interface AtlasRuntimeFrame extends StickerRuntimeFrameBase {
	id: string;
	frameRect: StickerRuntimePixelRect;
	rotated: boolean;
	trimmed: boolean;
	spriteSourceRect: StickerRuntimePixelRect;
	sourceSize: StickerRuntimePixelSize;
}

export interface AtlasRuntimeDescriptor {
	kind: "atlas-animation";
	atlasSource?: string;
	atlasSize?: StickerRuntimePixelSize;
	cycleDurationSeconds: number;
	frames: readonly AtlasRuntimeFrame[];
	repeat: StickerRuntimeRepeat;
	completion: StickerRuntimeCompletion;
}

export interface PngSequenceRuntimeFrame extends StickerRuntimeFrameBase {
	source: string;
}

export interface PngSequenceRuntimeDescriptor {
	kind: "png-sequence";
	cycleDurationSeconds: number;
	frames: readonly PngSequenceRuntimeFrame[];
	repeat: StickerRuntimeRepeat;
	completion: StickerRuntimeCompletion;
}

export type AlphaVideoMaskChannel = "alpha" | "luma";

export interface AlphaVideoMaskSettings {
	channel: AlphaVideoMaskChannel;
	inverted: boolean;
}

export type AlphaVideoLayout =
	| {
			kind: "embedded-alpha";
	  }
	| {
			kind: "side-by-side";
			colorRect: StickerRuntimeNormalizedRect;
			maskRect: StickerRuntimeNormalizedRect;
			mask: AlphaVideoMaskSettings;
	  }
	| {
			kind: "separate-mask";
			maskSource: string;
			mask: AlphaVideoMaskSettings;
	  };

export interface AlphaVideoProgressKeyframe {
	atSeconds: number;
	sourceProgress: number;
	/** Interpolation from this keyframe to the next keyframe. */
	interpolation: "hold" | "linear";
}

export interface AlphaVideoRuntimeDescriptor {
	kind: "alpha-video";
	source: string;
	sourceDurationSeconds: number;
	cycleDurationSeconds: number;
	layout: AlphaVideoLayout;
	progressKeyframes: readonly AlphaVideoProgressKeyframe[];
	repeat: StickerRuntimeRepeat;
	completion: StickerRuntimeCompletion;
}

export type StickerRuntimeDescriptor =
	| DirectGifRuntimeDescriptor
	| AtlasRuntimeDescriptor
	| PngSequenceRuntimeDescriptor
	| AlphaVideoRuntimeDescriptor;

export type StickerRuntimeInactiveReason =
	| "before-clip"
	| "after-clip"
	| "playback-ended";

export interface StickerRuntimeInactiveState {
	active: false;
	reason: StickerRuntimeInactiveReason;
}

export interface StickerRuntimeActiveStateBase {
	active: true;
	cycleTimeSeconds: number;
	iterationIndex: number;
	sourceTimeSeconds: number;
	frozen: boolean;
}

export interface DirectGifRuntimeState extends StickerRuntimeActiveStateBase {
	kind: "direct-gif";
	frame: DirectGifRuntimeFrame;
	frameElapsedSeconds: number;
	frameIndex: number;
}

export interface AtlasRuntimeState extends StickerRuntimeActiveStateBase {
	kind: "atlas-animation";
	frame: AtlasRuntimeFrame;
	frameElapsedSeconds: number;
	frameIndex: number;
}

export interface PngSequenceRuntimeState extends StickerRuntimeActiveStateBase {
	kind: "png-sequence";
	frame: PngSequenceRuntimeFrame;
	frameElapsedSeconds: number;
	frameIndex: number;
}

export interface AlphaVideoRuntimeState extends StickerRuntimeActiveStateBase {
	kind: "alpha-video";
	layout: AlphaVideoLayout;
	sourceProgress: number;
	sourceTimeInVideoSeconds: number;
}

export type StickerRuntimeActiveState =
	| DirectGifRuntimeState
	| AtlasRuntimeState
	| PngSequenceRuntimeState
	| AlphaVideoRuntimeState;

export type StickerRuntimeState =
	| StickerRuntimeInactiveState
	| StickerRuntimeActiveState;

export class StickerRuntimeError extends Error {
	readonly code:
		| "INVALID_DESCRIPTOR"
		| "INVALID_TIMELINE"
		| "MALFORMED_GIF"
		| "UNSUPPORTED_GIF";

	constructor({
		code,
		message,
	}: {
		code: StickerRuntimeError["code"];
		message: string;
	}) {
		super(message);
		this.name = "StickerRuntimeError";
		this.code = code;
	}
}
