/**
 * Shared primitive types and capability enum for platform API.
 *
 * @module @qcut/platform-core/types/base
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
