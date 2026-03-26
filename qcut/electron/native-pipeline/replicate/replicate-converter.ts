/**
 * Replicate Converter — maps VideoRecipe types to ViMax Script/Scene/Shot types.
 *
 * Bridges the replicate analyzer output (VideoRecipe) to the ViMax pipeline
 * input format (Script) so that StoryboardArtist and CameraImageGenerator
 * can process the shots directly.
 *
 * @module electron/native-pipeline/replicate/replicate-converter
 */

import type { VideoRecipe, ShotRecipe } from "./replicate-types.js";
import {
	ShotType,
	CameraMovement,
	createShotDescription,
	createScene,
	type ShotDescription,
	type Scene,
} from "../vimax/types/shot.js";
import type { Script } from "../vimax/agents/screenwriter.js";

/** Map ShotRecipe.type → ViMax ShotType. */
const SHOT_TYPE_MAP: Record<ShotRecipe["type"], ShotType> = {
	wide: ShotType.WIDE,
	medium: ShotType.MEDIUM,
	closeup: ShotType.CLOSE_UP,
	detail: ShotType.INSERT,
	transition: ShotType.MEDIUM,
	title: ShotType.WIDE,
};

/** Map ShotRecipe.camera → ViMax CameraMovement. */
const CAMERA_MAP: Record<ShotRecipe["camera"], CameraMovement> = {
	static: CameraMovement.STATIC,
	"pan-left": CameraMovement.PAN,
	"pan-right": CameraMovement.PAN,
	"zoom-in": CameraMovement.ZOOM,
	"zoom-out": CameraMovement.ZOOM,
	tracking: CameraMovement.TRACKING,
};

/** Convert a single ShotRecipe to a ViMax ShotDescription. */
export function convertShot(shot: ShotRecipe): ShotDescription {
	return createShotDescription({
		shot_id: `shot_${String(shot.index).padStart(3, "0")}`,
		shot_type: SHOT_TYPE_MAP[shot.type] ?? ShotType.MEDIUM,
		description: shot.description,
		camera_movement: CAMERA_MAP[shot.camera] ?? CameraMovement.STATIC,
		camera_angle: "eye_level",
		duration_seconds: shot.duration ?? 5,
		prompt_description: shot.prompt,
	});
}

/** Convert a VideoRecipe to a ViMax Script with a single scene. */
export function convertRecipeToScript(recipe: VideoRecipe): Script {
	const shots = recipe.shots.map(convertShot);

	const scene: Scene = createScene({
		scene_id: "scene_001",
		title: recipe.style.genre || "Main",
		description: `Replicated ${recipe.source.filename}`,
		location: "",
		time: "",
		shots,
	});

	const totalDuration = recipe.shots.reduce(
		(sum, s) => sum + (s.duration || 0),
		0
	);

	return {
		title: recipe.source.filename.replace(/\.[^.]+$/, ""),
		logline: `AI replication of ${recipe.source.filename} — ${recipe.style.genre}, ${recipe.style.mood}`,
		scenes: [scene],
		total_duration: totalDuration,
	};
}
