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
		query: string;
		page?: number;
		pageSize?: number;
	}): Promise<unknown>;
	downloadPreview(params: {
		id: number | string;
		previewUrl: string;
	}): Promise<{ success: boolean; path?: string; error?: string }>;
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
		videoUrl: string;
		projectId: string;
		filename?: string;
	}): Promise<{ success: boolean; filePath?: string; error?: string }>;
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
	getSources(): Promise<Array<{ id: string; name: string; thumbnail: string }>>;
	start(options?: Record<string, unknown>): Promise<{
		sessionId: string;
		success: boolean;
	}>;
	appendChunk(options: {
		sessionId: string;
		chunk: Uint8Array;
	}): Promise<{ bytesWritten: number }>;
	stop(options?: Record<string, unknown>): Promise<{
		filePath?: string;
		duration?: number;
		success: boolean;
	}>;
	getStatus(): Promise<{ recording: boolean; sessionId?: string }>;
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
			start: number;
			end: number;
			text: string;
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
