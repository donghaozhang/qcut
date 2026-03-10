/**
 * Integration and feature platform API namespace interfaces.
 * FAL, Gemini chat, GitHub, YouTube, PTY, MCP, skills, AI pipeline,
 * media import, project folder/JSON, Remotion, Moyin, updates.
 *
 * @module @qcut/platform-core/types/integration-api
 */

// ---------------------------------------------------------------------------
// FAL AI (CORS bypass proxy)
// ---------------------------------------------------------------------------

export interface PlatformFalAPI {
	uploadVideo(
		videoData: Uint8Array,
		filename: string,
		apiKey: string
	): Promise<{ url: string }>;
	uploadImage(
		imageData: Uint8Array,
		filename: string,
		apiKey: string
	): Promise<{ url: string }>;
	uploadAudio(
		audioData: Uint8Array,
		filename: string,
		apiKey: string
	): Promise<{ url: string }>;
	queueFetch(
		url: string,
		apiKey: string
	): Promise<{ ok: boolean; status: number; data: unknown }>;
}

// ---------------------------------------------------------------------------
// Gemini Chat (streaming)
// ---------------------------------------------------------------------------

export interface PlatformGeminiChatAPI {
	send(request: {
		messages: Array<{ role: "user" | "assistant"; content: string }>;
		attachments?: Array<{ path: string; mimeType: string; name: string }>;
		model?: string;
	}): Promise<{ success: boolean; error?: string }>;
	onStreamChunk(callback: (data: { text: string }) => void): void;
	onStreamComplete(callback: () => void): void;
	onStreamError(callback: (data: { message: string }) => void): void;
	removeListeners(): void;
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

export interface PlatformGitHubAPI {
	fetchStars(): Promise<{ stars: number; url: string }>;
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

export interface PlatformYouTubeAPI {
	upload(options: {
		filePath: string;
		title: string;
		description?: string;
		tags?: string[];
		privacy?: "public" | "unlisted" | "private";
		categoryId?: string;
		thumbnailPath?: string;
	}): Promise<unknown>;
	checkAuth(): Promise<unknown>;
	onUploadProgress(
		callback: (progress: { percent: number; message: string }) => void
	): () => void;
}

// ---------------------------------------------------------------------------
// PTY Terminal
// ---------------------------------------------------------------------------

export interface PlatformPtyAPI {
	spawn(options?: {
		shell?: string;
		cwd?: string;
		env?: Record<string, string>;
		cols?: number;
		rows?: number;
	}): Promise<{ sessionId: string }>;
	write(sessionId: string, data: string): Promise<void>;
	resize(sessionId: string, cols: number, rows: number): Promise<void>;
	kill(sessionId: string): Promise<void>;
	killAll(): Promise<void>;
	onData(callback: (data: { sessionId: string; data: string }) => void): void;
	onExit(
		callback: (data: { sessionId: string; exitCode: number }) => void
	): void;
	removeListeners(): void;
}

// ---------------------------------------------------------------------------
// MCP App Bridge
// ---------------------------------------------------------------------------

export interface PlatformMcpAPI {
	onAppHtml(
		callback: (payload: { html: string; title?: string }) => void
	): void;
	removeListeners(): void;
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface PlatformSkillsAPI {
	list(projectId: string): Promise<unknown[]>;
	import(projectId: string, sourcePath: string): Promise<unknown>;
	delete(projectId: string, skillId: string): Promise<boolean>;
	getContent(
		projectId: string,
		skillId: string,
		filename: string
	): Promise<string | null>;
	browse(): Promise<string | null>;
	getPath(projectId: string): Promise<string>;
	scanGlobal(): Promise<unknown[]>;
	syncForClaude(projectId: string): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// AI Pipeline
// ---------------------------------------------------------------------------

export interface PlatformAIPipelineAPI {
	check(): Promise<{ available: boolean; models?: string[] }>;
	status(): Promise<unknown>;
	generate(options: Record<string, unknown>): Promise<unknown>;
	listModels(): Promise<unknown[]>;
	estimateCost(options: Record<string, unknown>): Promise<unknown>;
	cancel(sessionId: string): Promise<boolean>;
	refresh(): Promise<void>;
	onProgress(
		callback: (progress: {
			stage: string;
			percent: number;
			message: string;
			model?: string;
			eta?: number;
			sessionId?: string;
		}) => void
	): () => void;
}

// ---------------------------------------------------------------------------
// Media Import
// ---------------------------------------------------------------------------

export interface PlatformMediaImportAPI {
	import(options: {
		projectId: string;
		filePaths: string[];
		useSymlinks?: boolean;
	}): Promise<{ imported: Array<{ id: string; path: string }> }>;
	validateSymlink(path: string): Promise<{ valid: boolean; target?: string }>;
	locateOriginal(mediaPath: string): Promise<string | null>;
	relinkMedia(
		projectId: string,
		mediaId: string,
		newSourcePath: string
	): Promise<boolean>;
	remove(projectId: string, mediaId: string): Promise<boolean>;
	checkSymlinkSupport(): Promise<boolean>;
	getMediaPath(projectId: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Project Folder
// ---------------------------------------------------------------------------

export interface PlatformProjectFolderAPI {
	getRoot(projectId: string): Promise<string>;
	scan(
		projectId: string,
		subPath?: string,
		options?: Record<string, unknown>
	): Promise<unknown>;
	list(projectId: string, subPath?: string): Promise<unknown[]>;
	ensureStructure(projectId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Project JSON
// ---------------------------------------------------------------------------

export interface PlatformProjectJsonAPI {
	write(projectId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Remotion Folder
// ---------------------------------------------------------------------------

export interface PlatformRemotionFolderAPI {
	select(): Promise<string | null>;
	scan(folderPath: string): Promise<unknown>;
	bundle(
		folderPath: string,
		compositionIds?: string[]
	): Promise<{ success: boolean; bundlePath?: string; error?: string }>;
	import(folderPath: string): Promise<unknown>;
	checkBundler(): Promise<{ available: boolean }>;
	validate(folderPath: string): Promise<{ valid: boolean; errors?: string[] }>;
	bundleFile(
		filePath: string,
		compositionId: string
	): Promise<{ success: boolean; bundlePath?: string; error?: string }>;
}

// ---------------------------------------------------------------------------
// Moyin (Script-to-Storyboard)
// ---------------------------------------------------------------------------

export interface PlatformMoyinAPI {
	parseScript(options: Record<string, unknown>): Promise<unknown>;
	generateStoryboard(options: Record<string, unknown>): Promise<unknown>;
	callLLM(options: Record<string, unknown>): Promise<unknown>;
	isClaudeAvailable(): Promise<boolean>;
	saveTempScript(options: { rawScript: string }): Promise<string>;
	cleanupTempScript(filePath: string): Promise<void>;
	onParsed(callback: (data: unknown) => void): void;
	removeParseListener(): void;
	onSetScript(callback: (data: { text: string }) => void): void;
	onTriggerParse(callback: () => void): void;
	onGenerateScript(
		callback: (data: {
			idea: string;
			genre?: string;
			targetDuration?: string;
		}) => void
	): void;
	onStatusRequest(callback: (data: { requestId: string }) => void): void;
	sendStatusResponse(
		requestId: string,
		result?: Record<string, unknown>,
		error?: string
	): void;
	onExportRequest(callback: (data: { requestId: string }) => void): void;
	sendExportResponse(
		requestId: string,
		result?: Record<string, unknown>,
		error?: string
	): void;
	removeMoyinBridgeListeners(): void;
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export interface PlatformUpdatesAPI {
	checkForUpdates(): Promise<unknown>;
	installUpdate(): Promise<void>;
	getReleaseNotes(version?: string): Promise<string>;
	getChangelog(): Promise<string>;
	onUpdateAvailable(
		callback: (data: {
			version: string;
			releaseNotes?: string;
			releaseDate?: string;
		}) => void
	): () => void;
	onDownloadProgress(
		callback: (data: {
			percent: number;
			transferred: number;
			total: number;
		}) => void
	): () => void;
	onUpdateDownloaded(callback: (data: { version: string }) => void): () => void;
}

// ---------------------------------------------------------------------------
// Filler Analysis (root-level)
// ---------------------------------------------------------------------------

export interface PlatformFillerAnalysisAPI {
	analyzeFillers(options: {
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
	}>;
}
