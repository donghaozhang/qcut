/**
 * Types for AI Pipeline Handler.
 * @module electron/ai-pipeline-handler/types
 */

export interface PipelineConfig {
	useBundledBinary: boolean;
	binaryPath?: string;
	pythonPath?: string;
	version?: string;
}

export interface GenerateOptions {
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

export interface PipelineProgress {
	stage: string;
	percent: number;
	message: string;
	model?: string;
	eta?: number;
}

export interface PipelineResult {
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

export interface PipelineStatus {
	available: boolean;
	version: string | null;
	source: "native" | "bundled" | "system" | "python" | "unavailable";
	compatible: boolean;
	features: Record<string, boolean>;
	error?: string;
}
