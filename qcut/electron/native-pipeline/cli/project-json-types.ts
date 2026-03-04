/**
 * Project JSON Schema Types — Agent-Readable Project State
 *
 * Two modes:
 * - **Full** (`ProjectJSON`): Complete state with all arrays (~2000 tokens)
 * - **Minimal** (`ProjectJSONMinimal`): Counts + settings (~200 tokens)
 *
 * @module electron/native-pipeline/cli/project-json-types
 */

// ---------------------------------------------------------------------------
// Full Schema
// ---------------------------------------------------------------------------

export interface ProjectJSON {
	/** Schema version for forward compatibility */
	version: "1.0";

	/** UUID from project-store */
	projectId: string;

	/** User-defined project name */
	name: string;

	/** ISO 8601 timestamps */
	createdAt: string;
	updatedAt: string;

	/** Canvas and render settings */
	settings: ProjectSettings;

	/** Imported media assets */
	media: MediaEntry[];

	/** Subtitle/caption files */
	subtitles: SubtitleEntry[];

	/** AI-generated assets */
	generated: GeneratedEntry[];

	/** Export history */
	exports: ExportEntry[];

	/** Active/recent pipeline jobs */
	jobs: JobEntry[];

	/** API key availability (never exposes actual keys) */
	apiKeys: ApiKeyStatus;
}

export interface ProjectSettings {
	/** Canvas dimensions in pixels */
	width: number;
	height: number;

	/** Frames per second (default: 30) */
	fps: number;

	/** Display aspect ratio, e.g. "16:9" */
	aspectRatio: string;

	/** Canvas background color (hex) */
	backgroundColor: string;

	/** Background mode */
	backgroundType: "color" | "blur";

	/** Default output format */
	outputFormat: "mp4" | "webm" | "mov";

	/** Output quality preset */
	outputQuality: "1080p" | "720p" | "480p";

	/** Track and element counts (read-only summary) */
	trackCount: number;
	elementCount: number;
	totalDuration: number;
}

export interface MediaEntry {
	id: string;
	type: "video" | "audio" | "image";
	name: string;
	path: string;
	duration: number | null;
	width: number | null;
	height: number | null;
	fps: number | null;
	importedAt: string;
}

export interface SubtitleEntry {
	id: string;
	mediaId: string;
	path: string;
	language: string;
	wordCount: number;
	generatedAt: string;
}

export interface GeneratedEntry {
	id: string;
	type: "image" | "video" | "audio" | "music" | "voiceover";
	model: string;
	prompt: string;
	path: string;
	cost: number | null;
	generatedAt: string;
}

export interface ExportEntry {
	id: string;
	path: string;
	preset: string;
	format: string;
	width: number;
	height: number;
	size: number;
	duration: number;
	exportedAt: string;
}

export interface JobEntry {
	jobId: string;
	command: string;
	status: "pending" | "running" | "completed" | "failed";
	startedAt: string;
	completedAt: string | null;
	error: string | null;
}

export interface ApiKeyStatus {
	fal: boolean;
	elevenlabs: boolean;
	openrouter: boolean;
	gemini: boolean;
	anthropic: boolean;
	openai: boolean;
	freesound: boolean;
}

// ---------------------------------------------------------------------------
// Minimal Schema (~200 tokens)
// ---------------------------------------------------------------------------

export interface ProjectJSONMinimal {
	version: "1.0";
	projectId: string;
	name: string;
	createdAt: string;
	updatedAt: string;

	settings: {
		width: number;
		height: number;
		fps: number;
		aspectRatio: string;
		outputFormat: string;
	};

	/** Counts only — no item details */
	counts: {
		media: { video: number; audio: number; image: number };
		subtitles: number;
		generated: number;
		tracks: number;
		elements: number;
	};

	totalDuration: number;
	lastExport: {
		path: string;
		exportedAt: string;
	} | null;

	apiKeys: ApiKeyStatus;
}
