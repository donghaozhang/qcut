/**
 * FFmpeg Handler Type Definitions
 *
 * All TypeScript interfaces for FFmpeg operations.
 * Extracted for reuse across modules and renderer process typings.
 */

import type { AudioSettings } from "./audio-settings";
import type { VideoColorSettings } from "./color-settings";

/**
 * Audio file configuration for FFmpeg video export
 * Defines audio track placement and mixing parameters
 */
export interface AudioFile {
	elementId?: string;
	trackId?: string;
	/** File system path to the audio file */
	path: string;
	/** Start time in seconds for audio placement in video */
	startTime: number;
	/** Audio volume level (0.0-1.0, optional) */
	volume?: number;
	/** Per-derived-source gain, used when one clip resolves to multiple stems. */
	sourceGain?: number;
	/** Trim offset within the source audio/video in seconds */
	trimStart?: number;
	/** Trim offset from the end of the source in seconds */
	trimEnd?: number;
	/** Maximum source duration to include in seconds */
	duration?: number;
	fadeIn?: number;
	fadeOut?: number;
	normalize?: boolean;
	denoise?: number;
	pan?: number;
	audio?: AudioSettings;
	playbackRate?: number;
	speedKeyframes?: Array<{
		id: string;
		frame: number;
		value: number;
		easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
	}>;
	reverse?: boolean;
	freezeFrameTime?: number;
	freezeFrameDuration?: number;
}

export interface AudioCrossfade {
	id: string;
	trackId: string;
	fromElementId: string;
	toElementId: string;
	duration: number;
	curve: "linear" | "equal-power";
}

export interface AudioParametricEqBand {
	id: string;
	enabled: boolean;
	type: "bell" | "low-shelf" | "high-shelf" | "notch";
	frequencyHz: number;
	gainDb: number;
	q: number;
}

export interface AudioBusEffects {
	parametricEqualizer: {
		enabled: boolean;
		lowCutHz: number;
		highCutHz: number;
		bands: AudioParametricEqBand[];
	};
	compressor: {
		enabled: boolean;
		thresholdDb: number;
		ratio: number;
		attackMs: number;
		releaseMs: number;
		makeupGainDb: number;
	};
	limiter: { enabled: boolean; ceilingDb: number; releaseMs: number };
}

export interface AudioMixBus {
	id: string;
	name: string;
	gainDb: number;
	pan: number;
	muted: boolean;
	solo: boolean;
	effects: AudioBusEffects;
}

export interface AudioTrackMix {
	trackId: string;
	muted: boolean;
	gainDb: number;
	pan: number;
	solo: boolean;
	busId: string;
	effects: AudioBusEffects;
	ducking: {
		enabled: boolean;
		sourceTrackIds: string[];
		thresholdDb: number;
		reductionDb: number;
		attackMs: number;
		releaseMs: number;
	};
}

export interface AudioMixConfig {
	master: AudioMixBus;
	buses: AudioMixBus[];
	tracks: AudioTrackMix[];
}

/** Options for rendering the timeline audio mix to a standalone MP3 file. */
export interface AudioExportOptions {
	outputPath: string;
	duration: number;
	audioFiles: AudioFile[];
	bitrate: number;
	sampleRate: number;
	channels?: 1 | 2;
	audioMixConfig?: AudioMixConfig;
	audioCrossfades?: AudioCrossfade[];
}

/** Result of a standalone audio export. */
export interface AudioExportResult {
	outputPath: string;
	fileSize: number;
}

export interface AudioWaveformOptions {
	sourcePath: string;
	duration: number;
	peakCount?: number;
	band?: "bass" | "mid" | "treble" | "full";
}

export interface AudioWaveformResult {
	duration: number;
	values: Float32Array;
	cacheHit: boolean;
}

/** Options for converting a temporary video export to GIF. */
export interface GifConversionOptions {
	sessionId: string;
	inputPath: string;
	width: number;
	height: number;
	fps: number;
	loop: boolean;
	quality: number;
}

/**
 * Video source configuration for direct copy optimization
 * Contains file path and timing information for video elements
 */
export interface VideoSource {
	elementId?: string;
	trackId?: string;
	/** UI order, top to bottom. Lower values composite later. */
	trackOrder?: number;
	elementOrder?: number;
	/** File system path to the video file */
	path: string;
	/** Start time in the final timeline (seconds) */
	startTime: number;
	/** Duration to use from this video (seconds) */
	duration: number;
	/** Trim start time within the source video (seconds) */
	trimStart?: number;
	/** Trim end time within the source video (seconds) */
	trimEnd?: number;
	playbackRate?: number;
	speedKeyframes?: Array<{
		id: string;
		frame: number;
		value: number;
		easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
	}>;
	reverse?: boolean;
	freezeFrameTime?: number;
	freezeFrameDuration?: number;
	visual?: VideoVisual;
	effectFilter?: string;
	effectRenderProgram?: EffectRenderProgram;
	effectOverlaySources?: EffectOverlaySource[];
	effectPersonSources?: EffectPersonSource[];
	effectDistortionSources?: EffectDistortionSource[];
	effectAudioReactiveEnvelopes?: EffectAudioReactiveEnvelope[];
}

export interface EffectOverlaySource {
	resourceId: string;
	stageIndex: number;
	path: string;
	animated: boolean;
	/**
	 * Present for baked procedural frame sequences: `path` is then an image2
	 * pattern (…/f_%05d.png) consumed with -framerate instead of -loop.
	 */
	sequence?: { framerate: number };
	inputIndex?: number;
}

/**
 * Baked remap coordinate maps for one distortion render stage. Paths are
 * concrete PGM files for static variants or image2 patterns (…/f_%05d.pgm)
 * for animated ones.
 */
export interface EffectDistortionSource {
	stageIndex: number;
	xmapPath: string;
	ymapPath: string;
	animated: boolean;
	sequence?: { framerate: number };
	xmapInputIndex?: number;
	ymapInputIndex?: number;
}

export interface VideoTransition {
	id: string;
	trackId: string;
	fromElementId: string;
	toElementId: string;
	presetId: string;
	type:
		| "dissolve"
		| "fade-black"
		| "fade-white"
		| "slide"
		| "wipe"
		| "push"
		| "zoom-blur"
		| "whip-pan"
		| "flash"
		| "light-leak"
		| "rgb-glitch"
		| "shake"
		| "motion-blur"
		| "pixelate"
		| "water-ripple"
		| "particle-dissolve"
		| "glass-refraction"
		| "page-flip"
		| "texture-mask"
		| "lens-flare";
	direction?: "left" | "right" | "up" | "down";
	easing: "linear" | "easeInOut";
	duration: number;
	tuning?: {
		tint?: string;
		intensity?: number;
		frequency?: number;
	};
	maskShape?: string;
}

export interface VideoMask {
	id?: string;
	name?: string;
	enabled?: boolean;
	type:
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
	blendMode?: "add" | "subtract" | "intersect";
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
	points?: Array<{
		id?: string;
		x: number;
		y: number;
		handleIn?: { x: number; y: number };
		handleOut?: { x: number; y: number };
	}>;
	closed?: boolean;
	text?: string;
	fontFamily?: string;
	fontWeight?: "normal" | "bold";
	keyframes?: Partial<
		Record<
			string,
			Array<{
				id: string;
				frame: number;
				value: number;
				easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
			}>
		>
	>;
	sourceMediaId?: string;
	stroke?: {
		style:
			| "none"
			| "solid"
			| "glow"
			| "offset"
			| "triple"
			| "sketch"
			| "dashed";
		color: string;
		width: number;
		opacity: number;
		glow: number;
		offsetX: number;
		offsetY: number;
	};
}

export interface VideoVisual {
	x: number;
	y: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
	flipHorizontal: boolean;
	flipVertical: boolean;
	opacity: number;
	blendMode:
		| "normal"
		| "multiply"
		| "screen"
		| "overlay"
		| "darken"
		| "lighten";
	fitMode: "cover" | "contain" | "fill";
	crop: { top: number; right: number; bottom: number; left: number };
	perspective: {
		topLeftX: number;
		topLeftY: number;
		topRightX: number;
		topRightY: number;
		bottomRightX: number;
		bottomRightY: number;
		bottomLeftX: number;
		bottomLeftY: number;
	};
	animationInType?:
		| "none"
		| "fade"
		| "slide-left"
		| "slide-right"
		| "slide-up"
		| "slide-down"
		| "zoom-in"
		| "zoom-out";
	animationInDuration?: number;
	animationOutType?:
		| "none"
		| "fade"
		| "slide-left"
		| "slide-right"
		| "slide-up"
		| "slide-down"
		| "zoom-in"
		| "zoom-out";
	animationOutDuration?: number;
	comboAnimationType?: "none" | "pulse" | "drift";
	comboAnimationIntensity?: number;
	adjustments?: {
		brightness: number;
		contrast: number;
		saturation: number;
		temperature: number;
		tint: number;
		sharpness: number;
		fade: number;
		vignette: number;
	};
	color?: VideoColorSettings;
	mask?: VideoMask;
	masks?: VideoMask[];
	customCutout?: {
		enabled: boolean;
		applyStrokes: boolean;
		strokes: Array<{
			id: string;
			frame: number;
			mode: "foreground" | "background";
			size: number;
			points: Array<{ x: number; y: number }>;
		}>;
		status?: "idle" | "processing" | "ready" | "error";
		error?: string;
		sourceMediaId?: string;
		resultMaskId?: string;
		generatedFrom?: string;
	};
	chromaKey?: {
		enabled: boolean;
		color: string;
		similarity: number;
		blend: number;
		shadow: number;
		cleanup: number;
		spill: number;
		keyframes?: Partial<
			Record<
				"similarity" | "blend" | "shadow" | "cleanup" | "spill",
				Array<{
					id: string;
					frame: number;
					value: number;
					easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
				}>
			>
		>;
	};
	enhancements?: {
		stabilization: number;
		denoise: number;
		clarity: number;
		upscale: 1 | 2 | 4;
		relight: number;
		beauty: number;
	};
	keyframes?: Partial<
		Record<
			string,
			Array<{
				id: string;
				frame: number;
				value: number;
				easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
			}>
		>
	>;
	keyframeFps: number;
}

/**
 * Image source configuration for FFmpeg overlay
 * Contains file path, timing, and dimension information for image compositing
 */
export interface ImageSource {
	/** File system path to the image file */
	path: string;
	trackId?: string;
	trackOrder?: number;
	elementOrder?: number;
	/** Start time in seconds for image appearance */
	startTime: number;
	/** Duration in seconds for image display */
	duration: number;
	/** Original image width in pixels (optional) */
	width?: number;
	/** Original image height in pixels (optional) */
	height?: number;
	/** Trim start time (usually 0 for images) */
	trimStart: number;
	/** Trim end time (usually 0 for images) */
	trimEnd: number;
	/** Element identifier for debugging */
	elementId: string;
	visual?: VideoVisual;
	effectFilter?: string;
	effectRenderProgram?: EffectRenderProgram;
	effectOverlaySources?: EffectOverlaySource[];
	effectPersonSources?: EffectPersonSource[];
	effectDistortionSources?: EffectDistortionSource[];
	effectAudioReactiveEnvelopes?: EffectAudioReactiveEnvelope[];
}

/**
 * Sticker source configuration for FFmpeg overlay
 * Contains file path and positioning information for stickers
 */
export interface StickerSource {
	/** Unique identifier for the sticker */
	id: string;
	/** Whether the source contains multiple animation frames */
	animated?: boolean;
	trackId?: string;
	trackOrder?: number;
	elementOrder?: number;
	/** File system path to the sticker image */
	path: string;
	/** X position in pixels (top-left corner) */
	x: number;
	/** Y position in pixels (top-left corner) */
	y: number;
	/** Width in pixels */
	width: number;
	/** Height in pixels */
	height: number;
	/** Start time in seconds for sticker appearance */
	startTime: number;
	/** End time in seconds for sticker disappearance */
	endTime: number;
	/** Layer order (higher = on top) */
	zIndex: number;
	/** Opacity (0-1, optional) */
	opacity?: number;
	/** Rotation in degrees (optional) */
	rotation?: number;
	/** Preserve original aspect ratio during scaling */
	maintainAspectRatio?: boolean;
}

export interface TextAssLayer {
	content: string;
	blendMode: NonNullable<VideoVisual["blendMode"]>;
	trackOrder?: number;
	elementOrder?: number;
}

/**
 * Configuration options for video export operations
 * Contains all parameters needed for FFmpeg video generation
 */
export interface ExportOptions {
	/** Unique identifier for the export session */
	sessionId: string;
	/** Output video width in pixels */
	width: number;
	/** Output video height in pixels */
	height: number;
	/** Target frames per second */
	fps: number;
	/** Quality preset affecting encoding parameters */
	quality: "high" | "medium" | "low";
	/** Duration of the video in seconds (replaces hardcoded 10s limit) */
	duration: number;
	/** Optional array of audio files to mix into the video */
	audioFiles?: AudioFile[];
	audioCrossfades?: AudioCrossfade[];
	audioMixConfig?: AudioMixConfig;
	/** Optional FFmpeg filter chain string for video effects */
	filterChain?: string;
	/** Optional FFmpeg drawtext filter chain for text overlays */
	textFilterChain?: string;
	/** Ordered ASS documents for advanced text overlays and blend modes */
	textAssLayers?: TextAssLayer[];
	/** Optional FFmpeg overlay filter chain for stickers */
	stickerFilterChain?: string;
	/** Sticker image sources for overlay (when stickerFilterChain is provided) */
	stickerSources?: StickerSource[];
	/** Optional FFmpeg overlay filter chain for images */
	imageFilterChain?: string;
	/** Image sources for overlay (when imageFilterChain is provided) */
	imageSources?: ImageSource[];
	/** Enable direct video copy/concat optimization (skips frame rendering) */
	useDirectCopy?: boolean;
	/** Video sources for direct copy optimization (when useDirectCopy=true) */
	videoSources?: VideoSource[];
	videoTransitions?: VideoTransition[];
	/** Use video file instead of frames (Mode 2 optimization) */
	useVideoInput?: boolean;
	/** Direct video file path for Mode 2 */
	videoInputPath?: string;
	/** Video trim start time in seconds */
	trimStart?: number;
	/** Video trim end time in seconds */
	trimEnd?: number;
	/** Optimization strategy for export mode selection (Mode 1, 1.5, 2, or image-video-composite) */
	optimizationStrategy?:
		| "direct-copy"
		| "direct-video-with-filters"
		| "video-normalization"
		| "image-video-composite";
	/** Optional keep segments for transcription-aware cut export mode */
	wordFilterSegments?: Array<{
		start: number;
		end: number;
	}>;
	/** Audio crossfade duration used between keep segments in word filter mode */
	crossfadeMs?: number;
	backgroundColor?: string;
}

/**
 * Options for processing a single frame through FFmpeg filters
 */
export interface FrameProcessOptions {
	/** Export session identifier */
	sessionId: string;
	/** Input frame filename (e.g., "raw_frame-0001.png") */
	inputFrameName: string;
	/** Output frame filename (e.g., "frame-0001.png") */
	outputFrameName: string;
	/** FFmpeg filter chain to apply */
	filterChain: string;
}

export interface VideoFramePreviewOptions {
	requestId: string;
	sourcePath: string;
	sourceTime: number;
	width: number;
	height: number;
	fps: number;
	fitMode: VideoVisual["fitMode"];
	enhancements: NonNullable<VideoVisual["enhancements"]>;
}

export interface VideoFramePreviewResult {
	requestId: string;
	pngData: Uint8Array;
	cacheHit: boolean;
	sourceTime: number;
}

export interface VideoCompositionFramePreviewOptions {
	requestId: string;
	timelineTime: number;
	duration: number;
	width: number;
	height: number;
	fps: number;
	backgroundColor?: string;
	videoSources: VideoSource[];
	videoTransitions?: VideoTransition[];
	imageSources?: ImageSource[];
	stickerSources?: StickerSource[];
	textAssLayers?: TextAssLayer[];
}

export interface VideoCompositionFramePreviewResult {
	requestId: string;
	pngData: Uint8Array;
	cacheHit: boolean;
	timelineTime: number;
}

export interface VideoPreviewProxyOptions {
	requestId: string;
	sourcePath: string;
	sourceStart: number;
	sourceDuration: number;
	width: number;
	height: number;
	fps: number;
	enhancements: NonNullable<VideoVisual["enhancements"]>;
}

export interface VideoPreviewProxyResult {
	requestId: string;
	proxyUrl: string;
	cacheKey: string;
	cacheHit: boolean;
	sourceStart: number;
	duration: number;
	width: number;
	height: number;
	fileSize: number;
}

export interface VideoPreviewProxyProgress {
	requestId: string;
	progress: number;
	processedSeconds: number;
	duration: number;
}

/**
 * Individual frame data for video export
 * Contains base64 encoded frame image data
 */
export interface FrameData {
	/** Export session identifier */
	sessionId: string;
	/** Unique name/identifier for this frame */
	frameName: string;
	/** Base64 encoded image data for the frame */
	data: string;
}

/**
 * Result of a video export operation
 * Contains success status and output file information
 */
export interface ExportResult {
	/** Whether the export operation succeeded */
	success: boolean;
	/** Path to the generated output video file */
	outputFile: string;
	/** Export method used (spawn process vs manual) */
	method: "spawn" | "manual";
	/** Optional message with additional details */
	message?: string;
}

/**
 * FFmpeg encoding quality configuration.
 * CRF controls quality (lower=better); preset controls speed.
 */
export interface QualitySettings {
	/** Constant Rate Factor: 18 (high), 23 (medium), 28 (low) */
	crf: string;
	/** Encoding speed: slow (best quality), fast, veryfast */
	preset: string;
}

/**
 * Maps quality levels to FFmpeg encoding parameters.
 */
export interface QualityMap {
	[key: string]: QualitySettings;
	high: QualitySettings;
	medium: QualitySettings;
	low: QualitySettings;
}

/**
 * FFmpeg export progress data parsed from stderr output.
 * Used for UI progress bar updates during video encoding.
 */
export interface FFmpegProgress {
	/** Current frame number being encoded */
	frame?: number | null;
	/** Elapsed time in HH:MM:SS.ss format */
	time?: string | null;
}

/**
 * Enhanced error type for FFmpeg process failures.
 * Includes exit code, signal, and captured stdio for debugging.
 */
export interface FFmpegError extends Error {
	/** Process exit code if exited normally */
	code?: number;
	/** Signal name if process was killed (e.g., "SIGTERM") */
	signal?: string;
	/** FFmpeg stderr output containing error details */
	stderr?: string;
	/** FFmpeg stdout output (usually empty) */
	stdout?: string;
}

/**
 * Result from opening frames folder in system file explorer.
 */
export interface OpenFolderResult {
	success: boolean;
	path: string;
}

/**
 * Options for extracting audio from video.
 */
export interface ExtractAudioOptions {
	/** Path to the video file */
	videoPath: string;
	/** Output audio format (wav, mp3, etc.) */
	format?: string;
}

/**
 * Result of audio extraction operation.
 */
export interface ExtractAudioResult {
	/** Path to the extracted audio file in temp directory */
	audioPath: string;
	/** Size of the extracted audio file in bytes */
	fileSize: number;
}

/**
 * Video stream properties extracted from ffprobe
 */
export interface VideoProbeResult {
	path: string;
	codec: string;
	width: number;
	height: number;
	pix_fmt: string;
	fps: string;
	hasAudio: boolean;
}

/**
 * Result of FFmpeg/FFprobe binary health check at startup.
 * Used to verify binaries are executable before user attempts export.
 */
export interface FFmpegHealthResult {
	/** Whether FFmpeg binary spawned and returned version info */
	ffmpegOk: boolean;
	/** Whether FFprobe binary spawned and returned version info */
	ffprobeOk: boolean;
	/** Parsed FFmpeg version string (e.g., "6.1.1") or empty on failure */
	ffmpegVersion: string;
	/** Parsed FFprobe version string (e.g., "6.1.1") or empty on failure */
	ffprobeVersion: string;
	/** Resolved absolute path to FFmpeg binary */
	ffmpegPath: string;
	/** Resolved absolute path to FFprobe binary */
	ffprobePath: string;
	/** Error messages from failed checks (empty array if all OK) */
	errors: string[];
}

/**
 * IPC handler type map for FFmpeg operations.
 */
export interface FFmpegHandlers {
	"ffmpeg-path": () => Promise<string>;
	"create-export-session": () => Promise<{
		sessionId: string;
		frameDir: string;
		outputDir: string;
	}>;
	"save-frame": (data: FrameData) => Promise<string>;
	"read-output-file": (outputPath: string) => Promise<Buffer>;
	"cleanup-export-session": (sessionId: string) => Promise<void>;
	"open-frames-folder": (sessionId: string) => Promise<OpenFolderResult>;
	"export-video-cli": (options: ExportOptions) => Promise<ExportResult>;
	"validate-filter-chain": (filterChain: string) => Promise<boolean>;
	"processFrame": (options: FrameProcessOptions) => Promise<void>;
	"extract-audio": (
		options: ExtractAudioOptions
	) => Promise<ExtractAudioResult>;
	"export-audio-cli": (
		options: AudioExportOptions
	) => Promise<AudioExportResult>;
	"convert-video-to-gif": (
		options: GifConversionOptions
	) => Promise<{ outputPath: string; fileSize: number }>;
}
import type {
	EffectAudioReactiveEnvelope,
	EffectPersonSource,
	EffectRenderProgram,
} from "./effect-render-types";
export type { EffectPersonSource } from "./effect-render-types";
