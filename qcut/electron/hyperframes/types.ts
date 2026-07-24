export type HyperframesVariableValue = string | number | boolean;

export interface HyperframesSource {
	sourcePath: string;
	projectPath: string;
	html: string;
}

export interface HyperframesPreviewOptions {
	sourcePath: string;
	variables: Record<string, HyperframesVariableValue>;
}

export interface HyperframesPreviewResult {
	success: boolean;
	token?: string;
	url?: string;
	error?: string;
}

export interface HyperframesRenderOptions extends HyperframesPreviewOptions {
	renderId: string;
	elementId: string;
	width: number;
	height: number;
	fps: number;
	duration: number;
}

export interface HyperframesRenderResult {
	success: boolean;
	renderId: string;
	outputPath?: string;
	outputUrl?: string;
	sessionId?: string;
	frameCount?: number;
	duration?: number;
	error?: string;
}

export interface HyperframesRenderProgress {
	renderId: string;
	elementId: string;
	frame: number;
	totalFrames: number;
	progress: number;
}
