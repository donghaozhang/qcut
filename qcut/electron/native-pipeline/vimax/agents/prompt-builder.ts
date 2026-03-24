/**
 * Prompt Builder
 *
 * Post-processes segmented scripts to add production-ready `prompt_description`
 * to each shot. Combines visual style, scene context, camera info, character
 * appearances, and the original description into a single prompt string.
 *
 * No LLM call needed — purely programmatic assembly from existing data.
 *
 * Output format per shot (following 小云雀 style):
 * "{duration}s：时间: {time}, 场景: {location}，镜头：{camera}，{character refs}，{description}"
 */

import type { Script } from "./screenwriter.js";
import type { Scene, ShotDescription } from "../types/shot.js";
import type { CharacterInNovel } from "../types/character.js";

export interface PromptBuilderConfig {
	/** Visual style tag, e.g. "真人写实, 电视风格, 暖色调, 都市女频" */
	style: string;
	/** Target total duration per segment group (seconds) */
	segment_duration: number;
}

const DEFAULT_CONFIG: PromptBuilderConfig = {
	style: "真人写实, 电视风格, 暖色调",
	segment_duration: 15,
};

const SHOT_TYPE_LABELS: Record<string, string> = {
	wide: "远景",
	medium: "中景",
	close_up: "近景特写",
	extreme_close_up: "极近特写",
	full: "全景",
	over_shoulder: "过肩镜头",
	pov: "主观视角",
};

const CAMERA_MOVEMENT_LABELS: Record<string, string> = {
	static: "固定",
	pan: "横摇",
	tilt: "俯仰",
	dolly: "推拉",
	zoom: "变焦",
	tracking: "跟踪",
	crane: "摇臂",
	handheld: "手持",
};

/**
 * Build a character lookup map from the extracted characters.
 * Maps character name → short appearance description.
 */
function buildCharacterMap(
	characters: CharacterInNovel[]
): Map<string, string> {
	const map = new Map<string, string>();
	for (const c of characters) {
		const parts: string[] = [];
		if (c.appearance) parts.push(c.appearance);
		else if (c.description) parts.push(c.description);
		map.set(c.name, parts.join("，") || c.name);
	}
	return map;
}

/**
 * Build prompt_description for a single shot.
 */
function buildShotPrompt(
	shot: ShotDescription,
	scene: Scene,
	characterMap: Map<string, string>,
	style: string
): string {
	const parts: string[] = [];

	// Style header
	parts.push(`画面风格: ${style}`);

	// Time and location from scene
	if (scene.time) parts.push(`时间: ${scene.time}`);
	if (scene.location) parts.push(`场景: ${scene.location}`);

	// Camera
	const shotLabel =
		SHOT_TYPE_LABELS[shot.shot_type] || shot.shot_type;
	const movementLabel =
		CAMERA_MOVEMENT_LABELS[
			typeof shot.camera_movement === "string"
				? shot.camera_movement
				: "static"
		] || shot.camera_movement;
	parts.push(`镜头: ${shotLabel}，${movementLabel}`);

	// Characters with appearance
	if (shot.characters.length > 0) {
		const charDescs: string[] = [];
		for (const name of shot.characters) {
			const appearance = characterMap.get(name);
			if (appearance) {
				charDescs.push(`【${name}】${appearance}`);
			} else {
				charDescs.push(`【${name}】`);
			}
		}
		parts.push(`角色: ${charDescs.join("，")}`);
	}

	// Original description (verbatim)
	parts.push(`内容: ${shot.description}`);

	return parts.join("\n");
}

/**
 * Enrich all shots in a script with `prompt_description`.
 * Mutates the script in place and returns it.
 */
export function buildPromptDescriptions(
	script: Script,
	characters: CharacterInNovel[],
	config?: Partial<PromptBuilderConfig>
): Script {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const characterMap = buildCharacterMap(characters);

	for (const scene of script.scenes) {
		for (const shot of scene.shots) {
			shot.prompt_description = buildShotPrompt(
				shot,
				scene,
				characterMap,
				cfg.style
			);
		}
	}

	return script;
}
