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
	}): Promise<{ success: boolean; localPath?: string; path?: string; error?: string }>;
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
	stop(options?: {
		sessionId?: string;
		discard?: boolean;
	}): Promise<{
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
}

// ---------------------------------------------------------------------------
// FFmpeg
// ---------------------------------------------------------------------------

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
	saveStickerForExport(data: {
		sessionId: string;
		stickerId: string;
		imageData: Uint8Array;
		format?: string;
	}): Promise<{ success: boolean; path?: string; error?: string }>;
	processFrame(options: {
		sessionId: string;
		inputFrameName: string;
		outputFrameName: string;
		filterChain: string;
	}): Promise<void>;
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
