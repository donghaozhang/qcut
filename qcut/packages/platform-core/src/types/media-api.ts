/**
 * Media-related platform API namespace interfaces.
 * Sounds, audio, video, screenshot, screen recording, FFmpeg, transcription.
 *
 * @module @qcut/platform-core/types/media-api
 */

// ---------------------------------------------------------------------------
// Sounds
// ---------------------------------------------------------------------------

export interface PlatformSoundsAPI {
	search(params: {
		q?: string;
		query?: string;
		type?: "effects" | "songs";
		page?: number;
		page_size?: number;
		pageSize?: number;
		sort?: "downloads" | "rating" | "created" | "score";
		min_rating?: number;
		commercial_only?: boolean;
	}): Promise<{
		success: boolean;
		count?: number;
		next?: string | null;
		previous?: string | null;
		results?: Array<{
			id: number;
			name: string;
			description: string;
			url: string;
			previewUrl?: string;
			downloadUrl?: string;
			duration: number;
			filesize: number;
			type: string;
			channels: number;
			bitrate: number;
			bitdepth: number;
			samplerate: number;
			username: string;
			tags: string[];
			license: string;
			created: string;
			downloads: number;
			rating: number;
			ratingCount: number;
		}>;
		query?: string;
		type?: string;
		page?: number;
		pageSize?: number;
		sort?: string;
		minRating?: number;
		error?: string;
		message?: string;
	}>;
	downloadPreview(params: {
		url?: string;
		id: number | string;
		previewUrl?: string;
	}): Promise<{
		success: boolean;
		localPath?: string;
		path?: string;
		error?: string;
	}>;
}

// ---------------------------------------------------------------------------
// Audio (temp files)
// ---------------------------------------------------------------------------

export interface PlatformAudioAPI {
	saveTemp(audioData: Uint8Array, filename: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Video (temp files + AI video)
// ---------------------------------------------------------------------------

export interface PlatformVideoAPI {
	saveTemp(
		videoData: Uint8Array,
		filename: string,
		sessionId?: string
	): Promise<string>;
	saveToDisk(options: {
		fileName: string;
		fileData: ArrayBuffer | Uint8Array;
		projectId: string;
		modelId?: string;
		metadata?: {
			width?: number;
			height?: number;
			duration?: number;
			fps?: number;
		};
	}): Promise<{
		success: boolean;
		localPath?: string;
		fileName?: string;
		fileSize?: number;
		filePath?: string;
		error?: string;
	}>;
	verifyFile(filePath: string): Promise<boolean>;
	deleteFile(filePath: string): Promise<boolean>;
	getProjectDir(projectId: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

export interface PlatformScreenshotAPI {
	capture(options?: { fileName?: string }): Promise<{
		filePath: string;
		width: number;
		height: number;
		timestamp: number;
	}>;
}

// ---------------------------------------------------------------------------
// Screen Recording
// ---------------------------------------------------------------------------

export interface PlatformScreenRecordingAPI {
	getSources(): Promise<
		Array<{
			id: string;
			name: string;
			type?: string;
			displayId?: string;
			isCurrentWindow?: boolean;
			thumbnail?: string;
		}>
	>;
	start(options?: {
		sourceId?: string;
		filePath?: string;
		fileName?: string;
		mimeType?: string;
	}): Promise<{
		sessionId: string;
		sourceId: string;
		sourceName: string;
		filePath: string;
		startedAt: number;
		mimeType: string | null;
	}>;
	appendChunk(options: {
		sessionId: string;
		chunk: Uint8Array;
	}): Promise<{ bytesWritten: number }>;
	stop(options?: { sessionId?: string; discard?: boolean }): Promise<{
		success: boolean;
		filePath: string | null;
		bytesWritten: number;
		durationMs: number;
		discarded: boolean;
	}>;
	getStatus(): Promise<{
		state: "idle" | "recording";
		recording: boolean;
		sessionId: string | null;
		sourceId: string | null;
		sourceName: string | null;
		filePath: string | null;
		bytesWritten: number;
		startedAt: number | null;
		durationMs: number;
		mimeType: string | null;
	}>;
	getCursorTelemetry?(videoPath: string): Promise<{
		version: 1;
		captureRect: { x: number; y: number; width: number; height: number };
		points: Array<{ t: number; x: number; y: number; p: boolean; c?: string }>;
	} | null>;
}

// ---------------------------------------------------------------------------
// FFmpeg
// ---------------------------------------------------------------------------

export interface PlatformVideoEnhancements {
	stabilization: number;
	denoise: number;
	clarity: number;
	upscale: 1 | 2 | 4;
	relight: number;
	beauty: number;
}

export interface PlatformVideoFramePreviewOptions {
	requestId: string;
	sourcePath: string;
	sourceTime: number;
	width: number;
	height: number;
	fps: number;
	fitMode: "cover" | "contain" | "fill";
	enhancements: PlatformVideoEnhancements;
}

export interface PlatformVideoFramePreviewResult {
	requestId: string;
	pngData: Uint8Array;
	cacheHit: boolean;
	sourceTime: number;
}

export interface PlatformVideoCompositionFramePreviewOptions {
	requestId: string;
	timelineTime: number;
	duration: number;
	width: number;
	height: number;
	fps: number;
	backgroundColor?: string;
	videoSources: unknown[];
	videoTransitions?: unknown[];
	imageSources?: unknown[];
	stickerSources?: unknown[];
	textAssLayers?: unknown[];
}

export interface PlatformVideoCompositionFramePreviewResult {
	requestId: string;
	pngData: Uint8Array;
	cacheHit: boolean;
	timelineTime: number;
}

export interface PlatformVideoPreviewProxyOptions {
	requestId: string;
	sourcePath: string;
	sourceStart: number;
	sourceDuration: number;
	width: number;
	height: number;
	fps: number;
	enhancements: PlatformVideoEnhancements;
}

export interface PlatformVideoPreviewProxyResult {
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

export interface PlatformVideoPreviewProxyProgress {
	requestId: string;
	progress: number;
	processedSeconds: number;
	duration: number;
}

export interface PlatformAudioWaveformOptions {
	sourcePath: string;
	duration: number;
	peakCount?: number;
	band?: "bass" | "mid" | "treble" | "full";
}

export interface PlatformAudioWaveformResult {
	duration: number;
	values: Float32Array;
	cacheHit: boolean;
}

export interface PlatformFFmpegAPI {
	createExportSession(): Promise<{ sessionId: string; framesDir: string }>;
	saveFrame(data: {
		sessionId: string;
		frameNumber: number;
		imageData: Uint8Array;
	}): Promise<{ success: boolean; error?: string }>;
	exportVideoCLI(options: Record<string, unknown>): Promise<{
		success: boolean;
		outputPath?: string;
		outputFile?: string;
		error?: string;
	}>;
	readOutputFile(path: string): Promise<ArrayBuffer | null>;
	cleanupExportSession(sessionId: string): Promise<boolean>;
	openFramesFolder(sessionId: string): Promise<void>;
	extractAudio(options: {
		videoPath: string;
		format?: string;
	}): Promise<{ audioPath: string; fileSize: number }>;
	extractAudioWaveform(
		options: PlatformAudioWaveformOptions
	): Promise<PlatformAudioWaveformResult>;
	exportAudioCLI(options: {
		outputPath: string;
		duration: number;
		audioFiles: Array<{
			path: string;
			startTime: number;
			volume?: number;
			sourceGain?: number;
			trimStart?: number;
			duration?: number;
		}>;
		bitrate: number;
		sampleRate: number;
		channels?: 1 | 2;
	}): Promise<{ outputPath: string; fileSize: number }>;
	convertVideoToGif(options: {
		sessionId: string;
		inputPath: string;
		width: number;
		height: number;
		fps: number;
		loop: boolean;
		quality: number;
	}): Promise<{ outputPath: string; fileSize: number }>;
	saveStickerForExport(data: {
		sessionId: string;
		stickerId: string;
		imageData: Uint8Array;
		format?: string;
	}): Promise<{ success: boolean; path?: string; error?: string }>;
	saveEffectSequenceFrame(data: {
		sessionId: string;
		sequenceId: string;
		frameIndex: number;
		imageData: Uint8Array;
		extension?: string;
	}): Promise<{
		success: boolean;
		path?: string;
		patternPath?: string;
		error?: string;
	}>;
	processFrame(options: {
		sessionId: string;
		inputFrameName: string;
		outputFrameName: string;
		filterChain: string;
	}): Promise<void>;
	renderVideoFramePreview(
		options: PlatformVideoFramePreviewOptions
	): Promise<PlatformVideoFramePreviewResult>;
	renderVideoCompositionFramePreview(
		options: PlatformVideoCompositionFramePreviewOptions
	): Promise<PlatformVideoCompositionFramePreviewResult>;
	cancelVideoFramePreview(requestId: string): Promise<boolean>;
	renderVideoPreviewProxy(
		options: PlatformVideoPreviewProxyOptions
	): Promise<PlatformVideoPreviewProxyResult>;
	cancelVideoPreviewProxy(requestId: string): Promise<boolean>;
	onVideoPreviewProxyProgress(
		callback: (progress: PlatformVideoPreviewProxyProgress) => void
	): () => void;
	validateFilterChain(filterChain: string): Promise<boolean>;
	getFFmpegResourcePath(filename: string): Promise<string>;
	checkFFmpegResource(filename: string): Promise<boolean>;
	getPath(): Promise<string>;
	checkHealth(): Promise<{
		ffmpegOk: boolean;
		ffprobeOk: boolean;
		ffmpegVersion: string;
		ffprobeVersion: string;
		ffmpegPath: string;
		ffprobePath: string;
		errors: string[];
	}>;
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------

export interface PlatformTranscriptionAPI {
	transcribe(request: { audioPath: string; language?: string }): Promise<{
		text: string;
		segments: Array<{
			id: number;
			seek: number;
			start: number;
			end: number;
			text: string;
			tokens: number[];
			temperature: number;
			avg_logprob: number;
			compression_ratio: number;
			no_speech_prob: number;
		}>;
		language: string;
	}>;
	cancel(id: string): Promise<{ cancelled: boolean }>;
	elevenlabs(options: {
		audioPath: string;
		language?: string;
		diarize?: boolean;
		tagAudioEvents?: boolean;
		keyterms?: string[];
	}): Promise<{
		text: string;
		language_code: string;
		language_probability: number;
		words: Array<{
			text: string;
			start: number;
			end: number;
			type: "word" | "spacing" | "audio_event" | "punctuation";
			speaker_id: string | null;
		}>;
	}>;
	uploadToFal(filePath: string): Promise<{ url: string }>;
}
