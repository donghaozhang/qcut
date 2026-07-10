/**
 * AI Pipeline types.
 */

export interface AIPipelineProgress {
	stage: string;
	percent: number;
	message: string;
	model?: string;
	eta?: number;
	sessionId?: string;
}

export interface AIPipelineGenerateOptions {
	command:
		| "generate-image"
		| "create-video"
		| "generate-avatar"
		| "generate-speech"
		| "list-models"
		| "estimate-cost"
		| "run-pipeline";
	args: Record<string, string | number | boolean>;
	outputDir?: string;
	sessionId?: string;
	projectId?: string;
	autoImport?: boolean;
}

export interface AIPipelineResult {
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
}

export interface AIPipelineCostEstimate {
	model: string;
	duration?: number;
	resolution?: string;
}

export interface AIPipelineStatus {
	available: boolean;
	version: string | null;
	source: "native" | "bundled" | "system" | "python" | "unavailable";
	compatible: boolean;
	features: Record<string, boolean>;
	error?: string;
}
