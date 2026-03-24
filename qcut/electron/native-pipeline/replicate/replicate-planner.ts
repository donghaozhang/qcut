/**
 * Replicate Planner — maps each shot in a VideoRecipe to a generation strategy.
 *
 * Decides whether each shot should be generated via AI video, AI image,
 * matched from user-provided media, or skipped.
 *
 * @module electron/native-pipeline/replicate/replicate-planner
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
	VideoRecipe,
	ShotRecipe,
	PlannedShot,
	ShotStrategy,
} from "./replicate-types.js";

export interface PlannerOptions {
	/** Directory of user-provided media clips to match against shots. */
	mediaDir?: string;
	/** Force all shots to a specific strategy. */
	forceStrategy?: ShotStrategy;
	/** Preferred video generation model key. */
	videoModel?: string;
	/** Preferred image generation model key. */
	imageModel?: string;
}

const VIDEO_EXTENSIONS = new Set([
	".mp4",
	".mov",
	".webm",
	".avi",
	".mkv",
]);
const IMAGE_EXTENSIONS = new Set([
	".png",
	".jpg",
	".jpeg",
	".webp",
	".bmp",
]);

/**
 * Plan generation strategies for each shot in a recipe.
 *
 * If a mediaDir is provided, scans it for files that could substitute
 * for AI-generated content (ordered by filename to match shot indices).
 */
export function planShots(
	recipe: VideoRecipe,
	options: PlannerOptions = {}
): PlannedShot[] {
	const userMedia = options.mediaDir
		? scanMediaDir(options.mediaDir)
		: [];

	return recipe.shots.map((shot, i) => {
		if (options.forceStrategy) {
			return {
				...shot,
				strategy: options.forceStrategy,
				model: resolveModel(options.forceStrategy, shot, options),
			};
		}

		// If user media exists for this index, use it
		if (i < userMedia.length) {
			return {
				...shot,
				strategy: "user-media" as const,
				userMediaPath: userMedia[i],
			};
		}

		// Title/transition shots → AI image (cheaper, static)
		if (shot.type === "title" || shot.type === "transition") {
			return {
				...shot,
				strategy: "ai-image" as const,
				model: options.imageModel || "flux_dev",
			};
		}

		// Default: AI video generation
		return {
			...shot,
			strategy: "ai-video" as const,
			model: options.videoModel || "kling_2_6_pro",
		};
	});
}

function resolveModel(
	strategy: ShotStrategy,
	_shot: ShotRecipe,
	options: PlannerOptions
): string | undefined {
	if (strategy === "ai-video") return options.videoModel || "kling_2_6_pro";
	if (strategy === "ai-image") return options.imageModel || "flux_dev";
	return undefined;
}

/** Scan a directory for media files, sorted by filename. */
function scanMediaDir(dir: string): string[] {
	const absDir = path.resolve(dir);
	if (!fs.existsSync(absDir)) return [];

	const entries = fs.readdirSync(absDir);
	return entries
		.filter((name) => {
			const ext = path.extname(name).toLowerCase();
			return VIDEO_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext);
		})
		.sort()
		.map((name) => path.join(absDir, name));
}
