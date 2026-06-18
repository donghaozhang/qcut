export type ConsistencyCategory =
	| "proportion/height"
	| "identity/face"
	| "clothing/appearance"
	| "body/limb"
	| "other";

export type Severity = "low" | "medium" | "high";

export type ConsistencyLanguage = "zh" | "en";

export interface VideoMeta {
	fps: number;
	durationSeconds: number;
	totalFrames: number;
}

export interface Keyframe {
	index: number;
	frameNumber: number;
	timeSeconds: number;
	path: string;
}

export interface ConsistencyFinding {
	startFrame: number;
	endFrame: number;
	startTime: string;
	endTime: string;
	category: ConsistencyCategory;
	severity: Severity;
	comment: string;
	fix: string;
}

export interface ConsistencyRunOptions {
	refs: string[];
	videoInput: string;
	model: string;
	language: ConsistencyLanguage;
	fps: number;
	sceneDetect: boolean;
	batchSize: number;
	minSeverity: Severity;
	maxTokens: number;
	outputDir: string;
}

export interface ConsistencyResult {
	video: string;
	model: string;
	videoFps: number;
	totalFrames: number;
	referenceImages: string[];
	samplingFps: number;
	minSeverity: Severity;
	findings: ConsistencyFinding[];
}

export const DEFAULT_CONSISTENCY_OPTIONS = {
	model: "openrouter_gemini_3_5_flash_video",
	language: "zh",
	fps: 1,
	sceneDetect: false,
	batchSize: 6,
	minSeverity: "high",
	maxTokens: 8000,
} as const satisfies Omit<
	ConsistencyRunOptions,
	"refs" | "videoInput" | "outputDir"
>;

export const CONSISTENCY_CATEGORIES: ConsistencyCategory[] = [
	"proportion/height",
	"identity/face",
	"clothing/appearance",
	"body/limb",
	"other",
];

export const CONSISTENCY_SEVERITIES: Severity[] = ["low", "medium", "high"];
