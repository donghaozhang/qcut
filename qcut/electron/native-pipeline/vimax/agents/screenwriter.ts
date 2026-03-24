/**
 * Screenwriter Agent
 *
 * Generates screenplay/script content from ideas, outlines, or stories.
 * Produces structured scripts with scenes, shots, and visual descriptions.
 *
 * Ported from: vimax/agents/screenwriter.py
 */

import {
	BaseAgent,
	type AgentConfig,
	type AgentResult,
	createAgentConfig,
	agentOk,
	agentFail,
} from "./base-agent.js";
import {
	SCREENPLAY_JSON_SCHEMA,
	validateScreenplayResponse,
} from "./schemas.js";
import { LLMAdapter, type Message } from "../adapters/llm-adapter.js";
import {
	type Scene,
	type ShotDescription,
	ShotType,
	CameraMovement,
	createScene,
	createShotDescription,
} from "../types/shot.js";
import { detectLanguageInstruction } from "../detect-language.js";

export interface Script {
	title: string;
	logline: string;
	scenes: Scene[];
	total_duration: number;
}

export interface ScreenwriterConfig extends AgentConfig {
	target_duration: number;
	shots_per_scene: number;
	style: string;
}

export function createScreenwriterConfig(
	partial?: Partial<ScreenwriterConfig>
): ScreenwriterConfig {
	return {
		...createAgentConfig({ name: "Screenwriter" }),
		model: "kimi-k2.5",
		target_duration: 60.0,
		shots_per_scene: 5,
		style: "cinematic, visually descriptive",
		...partial,
	};
}

const SCREENPLAY_PROMPT = `You are an expert screenwriter specializing in visual storytelling for short-form video production.
{lang_instruction}

Create a detailed screenplay from this content:
{idea}

Requirements:
- Target duration: {duration} seconds
- Style: {style}
- Number of scenes: {num_scenes}
- Shots per scene: {shots_per_scene}

For each scene, provide:
1. Scene title and location
2. Time of day and lighting
3. Multiple shots (each shot = one camera angle, 3-8 seconds), where each shot description includes:
   - The visual scene: what the camera SEES (character positions, expressions, actions, environment)
   - Dialogue lines: if characters speak, include the full line with character name and emotion/tone direction
   - Camera details: shot type, movement, composition

IMPORTANT: Preserve ALL dialogue from the source material. Each dialogue exchange should be its own shot or part of a shot. Do not summarize or skip any lines.

Example description format:
"近景，沈念安脸色煞白，身体微微颤抖，紧紧盯着顾承泽。沈念安（声音颤抖）：'承泽，你说话啊！她说的……是不是真的？'顾承泽眼神躲闪，不敢直视沈念安，愧疚地低下了头。"`;


/** Camera movement aliases → valid enum values. */
const CAMERA_MOVEMENT_ALIASES: Record<string, string> = {
	push_in: "dolly",
	push_out: "dolly",
	slow_push_in: "dolly",
	pull_back: "dolly",
	move_forward: "dolly",
	move_back: "dolly",
	follow: "tracking",
	track: "tracking",
	pan_left: "pan",
	pan_right: "pan",
	slow_pan: "pan",
	tilt_up: "tilt",
	tilt_down: "tilt",
	zoom_in: "zoom",
	zoom_out: "zoom",
	crane_up: "crane",
	crane_down: "crane",
	steady: "static",
	fixed: "static",
	locked: "static",
};

function parseShotType(value: unknown): ShotType {
	if (typeof value !== "string") return ShotType.MEDIUM;
	const normalized = value.toLowerCase().replace(/[\s-]/g, "_");
	const valid = Object.values(ShotType) as string[];
	if (valid.includes(normalized)) return normalized as ShotType;
	return ShotType.MEDIUM;
}

function parseCameraMovement(value: unknown): CameraMovement {
	if (typeof value !== "string") return CameraMovement.STATIC;
	const normalized = value.toLowerCase().replace(/[\s-]/g, "_");
	const aliased = CAMERA_MOVEMENT_ALIASES[normalized] ?? normalized;
	const valid = Object.values(CameraMovement) as string[];
	if (valid.includes(aliased)) return aliased as CameraMovement;
	return CameraMovement.STATIC;
}

export class Screenwriter extends BaseAgent<string, Script> {
	declare config: ScreenwriterConfig;
	private _llm: LLMAdapter | null = null;

	constructor(config?: Partial<ScreenwriterConfig>) {
		super(createScreenwriterConfig(config));
	}

	private async _ensureLlm(): Promise<void> {
		if (!this._llm) {
			this._llm = new LLMAdapter({ model: this.config.model });
			await this._llm.initialize();
		}
	}

	async process(idea: string): Promise<AgentResult<Script>> {
		await this._ensureLlm();

		console.log(
			`[screenwriter] Generating screenplay for: ${idea.slice(0, 100)}...`
		);

		try {
			if (this.config.target_duration <= 0) {
				throw new Error(
					`target_duration must be > 0, got ${this.config.target_duration}`
				);
			}
			if (this.config.shots_per_scene <= 0) {
				throw new Error(
					`shots_per_scene must be > 0, got ${this.config.shots_per_scene}`
				);
			}

			const avgShotDuration = 5.0;
			const totalShots = this.config.target_duration / avgShotDuration;
			const numScenes = Math.max(
				1,
				Math.floor(totalShots / this.config.shots_per_scene)
			);

			const langInstruction = detectLanguageInstruction(idea);
			const prompt = SCREENPLAY_PROMPT.replace(
				"{lang_instruction}",
				langInstruction
			)
				.replace("{idea}", idea)
				.replace("{duration}", String(this.config.target_duration))
				.replace("{style}", this.config.style)
				.replace("{num_scenes}", String(numScenes))
				.replace("{shots_per_scene}", String(this.config.shots_per_scene));

			const messages: Message[] = [{ role: "user", content: prompt }];

			const screenplay = await this._llm!.chatWithStructuredOutput(
				messages,
				"screenplay",
				SCREENPLAY_JSON_SCHEMA,
				validateScreenplayResponse,
				{ temperature: 0.7 }
			);

			// Convert to internal Script model
			const scenes: Scene[] = [];
			let totalDuration = 0;

			for (const sceneData of screenplay.scenes) {
				const shots: ShotDescription[] = [];
				for (const shotData of sceneData.shots) {
					const shot = createShotDescription({
						shot_id: shotData.shot_id || `shot_${shots.length + 1}`,
						shot_type: parseShotType(shotData.shot_type),
						description: shotData.description || "",
						camera_movement: parseCameraMovement(shotData.camera_movement),
						characters: shotData.characters || [],
						duration_seconds: shotData.duration_seconds || 5.0,
						});
					shots.push(shot);
					totalDuration += shot.duration_seconds;
				}

				scenes.push(
					createScene({
						scene_id: sceneData.scene_id || `scene_${scenes.length + 1}`,
						title: sceneData.title || "",
						description: "",
						location: sceneData.location || "",
						time: sceneData.time || "",
						shots,
					})
				);
			}

			const script: Script = {
				title: screenplay.title || "Untitled",
				logline: screenplay.logline || "",
				scenes,
				total_duration: totalDuration,
			};

			const shotCount = scenes.reduce((sum, s) => sum + s.shots.length, 0);
			console.log(
				`[screenwriter] Generated: ${scenes.length} scenes, ${shotCount} shots, ${totalDuration.toFixed(1)}s`
			);

			return agentOk(script, {
				scene_count: scenes.length,
				shot_count: shotCount,
				duration: totalDuration,
				cost: 0,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[screenwriter] Failed: ${msg}`);
			return agentFail(msg);
		}
	}
}
