/**
 * Shot and scene data models for ViMax pipeline.
 *
 * Ported from: vimax/interfaces/shot.py
 */

export enum ShotType {
	WIDE = "wide",
	MEDIUM = "medium",
	CLOSE_UP = "close_up",
	EXTREME_CLOSE_UP = "extreme_close_up",
	ESTABLISHING = "establishing",
	OVER_THE_SHOULDER = "over_the_shoulder",
	POV = "pov",
	TWO_SHOT = "two_shot",
	INSERT = "insert",
}

export enum CameraMovement {
	STATIC = "static",
	PAN = "pan",
	TILT = "tilt",
	ZOOM = "zoom",
	DOLLY = "dolly",
	TRACKING = "tracking",
	CRANE = "crane",
	HANDHELD = "handheld",
}

/** Complete shot description for video generation. */
export interface ShotDescription {
	shot_id: string;
	shot_type: ShotType;
	description: string;

	// Camera settings
	camera_movement: CameraMovement;
	camera_angle: string;

	// Scene context
	location: string;
	time_of_day: string;
	lighting: string;

	// Characters
	characters: string[];

	// Duration
	duration_seconds: number;

	// Reference images for character consistency
	character_references: Record<string, string>;
	primary_reference_image?: string;
}

/** Simplified shot description for quick reference. */
export interface ShotBriefDescription {
	shot_id: string;
	shot_type: ShotType;
	brief: string;
}

/** Scene containing multiple shots. */
export interface Scene {
	scene_id: string;
	title: string;
	description: string;
	location: string;
	time: string;
	shots: ShotDescription[];
}

/** Complete storyboard with scenes and shots. */
export interface Storyboard {
	title: string;
	description: string;
	scenes: Scene[];
}

// -- Factory helpers --

export function createShotDescription(
	partial: Partial<ShotDescription> & { shot_id: string; description: string }
): ShotDescription {
	return {
		shot_type: ShotType.MEDIUM,
		camera_movement: CameraMovement.STATIC,
		camera_angle: "eye_level",
		location: "",
		time_of_day: "",
		lighting: "",
		characters: [],
		duration_seconds: 5.0,
		character_references: {},
		...partial,
	};
}

export function createScene(
	partial: Partial<Scene> & { scene_id: string }
): Scene {
	return {
		title: "",
		description: "",
		location: "",
		time: "",
		shots: [],
		...partial,
	};
}

// -- Computed helpers --

export function getSceneShotCount(scene: Scene): number {
	return scene.shots.length;
}

export function getSceneTotalDuration(scene: Scene): number {
	return scene.shots.reduce((sum, shot) => sum + shot.duration_seconds, 0);
}

export function getStoryboardTotalShots(storyboard: Storyboard): number {
	return storyboard.scenes.reduce((sum, scene) => sum + scene.shots.length, 0);
}

export function getStoryboardTotalDuration(storyboard: Storyboard): number {
	return storyboard.scenes.reduce(
		(sum, scene) => sum + getSceneTotalDuration(scene),
		0
	);
}
