/**
 * Type definitions for the Video Replicate pipeline.
 *
 * VideoRecipe is the intermediate JSON format produced by the analyzer
 * and consumed by the planner/generator/assembler stages.
 *
 * @module electron/native-pipeline/replicate/replicate-types
 */

export interface VideoRecipe {
	version: 1;
	source: {
		filename: string;
		duration: number;
		resolution: { width: number; height: number };
		fps: number;
	};
	style: {
		genre: string;
		mood: string;
		colorPalette: string[];
		pacing: "fast" | "medium" | "slow";
	};
	audio: {
		hasBGM: boolean;
		bgmStyle?: string;
		hasVoiceover: boolean;
		voiceoverLanguage?: string;
		transcript?: string;
	};
	shots: ShotRecipe[];
}

export interface ShotRecipe {
	index: number;
	startTime: number;
	endTime: number;
	duration: number;
	type: "wide" | "medium" | "closeup" | "detail" | "transition" | "title";
	camera:
		| "static"
		| "pan-left"
		| "pan-right"
		| "zoom-in"
		| "zoom-out"
		| "tracking";
	description: string;
	prompt: string;
	transition: "cut" | "dissolve" | "fade" | "wipe" | "none";
	hasText: boolean;
	textContent?: string;
	hasSubtitle: boolean;
	subtitleText?: string;
}

/** Strategy for generating media for a single shot. */
export type ShotStrategy = "ai-video" | "ai-image" | "user-media" | "skip";

export interface PlannedShot extends ShotRecipe {
	strategy: ShotStrategy;
	model?: string;
	userMediaPath?: string;
}

export interface GeneratedShot extends PlannedShot {
	outputPath?: string;
	error?: string;
}

export interface ReplicateResult {
	success: boolean;
	recipe: VideoRecipe;
	plannedShots: PlannedShot[];
	generatedShots: GeneratedShot[];
	outputPath?: string;
	totalCost: number;
	error?: string;
}
