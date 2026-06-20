import type { Severity } from "../character-consistency/types.js";

export type { Severity };

export type ImageConsistencyLanguage = "zh" | "en";

export interface ImageCandidate {
	index: number;
	path: string;
}

export interface ImageFinding {
	imageIndex: number;
	imagePath: string;
	category: string;
	severity: Severity;
	comment: string;
	fix: string;
}

export interface ImageConsistencyRunOptions {
	refs: string[];
	candidates: string[];
	dir?: string;
	rule?: string;
	model: string;
	language: ImageConsistencyLanguage;
	batchSize: number;
	minSeverity: Severity;
	maxTokens: number;
	outputDir: string;
}

export interface ImageConsistencyResult {
	model: string;
	language: ImageConsistencyLanguage;
	referenceImages: string[];
	candidateImages: string[];
	ruleApplied: boolean;
	minSeverity: Severity;
	findings: ImageFinding[];
}

export const DEFAULT_IMAGE_CONSISTENCY_OPTIONS = {
	model: "openrouter_gemini_3_5_flash_video",
	language: "zh",
	batchSize: 6,
	minSeverity: "high",
	maxTokens: 8000,
} as const satisfies Omit<
	ImageConsistencyRunOptions,
	"refs" | "candidates" | "rule" | "outputDir"
>;

/**
 * Suggested categories shown to the model. Unlike the video mode's fixed
 * enum, image mode allows custom category strings so user-defined rules
 * (material, background, palette, ...) keep their signal instead of
 * collapsing into "other".
 */
export const SUGGESTED_IMAGE_CATEGORIES: string[] = [
	"proportion/height",
	"identity/face",
	"clothing/appearance",
	"body/limb",
	"prop/material",
	"background/scene",
	"style/color",
	"other",
];

export const IMAGE_EXTENSIONS = [
	".jpg",
	".jpeg",
	".png",
	".webp",
	".gif",
] as const;
