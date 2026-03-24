/**
 * Replicate Planner — converts a VideoRecipe into a ViMax Script for generation.
 *
 * Filters shots by strategy (skip title/transition if desired), then
 * delegates type conversion to replicate-converter.
 *
 * @module electron/native-pipeline/replicate/replicate-planner
 */

import type {
	VideoRecipe,
	ShotRecipe,
	PlannedShot,
	ShotStrategy,
} from "./replicate-types.js";
import { convertRecipeToScript } from "./replicate-converter.js";
import type { Script } from "../vimax/agents/screenwriter.js";

export interface PlannerOptions {
	/** Skip title-only and transition-only shots. */
	skipNonVisual?: boolean;
	/** Preferred video generation model key (passed to runner config). */
	videoModel?: string;
	/** Preferred image generation model key (passed to runner config). */
	imageModel?: string;
	/** Force a specific strategy for all shots. */
	forceStrategy?: ShotStrategy;
}

export interface PlanResult {
	script: Script;
	videoModel: string;
	imageModel: string;
	skippedCount: number;
}

/**
 * Plan the replication by filtering shots and converting to a ViMax Script.
 */
export function planReplicate(
	recipe: VideoRecipe,
	options: PlannerOptions = {}
): PlanResult {
	let filteredShots: ShotRecipe[];
	let skippedCount = 0;

	if (options.skipNonVisual) {
		filteredShots = recipe.shots.filter(
			(s) => s.type !== "title" && s.type !== "transition"
		);
		skippedCount = recipe.shots.length - filteredShots.length;
	} else {
		filteredShots = recipe.shots;
	}

	const filteredRecipe: VideoRecipe = { ...recipe, shots: filteredShots };
	const script = convertRecipeToScript(filteredRecipe);

	return {
		script,
		videoModel: options.videoModel || "kling_2_6_pro",
		imageModel: options.imageModel || "nano_banana_pro",
		skippedCount,
	};
}

/**
 * Map each shot in the recipe to a PlannedShot with a generation strategy.
 *
 * Title and transition shots default to "ai-image"; others default to "ai-video".
 */
export function planShots(
	recipe: VideoRecipe,
	options: PlannerOptions = {}
): PlannedShot[] {
	const videoModel = options.videoModel || "kling_2_6_pro";
	const imageModel = options.imageModel || "nano_banana_pro";

	return recipe.shots.map((shot) => {
		if (options.forceStrategy) {
			return {
				...shot,
				strategy: options.forceStrategy,
				model:
					options.forceStrategy === "ai-image"
						? imageModel
						: videoModel,
			};
		}

		const strategy = getShotStrategy(shot);
		const model = strategy === "ai-image" ? imageModel : videoModel;
		return { ...shot, strategy, model };
	});
}

function getShotStrategy(shot: ShotRecipe): ShotStrategy {
	if (shot.type === "title" || shot.type === "transition") {
		return "ai-image";
	}
	return "ai-video";
}
