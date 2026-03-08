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

export interface Beat {
	title: string;
	body: string;
	keywords: string[];
}

export interface VisualAnchors {
	subjectId: string;
	subjectAnchor: string;
	locationId: string;
	locationAnchor: string;
	propId: string;
	propAnchor: string;
	paletteAnchor: string;
	continuityRules: string[];
}

export interface AnalysisResult {
	title: string;
	topicSlug: string;
	sourcePath: string;
	sourceExtension: string;
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
	framing: Framing;
	movement: Movement;
	lighting: Lighting;
	mood: ShotMood;
	recommendedShots: number;
	targetShots: number;
	coreThroughline: string;
	beats: Beat[];
	visualAnchors: VisualAnchors;
}

export interface ShotContinuity {
	subjectId: string;
	locationId: string;
	propId: string;
	continuityNotes: string[];
}

export interface ShotPlan {
	index: number;
	title: string;
	fileStem: string;
	shotType: "opening" | "action" | "detail" | "reaction" | "closing";
	continuity: ShotContinuity;
	framing: Framing;
	movement: Movement;
	lighting: Lighting;
	mood: ShotMood;
	purpose: string;
	beat: string;
	visualDirection: string;
	shotRoleGuidance: string;
	negativePrompt: string;
}

export interface ShotProject {
	shotDir: string;
	promptsDir: string;
	analysis: AnalysisResult;
	shots: ShotPlan[];
	styleInstructions: string;
}
