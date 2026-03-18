/**
 * Electron preload script that exposes a secure API to the renderer process.
 * Uses contextBridge to safely expose IPC methods without exposing the full Electron API.
 *
 * Types are in preload-types.ts, integration API groups in preload-integrations.ts.
 *
 * @module preload
 */
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
	ElectronAPI,
	FileDialogFilter,
	FileInfo,
	SoundSearchParams,
	SoundDownloadParams,
	CancelResult,
	ExportSession,
	FrameData,
	ExportOptions,
	ApiKeyConfig,
	GitHubStarsResponse,
	FalUploadResult,
	ThemeSource,
	SaveAIVideoOptions,
	SaveAIVideoResult,
	ScreenCaptureSource,
	StartScreenRecordingOptions,
	StartScreenRecordingResult,
	StopScreenRecordingOptions,
	StopScreenRecordingResult,
	ScreenRecordingStatus,
} from "./preload-types.js";
import {
	createPtyAPI,
	createMcpAPI,
	createSkillsAPI,
	createAIPipelineAPI,
	createMediaImportAPI,
	createProjectFolderAPI,
	createClaudeAPI,
	createRemotionFolderAPI,
	createUpdatesAPI,
	createMoyinAPI,
} from "./preload-integrations.js";

// Expose the API to the renderer process
const electronAPI: ElectronAPI & Record<string, unknown> = {
	// System info
	platform: process.platform,

	// File operations
	openFileDialog: async (): Promise<string | null> => {
		const result = await ipcRenderer.invoke("open-file-dialog");
		if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
			return null;
		}
		return result.filePaths[0];
	},
	openMultipleFilesDialog: async (): Promise<string[]> => {
		const result = await ipcRenderer.invoke("open-multiple-files-dialog");
		if (result.canceled || !result.filePaths) {
			return [];
		}
		return result.filePaths;
	},
	saveFileDialog: (
		defaultFilename?: string,
		filters?: FileDialogFilter[]
	): Promise<string | null> =>
		ipcRenderer.invoke("save-file-dialog", defaultFilename, filters),
	readFile: (filePath: string): Promise<Buffer | null> =>
		ipcRenderer.invoke("read-file", filePath),
	writeFile: (filePath: string, data: Buffer | string): Promise<boolean> =>
		ipcRenderer.invoke("write-file", filePath, data),
	saveBlob: (
		data: Buffer | Uint8Array,
		defaultFilename?: string
	): Promise<{
		success: boolean;
		filePath?: string;
		canceled?: boolean;
		error?: string;
	}> => ipcRenderer.invoke("save-blob", data, defaultFilename),
	getFileInfo: (filePath: string): Promise<FileInfo | null> =>
		ipcRenderer.invoke("get-file-info", filePath),

	// Storage operations
	storage: {
		save: (key: string, data: any): Promise<boolean> =>
			ipcRenderer.invoke("storage:save", key, data),
		load: (key: string): Promise<any> =>
			ipcRenderer.invoke("storage:load", key),
		remove: (key: string): Promise<boolean> =>
			ipcRenderer.invoke("storage:remove", key),
		list: (): Promise<string[]> => ipcRenderer.invoke("storage:list"),
		clear: (): Promise<boolean> => ipcRenderer.invoke("storage:clear"),
	},

	// Theme operations
	theme: {
		get: (): Promise<ThemeSource> => ipcRenderer.invoke("theme:get"),
		set: (theme: ThemeSource): Promise<ThemeSource> =>
			ipcRenderer.invoke("theme:set", theme),
		toggle: (): Promise<ThemeSource> => ipcRenderer.invoke("theme:toggle"),
		isDark: (): Promise<boolean> => ipcRenderer.invoke("theme:isDark"),
	},

	// Sound operations
	sounds: {
		search: (params: SoundSearchParams): Promise<any> =>
			ipcRenderer.invoke("sounds:search", params),
		downloadPreview: (
			params: SoundDownloadParams
		): Promise<{ success: boolean; path?: string; error?: string }> =>
			ipcRenderer.invoke("sounds:download-preview", params),
	},

	// Audio operations
	audio: {
		saveTemp: (audioData: Uint8Array, filename: string): Promise<string> =>
			ipcRenderer.invoke("audio:save-temp", audioData, filename),
	},

	// Video operations
	video: {
		saveTemp: (
			videoData: Uint8Array,
			filename: string,
			sessionId?: string
		): Promise<string> =>
			ipcRenderer.invoke("video:save-temp", videoData, filename, sessionId),
		saveToDisk: (options: SaveAIVideoOptions): Promise<SaveAIVideoResult> =>
			ipcRenderer.invoke("ai-video:save-to-disk", options),
		verifyFile: (filePath: string): Promise<boolean> =>
			ipcRenderer.invoke("ai-video:verify-file", filePath),
		deleteFile: (filePath: string): Promise<boolean> =>
			ipcRenderer.invoke("ai-video:delete-file", filePath),
		getProjectDir: (projectId: string): Promise<string> =>
			ipcRenderer.invoke("ai-video:get-project-dir", projectId),
	},

	// Screenshot capture
	screenshot: {
		capture: (options?: {
			fileName?: string;
		}): Promise<{
			filePath: string;
			width: number;
			height: number;
			timestamp: number;
		}> => ipcRenderer.invoke("screenshot:capture", options),
	},

	// Screen recording operations
	screenRecording: {
		getSources: (): Promise<ScreenCaptureSource[]> =>
			ipcRenderer.invoke("screen:getSources"),
		start: (
			options: StartScreenRecordingOptions = {}
		): Promise<StartScreenRecordingResult> =>
			ipcRenderer.invoke("screen:startRecording", options),
		appendChunk: (options: {
			sessionId: string;
			chunk: Uint8Array;
		}): Promise<{ bytesWritten: number }> =>
			ipcRenderer.invoke("screen:appendChunk", options),
		stop: (
			options: StopScreenRecordingOptions = {}
		): Promise<StopScreenRecordingResult> =>
			ipcRenderer.invoke("screen:stopRecording", options),
		getStatus: (): Promise<ScreenRecordingStatus> =>
			ipcRenderer.invoke("screen:getStatus"),
		getCursorTelemetry: (
			videoPath: string
		): Promise<import("./preload-types.js").CursorTelemetryData | null> =>
			ipcRenderer.invoke("screen:getCursorTelemetry", videoPath),
	},

	// Transcription operations (Gemini API + ElevenLabs)
	transcribe: {
		transcribe: (request: {
			audioPath: string;
			language?: string;
		}): Promise<{
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
		}> => ipcRenderer.invoke("transcribe:audio", request),
		cancel: (id: string): Promise<CancelResult> =>
			ipcRenderer.invoke("transcribe:cancel", id),
		elevenlabs: (options: {
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
		}> => ipcRenderer.invoke("transcribe:elevenlabs", options),
		uploadToFal: (filePath: string): Promise<{ url: string }> =>
			ipcRenderer.invoke("transcribe:upload-to-fal", filePath),
	},

	analyzeFillers: (options: {
		words: Array<{
			id: string;
			text: string;
			start: number;
			end: number;
			type: "word" | "spacing";
			speaker_id?: string;
		}>;
		languageCode: string;
	}): Promise<{
		filteredWordIds: Array<{
			id: string;
			reason: string;
			scope?: "word" | "sentence";
		}>;
		provider?: "gemini" | "anthropic" | "pattern";
	}> => ipcRenderer.invoke("ai:analyze-fillers", options),

	// FFmpeg export operations
	ffmpeg: {
		createExportSession: (): Promise<ExportSession> =>
			ipcRenderer.invoke("create-export-session"),
		saveFrame: (
			data: FrameData
		): Promise<{ success: boolean; error?: string }> =>
			ipcRenderer.invoke("save-frame", data),
		exportVideoCLI: (
			options: ExportOptions
		): Promise<{ success: boolean; outputPath?: string; error?: string }> =>
			ipcRenderer.invoke("export-video-cli", options),
		readOutputFile: (path: string): Promise<Buffer | null> =>
			ipcRenderer.invoke("read-output-file", path),
		cleanupExportSession: (sessionId: string): Promise<boolean> =>
			ipcRenderer.invoke("cleanup-export-session", sessionId),
		openFramesFolder: (sessionId: string): Promise<void> =>
			ipcRenderer.invoke("open-frames-folder", sessionId),
		extractAudio: (options: {
			videoPath: string;
			format?: string;
		}): Promise<{
			audioPath: string;
			fileSize: number;
		}> => ipcRenderer.invoke("extract-audio", options),
		saveStickerForExport: (data: {
			sessionId: string;
			stickerId: string;
			imageData: Uint8Array;
			format?: string;
		}): Promise<{ success: boolean; path?: string; error?: string }> =>
			ipcRenderer.invoke("save-sticker-for-export", data),
		processFrame: (options: {
			sessionId: string;
			inputFrameName: string;
			outputFrameName: string;
			filterChain: string;
		}): Promise<void> => ipcRenderer.invoke("processFrame", options),
		validateFilterChain: (filterChain: string): Promise<boolean> =>
			ipcRenderer.invoke("validate-filter-chain", filterChain),
		getFFmpegResourcePath: (filename: string): Promise<string> =>
			ipcRenderer.invoke("get-ffmpeg-resource-path", filename),
		checkFFmpegResource: (filename: string): Promise<boolean> =>
			ipcRenderer.invoke("check-ffmpeg-resource", filename),
		getPath: (): Promise<string> => ipcRenderer.invoke("ffmpeg-path"),
		checkHealth: (): Promise<{
			ffmpegOk: boolean;
			ffprobeOk: boolean;
			ffmpegVersion: string;
			ffprobeVersion: string;
			ffmpegPath: string;
			ffprobePath: string;
			errors: string[];
		}> => ipcRenderer.invoke("ffmpeg-health"),
	},

	// API key operations
	apiKeys: {
		get: (): Promise<ApiKeyConfig> => ipcRenderer.invoke("api-keys:get"),
		set: (keys: ApiKeyConfig): Promise<boolean> =>
			ipcRenderer.invoke("api-keys:set", keys),
		clear: (): Promise<boolean> => ipcRenderer.invoke("api-keys:clear"),
		status: (): Promise<{
			falApiKey: { set: boolean; source: string };
			freesoundApiKey: { set: boolean; source: string };
			geminiApiKey: { set: boolean; source: string };
			openRouterApiKey: { set: boolean; source: string };
			anthropicApiKey: { set: boolean; source: string };
			elevenLabsApiKey: { set: boolean; source: string };
		}> => ipcRenderer.invoke("api-keys:status"),
	},

	// Shell operations
	shell: {
		showItemInFolder: (filePath: string): Promise<void> =>
			ipcRenderer.invoke("shell:showItemInFolder", filePath),
		openExternal: (url: string): Promise<void> =>
			ipcRenderer.invoke("shell:openExternal", url),
	},

	// GitHub operations
	github: {
		fetchStars: (): Promise<GitHubStarsResponse> =>
			ipcRenderer.invoke("fetch-github-stars"),
	},

	// FAL AI operations (bypasses CORS in Electron)
	fal: {
		uploadVideo: (
			videoData: Uint8Array,
			filename: string,
			apiKey: string
		): Promise<FalUploadResult> =>
			ipcRenderer.invoke("fal:upload-video", videoData, filename, apiKey),
		uploadImage: (
			imageData: Uint8Array,
			filename: string,
			apiKey: string
		): Promise<FalUploadResult> =>
			ipcRenderer.invoke("fal:upload-image", imageData, filename, apiKey),
		uploadAudio: (
			audioData: Uint8Array,
			filename: string,
			apiKey: string
		): Promise<FalUploadResult> =>
			ipcRenderer.invoke("fal:upload-audio", audioData, filename, apiKey),
		queueFetch: (
			url: string,
			apiKey: string
		): Promise<{ ok: boolean; status: number; data: unknown }> =>
			ipcRenderer.invoke("fal:queue-fetch", url, apiKey),
	},

	// Gemini Chat operations
	geminiChat: {
		send: (request: {
			messages: Array<{ role: "user" | "assistant"; content: string }>;
			attachments?: Array<{ path: string; mimeType: string; name: string }>;
			model?: string;
		}): Promise<{ success: boolean; error?: string }> =>
			ipcRenderer.invoke("gemini:chat", request),
		suggestGapPrompt: (request: {
			gapDuration: number;
			mode: string;
			beforeFrameUrl?: string | null;
			afterFrameUrl?: string | null;
		}): Promise<{ suggestedPrompt: string | null; error?: string }> =>
			ipcRenderer.invoke("gemini:suggest-gap-prompt", request),
		describeFrame: (request: {
			imageDataUrl: string;
		}): Promise<{ prompt: string | null; error?: string }> =>
			ipcRenderer.invoke("gemini:describe-frame", request),
		onStreamChunk: (callback: (data: { text: string }) => void): void => {
			ipcRenderer.removeAllListeners("gemini:stream-chunk");
			ipcRenderer.on("gemini:stream-chunk", (_, data) => callback(data));
		},
		onStreamComplete: (callback: () => void): void => {
			ipcRenderer.removeAllListeners("gemini:stream-complete");
			ipcRenderer.on("gemini:stream-complete", () => callback());
		},
		onStreamError: (callback: (data: { message: string }) => void): void => {
			ipcRenderer.removeAllListeners("gemini:stream-error");
			ipcRenderer.on("gemini:stream-error", (_, data) => callback(data));
		},
		removeListeners: (): void => {
			ipcRenderer.removeAllListeners("gemini:stream-chunk");
			ipcRenderer.removeAllListeners("gemini:stream-complete");
			ipcRenderer.removeAllListeners("gemini:stream-error");
		},
	},

	// Pi Agent operations
	piAgent: {
		send: (request: {
			message: string;
			settings?: { provider: string; model: string; apiKey?: string };
			apiKey?: string;
		}): Promise<{ success: boolean; error?: string }> =>
			ipcRenderer.invoke("pi-agent:chat", request),
		onStreamChunk: (callback: (data: { text: string }) => void): void => {
			ipcRenderer.removeAllListeners("pi-agent:stream-chunk");
			ipcRenderer.on("pi-agent:stream-chunk", (_, data) => callback(data));
		},
		onToolCall: (
			callback: (data: {
				toolCallId: string;
				toolName: string;
				params: Record<string, unknown>;
			}) => void
		): void => {
			ipcRenderer.removeAllListeners("pi-agent:tool-call");
			ipcRenderer.on("pi-agent:tool-call", (_, data) => callback(data));
		},
		onToolResult: (
			callback: (data: {
				toolCallId: string;
				toolName: string;
				result: unknown;
				isError: boolean;
			}) => void
		): void => {
			ipcRenderer.removeAllListeners("pi-agent:tool-result");
			ipcRenderer.on("pi-agent:tool-result", (_, data) => callback(data));
		},
		onStreamComplete: (callback: () => void): void => {
			ipcRenderer.removeAllListeners("pi-agent:stream-complete");
			ipcRenderer.on("pi-agent:stream-complete", () => callback());
		},
		onStreamError: (callback: (data: { message: string }) => void): void => {
			ipcRenderer.removeAllListeners("pi-agent:stream-error");
			ipcRenderer.on("pi-agent:stream-error", (_, data) => callback(data));
		},
		removeListeners: (): void => {
			ipcRenderer.removeAllListeners("pi-agent:stream-chunk");
			ipcRenderer.removeAllListeners("pi-agent:tool-call");
			ipcRenderer.removeAllListeners("pi-agent:tool-result");
			ipcRenderer.removeAllListeners("pi-agent:stream-complete");
			ipcRenderer.removeAllListeners("pi-agent:stream-error");
		},
		reset: (): Promise<{ success: boolean }> =>
			ipcRenderer.invoke("pi-agent:reset"),
		setModel: (settings: {
			provider: string;
			model: string;
			apiKey?: string;
		}): Promise<{ success: boolean }> =>
			ipcRenderer.invoke("pi-agent:set-model", settings),
		getModels: (): Promise<{ provider: string; models: string[] }[]> =>
			ipcRenderer.invoke("pi-agent:get-models"),
	},

	// License operations
	license: {
		check: () => ipcRenderer.invoke("license:check"),
		activate: (token: string) => ipcRenderer.invoke("license:activate", token),
		trackUsage: (type: "ai_generation" | "export" | "render") =>
			ipcRenderer.invoke("license:track-usage", type),
		deductCredits: (amount: number, modelKey: string, description: string) =>
			ipcRenderer.invoke(
				"license:deduct-credits",
				amount,
				modelKey,
				description
			),
		setAuthToken: (token: string) =>
			ipcRenderer.invoke("license:set-auth-token", token),
		clearAuthToken: () => ipcRenderer.invoke("license:clear-auth-token"),
		onActivationToken: (callback: (token: string) => void) => {
			const listener = (_event: unknown, token: string) => callback(token);
			ipcRenderer.on("license:activation-token", listener);
			return () => {
				ipcRenderer.removeListener("license:activation-token", listener);
			};
		},
		deactivate: () => ipcRenderer.invoke("license:deactivate"),
		emailLogin: (email: string, password: string) =>
			ipcRenderer.invoke("license:email-login", { email, password }),
		emailSignup: (name: string, email: string, password: string) =>
			ipcRenderer.invoke("license:email-signup", { name, email, password }),
		getGoogleLoginUrl: () => ipcRenderer.invoke("license:get-google-login-url"),
	},

	// Integration API groups (from preload-integrations.ts)
	pty: createPtyAPI(),
	mcp: createMcpAPI(),
	skills: createSkillsAPI(),
	aiPipeline: createAIPipelineAPI(),
	mediaImport: createMediaImportAPI(),
	projectFolder: createProjectFolderAPI(),
	projectJson: {
		write: (projectId: string) =>
			ipcRenderer.invoke("project-json:write", projectId),
	},
	claude: createClaudeAPI(),
	remotionFolder: createRemotionFolderAPI(),
	moyin: createMoyinAPI(),
	updates: createUpdatesAPI(),

	// YouTube upload
	youtube: {
		upload: (options: {
			filePath: string;
			title: string;
			description?: string;
			tags?: string[];
			privacy?: "public" | "unlisted" | "private";
			categoryId?: string;
			thumbnailPath?: string;
		}) => ipcRenderer.invoke("youtube:upload", options),
		checkAuth: () => ipcRenderer.invoke("youtube:check-auth"),
		onUploadProgress: (
			callback: (progress: { percent: number; message: string }) => void
		) => {
			const listener = (
				_event: Electron.IpcRendererEvent,
				progress: { percent: number; message: string }
			) => callback(progress);
			ipcRenderer.on("youtube:upload-progress", listener);
			return () => {
				ipcRenderer.removeListener("youtube:upload-progress", listener);
			};
		},
	},

	// File path utility (Electron 37+ removed File.path)
	getPathForFile: (file: File): string => webUtils.getPathForFile(file),

	// Video semantic search
	videoSearch: {
		search: (
			projectId: string,
			query: string,
			options?: { topK?: number; minScore?: number; mediaFilter?: string[] }
		): Promise<{
			results: Array<{
				mediaId: string;
				mediaName: string;
				chunkIndex: number;
				startTime: number;
				endTime: number;
				score: number;
				thumbnailPath?: string;
			}>;
			error?: string;
			message?: string;
		}> => ipcRenderer.invoke("video-search:search", projectId, query, options),

		indexMedia: (
			projectId: string,
			mediaId: string,
			mediaPath: string,
			mediaName: string,
			totalDuration: number
		): Promise<{
			status: string;
			mediaId: string;
			chunks?: number;
			error?: string;
		}> =>
			ipcRenderer.invoke(
				"video-search:index-media",
				projectId,
				mediaId,
				mediaPath,
				mediaName,
				totalDuration
			),

		cancelIndexing: (projectId: string): Promise<void> =>
			ipcRenderer.invoke("video-search:cancel-indexing", projectId),

		indexStatus: (projectId: string): Promise<{ indexedMediaIds: string[] }> =>
			ipcRenderer.invoke("video-search:index-status", projectId),

		deleteIndex: (
			projectId: string,
			mediaId: string
		): Promise<{ ok: boolean }> =>
			ipcRenderer.invoke("video-search:delete-index", projectId, mediaId),

		providerStatus: (): Promise<{ name: string; available: boolean }> =>
			ipcRenderer.invoke("video-search:provider-status"),

		onIndexProgress: (
			callback: (progress: {
				phase: string;
				current: number;
				total: number;
				mediaId?: string;
				mediaName?: string;
			}) => void
		): void => {
			ipcRenderer.removeAllListeners("video-search:index-progress");
			ipcRenderer.on("video-search:index-progress", (_, data) =>
				callback(data)
			);
		},

		removeListeners: (): void => {
			ipcRenderer.removeAllListeners("video-search:index-progress");
		},
	},

	// Utility
	isElectron: true,
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// Re-export types for use in renderer process
export type {
	ElectronAPI,
	FileDialogFilter,
	FileInfo,
	SoundSearchParams,
	SoundDownloadParams,
	CancelResult,
	ExportSession,
	FrameData,
	ExportOptions,
	ApiKeyConfig,
	GitHubStarsResponse,
	FalUploadResult,
	ThemeSource,
	SaveAIVideoOptions,
	SaveAIVideoResult,
	ScreenCaptureSource,
	StartScreenRecordingOptions,
	StartScreenRecordingResult,
	StopScreenRecordingOptions,
	StopScreenRecordingResult,
	ScreenRecordingStatus,
} from "./preload-types.js";

export type {
	TranscriptionRequestData,
	TranscriptionResult,
	TranscriptionSegment,
	VideoSource,
	AudioFile,
	Skill,
	MediaImportOptions,
	MediaImportResult,
	RemotionCompositionInfo,
	RemotionFolderSelectResult,
	RemotionFolderScanResult,
	RemotionBundleResult,
	RemotionFolderBundleResult,
	RemotionFolderImportResult,
} from "./preload-types.js";
