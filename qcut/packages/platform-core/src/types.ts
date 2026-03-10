/**
 * Platform API contract for QCut multi-platform support.
 *
 * This defines the full interface that platform adapters must implement.
 * Derived from the Electron preload bridge (electron/preload.ts).
 *
 * Each adapter (desktop, web, iPad) implements this contract with
 * platform-appropriate behavior.
 *
 * @module @qcut/platform-core/types
 */

// ---------------------------------------------------------------------------
// Shared primitive types
// ---------------------------------------------------------------------------

export type ThemeSource = "system" | "light" | "dark";

export interface FileDialogFilter {
	name: string;
	extensions: string[];
}

export interface FileInfo {
	name: string;
	path: string;
	size: number;
	isDirectory: boolean;
	modifiedAt: number;
	createdAt: number;
}

export interface SaveBlobResult {
	success: boolean;
	filePath?: string;
	canceled?: boolean;
	error?: string;
}

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------

/** Every platform capability that adapters may or may not support. */
export enum PlatformCapability {
	/** Native file system access (open/save dialogs, direct path read/write) */
	FileSystem = "filesystem",
	/** Persistent key-value storage */
	Storage = "storage",
	/** Theme detection and switching */
	Theme = "theme",
	/** Sound search and download */
	Sounds = "sounds",
	/** Temporary audio file management */
	AudioTemp = "audio-temp",
	/** Temporary video file management and AI video save */
	VideoTemp = "video-temp",
	/** Screenshot capture */
	Screenshot = "screenshot",
	/** Screen recording (source selection, start/stop) */
	ScreenRecording = "screen-recording",
	/** Audio transcription (Gemini, ElevenLabs) */
	Transcription = "transcription",
	/** FFmpeg operations (export, frame processing, health checks) */
	FFmpeg = "ffmpeg",
	/** API key secure storage */
	ApiKeys = "api-keys",
	/** Shell operations (open folder, open URL) */
	Shell = "shell",
	/** GitHub API access */
	GitHub = "github",
	/** FAL.ai upload proxy (CORS bypass) */
	FalUpload = "fal-upload",
	/** Gemini chat with streaming */
	GeminiChat = "gemini-chat",
	/** License activation and credit management */
	License = "license",
	/** PTY terminal sessions */
	Pty = "pty",
	/** MCP app bridge */
	Mcp = "mcp",
	/** Skills management */
	Skills = "skills",
	/** AI content generation pipeline */
	AiPipeline = "ai-pipeline",
	/** Media import with symlinks */
	MediaImport = "media-import",
	/** Project folder management */
	ProjectFolder = "project-folder",
	/** Project JSON persistence */
	ProjectJson = "project-json",
	/** Claude editor integration */
	Claude = "claude",
	/** Remotion folder import/bundle */
	RemotionFolder = "remotion-folder",
	/** Moyin script-to-storyboard */
	Moyin = "moyin",
	/** Auto-updates */
	Updates = "updates",
	/** YouTube upload */
	YouTube = "youtube",
	/** AI filler word analysis */
	FillerAnalysis = "filler-analysis",
	/** File path resolution from File objects */
	FilePathResolution = "file-path-resolution",
}

// ---------------------------------------------------------------------------
// Platform API — namespace contracts
// ---------------------------------------------------------------------------

export interface PlatformFilesAPI {
	openFileDialog(): Promise<string | null>;
	openMultipleFilesDialog(): Promise<string[]>;
	saveFileDialog(
		defaultFilename?: string,
		filters?: FileDialogFilter[]
	): Promise<string | null>;
	readFile(filePath: string): Promise<ArrayBuffer | null>;
	writeFile(filePath: string, data: ArrayBuffer | string): Promise<boolean>;
	saveBlob(
		data: ArrayBuffer | Uint8Array,
		defaultFilename?: string
	): Promise<SaveBlobResult>;
	getFileInfo(filePath: string): Promise<FileInfo | null>;
}

export interface PlatformStorageAPI {
	save(key: string, data: unknown): Promise<boolean>;
	load(key: string): Promise<unknown>;
	remove(key: string): Promise<boolean>;
	list(): Promise<string[]>;
	clear(): Promise<boolean>;
}

export interface PlatformThemeAPI {
	get(): Promise<ThemeSource>;
	set(theme: ThemeSource): Promise<ThemeSource>;
	toggle(): Promise<ThemeSource>;
	isDark(): Promise<boolean>;
}

export interface PlatformShellAPI {
	showItemInFolder(filePath: string): Promise<void>;
	openExternal(url: string): Promise<void>;
}

export interface PlatformApiKeysAPI {
	get(): Promise<Record<string, string>>;
	set(keys: Record<string, string>): Promise<boolean>;
	clear(): Promise<boolean>;
	status(): Promise<Record<string, { set: boolean; source: string }>>;
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
		error?: string;
	}>;
	readOutputFile(path: string): Promise<ArrayBuffer | null>;
	cleanupExportSession(sessionId: string): Promise<boolean>;
	extractAudio(options: {
		videoPath: string;
		format?: string;
	}): Promise<{ audioPath: string; fileSize: number }>;
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

export interface PlatformLicenseAPI {
	check(): Promise<unknown>;
	activate(token: string): Promise<unknown>;
	deactivate(): Promise<unknown>;
	trackUsage(type: "ai_generation" | "export" | "render"): Promise<unknown>;
	deductCredits(
		amount: number,
		modelKey: string,
		description: string
	): Promise<unknown>;
	setAuthToken(token: string): Promise<unknown>;
	clearAuthToken(): Promise<unknown>;
	emailLogin(email: string, password: string): Promise<unknown>;
	emailSignup(name: string, email: string, password: string): Promise<unknown>;
	getGoogleLoginUrl(): Promise<unknown>;
}

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
}

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
// Root PlatformAPI
// ---------------------------------------------------------------------------

/**
 * The unified platform API contract.
 *
 * Platform adapters implement this interface:
 * - `platform-desktop`: wraps window.electronAPI (full capability)
 * - `platform-web`: browser APIs + stubs (QCut Lite)
 *
 * Capabilities that an adapter does not support should throw
 * `PlatformUnsupportedError` or return graceful fallback values.
 */
export interface PlatformAPI {
	/** Platform identifier */
	readonly platform: "desktop" | "web" | "ios";

	/** Whether running in Electron context */
	readonly isElectron: boolean;

	/** Check if a capability is available on this platform */
	hasCapability(cap: PlatformCapability): boolean;

	/** File system operations */
	files: PlatformFilesAPI;

	/** Persistent storage */
	storage: PlatformStorageAPI;

	/** Theme management */
	theme: PlatformThemeAPI;

	/** Shell/OS operations */
	shell: PlatformShellAPI;

	/** API key management */
	apiKeys: PlatformApiKeysAPI;

	/** FFmpeg operations */
	ffmpeg: PlatformFFmpegAPI;

	/** License & credits */
	license: PlatformLicenseAPI;

	/** Transcription services */
	transcription: PlatformTranscriptionAPI;

	/** Screen recording */
	screenRecording: PlatformScreenRecordingAPI;
}
