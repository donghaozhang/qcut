export type Framing = "wide" | "medium" | "close" | "macro" | "overhead";
export type Movement = "locked-off" | "handheld" | "dolly" | "slider" | "crane" | "dynamic";
export type Lighting = "natural" | "bright" | "dramatic" | "low-key" | "neon" | "soft";
export type ShotMood = "grounded" | "warm" | "tense" | "moody" | "polished" | "heightened";
export type Medium = "live-action" | "animation" | "hybrid" | "cgi";
export type ContentFormat = "film" | "tv-series" | "documentary" | "variety" | "short-film" | "short-video";

export interface CLIOptions {
	input: string;
	style?: string;
	medium?: Medium;
	format?: ContentFormat;
	framing?: Framing;
	movement?: Movement;
	lighting?: Lighting;
	mood?: ShotMood;
	lang?: string;
	shots?: number;
	promptsOnly: boolean;
	imagesOnly: boolean;
	regenerate?: number[];
	outputDir?: string;
	provider?: string;
	model?: string;
	dryRun: boolean;
}

export interface Character {
	id: string;
	role: string;
	description: string;
}

export interface SceneCamera {
	lens: string;
	framing: string;
	movement: string;
	angle: string;
}

export interface Scene {
	index: number;
	title: string;
	fileStem: string;
	camera: SceneCamera;
	lighting: string;
	location: string;
	action: string;
	characterIds: string[];
	mood: string;
	props: string[];
	colorPalette: string;
	negative: string;
}

export interface SceneBreakdown {
	characters: Character[];
	continuityNotes: string[];
	scenes: Scene[];
}

export interface AnalysisResult {
	title: string;
	topicSlug: string;
	sourcePath: string;
	sourceExtension: string;
	sourceContent: string;
	wordCount: number;
	language: string;
	style: string;
	stylePreset?: string;
	styleReason: string;
	medium: Medium;
	mediumReason: string;
	format: ContentFormat;
	formatReason: string;
	productionRules: string[];
	genreRules: string[];
	framing: Framing;
	movement: Movement;
	lighting: Lighting;
	mood: ShotMood;
	recommendedShots: number;
	targetShots: number;
}

export interface ShotProject {
	shotDir: string;
	promptsDir: string;
	analysis: AnalysisResult;
	breakdown: SceneBreakdown;
	styleInstructions: string;
}

export interface ShotRenderManifest {
	title: string;
	style: string;
	language: string;
	medium: Medium;
	format: ContentFormat;
	productionRules: string[];
	genreRules: string[];
	characters: Character[];
	continuityNotes: string[];
	scenes: Scene[];
}
