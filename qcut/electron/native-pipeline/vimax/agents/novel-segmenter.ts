/**
 * Novel Segmenter Agent
 *
 * Takes raw novel text and segments it into ~15-second shots.
 * The LLM only adds metadata (shot_type, camera_movement, duration, characters).
 * Original text is preserved verbatim as the shot description — zero information loss.
 */

import {
	BaseAgent,
	type AgentConfig,
	type AgentResult,
	createAgentConfig,
	agentOk,
	agentFail,
} from "./base-agent.js";
import { LLMAdapter, type Message } from "../adapters/llm-adapter.js";
import { detectLanguageInstruction } from "../detect-language.js";
import type { Script } from "./screenwriter.js";
import {
	type Scene,
	type ShotDescription,
	ShotType,
	CameraMovement,
	createScene,
	createShotDescription,
} from "../types/shot.js";

export interface NovelSegmenterConfig extends AgentConfig {
	shot_duration: number;
}

export function createNovelSegmenterConfig(
	partial?: Partial<NovelSegmenterConfig>
): NovelSegmenterConfig {
	return {
		...createAgentConfig({ name: "NovelSegmenter" }),
		model: "google/gemini-3-flash-preview",
		shot_duration: 15,
		...partial,
	};
}

const SEGMENTATION_PROMPT = `You are an expert at segmenting novels into short video shots.
{lang_instruction}

You will receive raw novel text. Your job is to:
1. Identify scene boundaries (location/time changes)
2. Split the text within each scene into shots of approximately {shot_duration} seconds each
3. For each shot, preserve the ORIGINAL TEXT verbatim as the description — do NOT rewrite, summarize, or paraphrase
4. Add only technical metadata: shot_type, camera_movement, characters present, duration

Rules:
- Each shot should be ~{shot_duration} seconds (3-20 second range)
- One dialogue exchange or one action beat = one shot
- Stage directions (marked with △) are part of the shot they belong to
- Keep character dialogue exactly as written, including tone directions like （含情脉脉）
- Internal monologue (OS/内心独白) gets its own shot
- When location or time changes, start a new scene

TEXT:
{text}

Output a screenplay JSON with scenes and shots. Each shot description must be the exact original text, not a rewrite.`;

const SEGMENTATION_JSON_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {
		title: { type: "string" },
		logline: { type: "string" },
		scenes: {
			type: "array",
			items: {
				type: "object",
				properties: {
					scene_id: { type: "string" },
					title: { type: "string" },
					location: { type: "string" },
					time: { type: "string" },
					shots: {
						type: "array",
						items: {
							type: "object",
							properties: {
								shot_id: { type: "string" },
								shot_type: { type: "string" },
								description: { type: "string" },
								camera_movement: { type: "string" },
								characters: {
									type: "array",
									items: { type: "string" },
								},
								duration_seconds: { type: "number" },
							},
							required: [
								"shot_id",
								"shot_type",
								"description",
								"camera_movement",
								"characters",
								"duration_seconds",
							],
							additionalProperties: false,
						},
					},
				},
				required: ["scene_id", "title", "location", "time", "shots"],
				additionalProperties: false,
			},
		},
	},
	required: ["title", "logline", "scenes"],
	additionalProperties: false,
};

function validateSegmentationResponse(data: unknown) {
	const obj = data as Record<string, unknown>;
	return {
		title: String(obj.title ?? ""),
		logline: String(obj.logline ?? ""),
		scenes: Array.isArray(obj.scenes)
			? (obj.scenes as unknown[]).map((s) => {
					const scene = s as Record<string, unknown>;
					return {
						scene_id: String(scene.scene_id ?? ""),
						title: String(scene.title ?? ""),
						location: String(scene.location ?? ""),
						time: String(scene.time ?? ""),
						shots: Array.isArray(scene.shots)
							? (scene.shots as unknown[]).map((sh) => {
									const shot = sh as Record<string, unknown>;
									return {
										shot_id: String(shot.shot_id ?? ""),
										shot_type: String(shot.shot_type ?? "medium"),
										description: String(shot.description ?? ""),
										camera_movement: String(
											shot.camera_movement ?? "static"
										),
										characters: Array.isArray(shot.characters)
											? (shot.characters as unknown[]).map(String)
											: [],
										duration_seconds: Number(shot.duration_seconds ?? 5),
									};
								})
							: [],
					};
				})
			: [],
	};
}

/** Camera movement aliases → valid enum values. */
const CAMERA_MOVEMENT_ALIASES: Record<string, string> = {
	push_in: "dolly",
	push_out: "dolly",
	slow_push_in: "dolly",
	pull_back: "dolly",
	follow: "tracking",
	track: "tracking",
	pan_left: "pan",
	pan_right: "pan",
	slow_pan: "pan",
	tilt_up: "tilt",
	tilt_down: "tilt",
	zoom_in: "zoom",
	zoom_out: "zoom",
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

export class NovelSegmenter extends BaseAgent<string, Script> {
	declare config: NovelSegmenterConfig;
	private _llm: LLMAdapter | null = null;

	constructor(config?: Partial<NovelSegmenterConfig>) {
		super(createNovelSegmenterConfig(config));
	}

	private async _ensureLlm(): Promise<void> {
		if (!this._llm) {
			this._llm = new LLMAdapter({ model: this.config.model });
			await this._llm.initialize();
		}
	}

	async process(text: string): Promise<AgentResult<Script>> {
		await this._ensureLlm();

		const charCount = text.length;
		console.log(
			`[segmenter] Segmenting novel text (${charCount} chars) into ~${this.config.shot_duration}s shots`
		);

		try {
			const langInstruction = detectLanguageInstruction(text);
			const prompt = SEGMENTATION_PROMPT.replace(
				"{lang_instruction}",
				langInstruction
			)
				.replace(/\{shot_duration\}/g, String(this.config.shot_duration))
				.replace("{text}", text);

			const messages: Message[] = [{ role: "user", content: prompt }];

			const result = await this._llm!.chatWithStructuredOutput(
				messages,
				"segmentation",
				SEGMENTATION_JSON_SCHEMA,
				validateSegmentationResponse,
				{ temperature: 0.3, max_tokens: 16_000 }
			);

			// Convert to internal Script model
			const scenes: Scene[] = [];
			let totalDuration = 0;

			for (const sceneData of result.scenes) {
				const shots: ShotDescription[] = [];
				for (const shotData of sceneData.shots) {
					const shot = createShotDescription({
						shot_id: shotData.shot_id || `shot_${shots.length + 1}`,
						shot_type: parseShotType(shotData.shot_type),
						description: shotData.description || "",
						camera_movement: parseCameraMovement(
							shotData.camera_movement
						),
						characters: shotData.characters || [],
						duration_seconds: shotData.duration_seconds || 5.0,
					});
					shots.push(shot);
					totalDuration += shot.duration_seconds;
				}

				scenes.push(
					createScene({
						scene_id:
							sceneData.scene_id || `scene_${scenes.length + 1}`,
						title: sceneData.title || "",
						description: "",
						location: sceneData.location || "",
						time: sceneData.time || "",
						shots,
					})
				);
			}

			const script: Script = {
				title: result.title || "Untitled",
				logline: result.logline || "",
				scenes,
				total_duration: totalDuration,
			};

			const shotCount = scenes.reduce(
				(sum, s) => sum + s.shots.length,
				0
			);
			console.log(
				`[segmenter] Segmented: ${scenes.length} scenes, ${shotCount} shots, ${totalDuration.toFixed(1)}s`
			);

			return agentOk(script, {
				scene_count: scenes.length,
				shot_count: shotCount,
				duration: totalDuration,
				cost: 0,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[segmenter] Failed: ${msg}`);
			return agentFail(msg);
		}
	}
}
