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
	): Promise<{ success: boolean; url?: string; error?: string }>;
	uploadImage(
		imageData: Uint8Array,
		filename: string,
		apiKey: string
	): Promise<{ success: boolean; url?: string; error?: string }>;
	uploadAudio(
		audioData: Uint8Array,
		filename: string,
		apiKey: string
	): Promise<{ success: boolean; url?: string; error?: string }>;
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
	fetchStars(): Promise<{ stars: number; url?: string }>;
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
	}): Promise<{ success?: boolean; sessionId?: string; error?: string }>;
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

export interface PlatformSkillItem {
	id: string;
	name: string;
	description: string;
	dependencies?: string;
	folderName: string;
	mainFile: string;
	additionalFiles: string[];
	content: string;
	createdAt: number;
	updatedAt: number;
}

export interface PlatformAvailableSkill {
	path: string;
	name: string;
	description: string;
	bundled?: boolean;
}

export interface PlatformSkillsAPI {
	list(projectId: string): Promise<PlatformSkillItem[]>;
	import(
		projectId: string,
		sourcePath: string
	): Promise<PlatformSkillItem | null>;
	delete(projectId: string, skillId: string): Promise<boolean | void>;
	getContent(
		projectId: string,
		skillId: string,
		filename: string
	): Promise<string | null>;
	browse(): Promise<string | null>;
	getPath(projectId: string): Promise<string>;
	scanGlobal(): Promise<PlatformAvailableSkill[]>;
	syncForClaude(projectId: string): Promise<{
		synced: boolean;
		copied: number;
		skipped: number;
		removed: number;
		warnings: string[];
		error?: string;
	}>;
}

// ---------------------------------------------------------------------------
// AI Pipeline
// ---------------------------------------------------------------------------

export interface PlatformAIPipelineAPI {
	check(): Promise<{ available: boolean; models?: string[]; error?: string }>;
	status(): Promise<{
		available: boolean;
		version: string | null;
		source: "native" | "bundled" | "system" | "python" | "unavailable";
		compatible: boolean;
		features: Record<string, boolean>;
		error?: string;
	}>;
	generate(options: Record<string, unknown>): Promise<{
		success: boolean;
		outputPath?: string;
		outputPaths?: string[];
		error?: string;
		errorCode?: string;
		duration?: number;
		cost?: number;
		models?: string[];
		data?: unknown;
		mediaId?: string;
		importedPath?: string;
	}>;
	listModels(): Promise<unknown>;
	estimateCost(options: Record<string, unknown>): Promise<unknown>;
	cancel(sessionId: string): Promise<boolean>;
	refresh(): Promise<{
		available: boolean;
		version: string | null;
		source: "native" | "bundled" | "system" | "python" | "unavailable";
		compatible: boolean;
		features: Record<string, boolean>;
		error?: string;
	} | void>;
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
	import(
		options:
			| {
					sourcePath: string;
					projectId: string;
					filePaths?: string[];
					mediaId?: string;
					preferSymlink?: boolean;
					useSymlinks?: boolean;
			  }
			| {
					sourcePath?: string;
					projectId: string;
					filePaths: string[];
					mediaId?: string;
					preferSymlink?: boolean;
					useSymlinks?: boolean;
			  }
	): Promise<{
		success?: boolean;
		imported?: Array<{ id: string; path: string }>;
		targetPath?: string;
		importMethod?: "symlink" | "copy";
		originalPath?: string;
		fileSize?: number;
		error?: string;
	}>;
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
	): Promise<{
		files: Array<{
			name: string;
			path: string;
			relativePath: string;
			type: "video" | "audio" | "image" | "unknown";
			size: number;
			modifiedAt: number;
			isDirectory: boolean;
		}>;
		folders: string[];
		totalSize: number;
		scanTime: number;
	}>;
	list(
		projectId: string,
		subPath?: string
	): Promise<
		Array<{
			name: string;
			path: string;
			relativePath: string;
			type: "video" | "audio" | "image" | "unknown";
			size: number;
			modifiedAt: number;
			isDirectory: boolean;
		}>
	>;
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
	select(): Promise<{
		success: boolean;
		folderPath?: string;
		cancelled?: boolean;
		error?: string;
	}>;
	scan(folderPath: string): Promise<{
		isValid: boolean;
		rootFilePath: string | null;
		compositions: Array<{
			id: string;
			name: string;
			durationInFrames: number;
			fps: number;
			width: number;
			height: number;
			componentPath: string;
			importPath: string;
			line: number;
		}>;
		error?: string;
	}>;
	bundle(
		folderPath: string,
		compositionIds?: string[]
	): Promise<{
		success: boolean;
		bundlePath?: string;
		error?: string;
	}>;
	import(folderPath: string): Promise<{
		success: boolean;
		compositions?: Array<{
			id: string;
			name: string;
			[key: string]: unknown;
		}>;
		scan?: {
			compositions?: Array<{
				id: string;
				name: string;
				[key: string]: unknown;
			}>;
			[key: string]: unknown;
		};
		bundle?: {
			results?: unknown;
			[key: string]: unknown;
		};
		importTime?: number;
		error?: string;
	}>;
	checkBundler(): Promise<{ available: boolean }>;
	validate(
		folderPath: string
	): Promise<{
		isValid: boolean;
		valid?: boolean;
		error?: string;
		errors?: string[];
	}>;
	bundleFile(
		filePath: string,
		compositionId: string
	): Promise<{
		compositionId?: string;
		success: boolean;
		code?: string;
		bundlePath?: string;
		error?: string;
	}>;
}

// ---------------------------------------------------------------------------
// Moyin (Script-to-Storyboard)
// ---------------------------------------------------------------------------

export interface PlatformMoyinAPI {
	parseScript(options: Record<string, unknown>): Promise<{
		success: boolean;
		data?: Record<string, unknown>;
		error?: string;
	}>;
	generateStoryboard(options: Record<string, unknown>): Promise<{
		success: boolean;
		outputPaths?: string[];
		error?: string;
	}>;
	callLLM(options: Record<string, unknown>): Promise<{
		success: boolean;
		text?: string;
		error?: string;
	}>;
	isClaudeAvailable(): Promise<boolean>;
	saveTempScript(options: { rawScript: string }): Promise<{
		success: boolean;
		filePath?: string;
		projectRoot?: string;
		error?: string;
	}>;
	cleanupTempScript(filePath: string): Promise<void>;
	onParsed(callback: (data: Record<string, unknown>) => void): void;
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
// Remotion Pre-Render (separate from folder operations)
// ---------------------------------------------------------------------------

export interface PlatformRemotionAPI {
	preRender(options: {
		elementId: string;
		componentId: string;
		props: Record<string, unknown>;
		outputDir: string;
		format: string;
		quality: number;
		width: number;
		height: number;
		fps: number;
		totalFrames: number;
	}): Promise<{
		success: boolean;
		frames: Record<string, string>;
		sessionId?: string;
		error?: string;
	}>;
	onPreRenderProgress(
		callback: (data: { elementId: string; frame: number }) => void
	): () => void;
	cleanup(sessionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export interface PlatformUpdatesAPI {
	checkForUpdates(): Promise<unknown>;
	installUpdate(): Promise<void>;
	getReleaseNotes(version?: string): Promise<unknown>;
	getChangelog(): Promise<unknown>;
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
