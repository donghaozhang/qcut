/**
 * Response schemas for native structured output.
 *
 * These interfaces define the JSON shape the LLM should produce. Fields
 * use `string` instead of strict enums so that unexpected LLM values
 * don't cause validation failures — enum mapping is handled in the agent layer.
 *
 * When native `response_format` is enforced by the provider, the JSON schema
 * guides the model without hard-rejecting surprises.
 *
 * Ported from: vimax/agents/schemas.py
 */

// =============================================================================
// Screenwriter response schema
// =============================================================================

export interface ShotResponse {
	shot_id: string;
	shot_type: string;
	description: string;
	camera_movement: string;
	characters: string[];
	duration_seconds: number;
}

export interface SceneResponse {
	scene_id: string;
	title: string;
	location: string;
	time: string;
	shots: ShotResponse[];
}

export interface ScreenplayResponse {
	title: string;
	logline: string;
	scenes: SceneResponse[];
}

// =============================================================================
// Character Extractor response schema
// =============================================================================

export interface CharacterResponse {
	name: string;
	description: string;
	age: string;
	gender: string;
	appearance: string;
	personality: string;
	role: string;
	relationships: string[];
	portrait_prompt: string;
}

export interface CharacterListResponse {
	characters: CharacterResponse[];
}

// =============================================================================
// Novel Compression response schema
// =============================================================================

export interface SceneCompression {
	title: string;
	description: string;
	characters: string[];
	setting: string;
}

export interface ChapterCompressionResponse {
	title: string;
	scenes: SceneCompression[];
}

// =============================================================================
// JSON Schemas for OpenRouter response_format
// =============================================================================

/**
 * JSON schema for ScreenplayResponse — used with OpenRouter's
 * response_format: { type: "json_schema", json_schema: { schema } }
 */
export const SCREENPLAY_JSON_SCHEMA: Record<string, unknown> = {
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
								characters: { type: "array", items: { type: "string" } },
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

/** JSON schema for CharacterListResponse. */
export const CHARACTER_LIST_JSON_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {
		characters: {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: { type: "string" },
					description: { type: "string" },
					age: { type: "string" },
					gender: { type: "string" },
					appearance: { type: "string" },
					personality: { type: "string" },
					role: { type: "string" },
					relationships: { type: "array", items: { type: "string" } },
					portrait_prompt: { type: "string" },
				},
				required: [
					"name",
					"description",
					"age",
					"gender",
					"appearance",
					"personality",
					"role",
					"relationships",
					"portrait_prompt",
				],
				additionalProperties: false,
			},
		},
	},
	required: ["characters"],
	additionalProperties: false,
};

/** JSON schema for ChapterCompressionResponse. */
export const CHAPTER_COMPRESSION_JSON_SCHEMA: Record<string, unknown> = {
	type: "object",
	properties: {
		title: { type: "string" },
		scenes: {
			type: "array",
			items: {
				type: "object",
				properties: {
					title: { type: "string" },
					description: { type: "string" },
					characters: { type: "array", items: { type: "string" } },
					setting: { type: "string" },
				},
				required: ["title", "description", "characters", "setting"],
				additionalProperties: false,
			},
		},
	},
	required: ["title", "scenes"],
	additionalProperties: false,
};

// =============================================================================
// Validators (simple runtime validators for structured output parsing)
// =============================================================================

export function validateScreenplayResponse(data: unknown): ScreenplayResponse {
	const obj = data as Record<string, unknown>;
	return {
		title: String(obj.title ?? ""),
		logline: String(obj.logline ?? ""),
		scenes: Array.isArray(obj.scenes)
			? (obj.scenes as unknown[]).map(validateSceneResponse)
			: [],
	};
}

function validateSceneResponse(data: unknown): SceneResponse {
	const obj = data as Record<string, unknown>;
	return {
		scene_id: String(obj.scene_id ?? ""),
		title: String(obj.title ?? ""),
		location: String(obj.location ?? ""),
		time: String(obj.time ?? ""),
		shots: Array.isArray(obj.shots)
			? (obj.shots as unknown[]).map(validateShotResponse)
			: [],
	};
}

function validateShotResponse(data: unknown): ShotResponse {
	const obj = data as Record<string, unknown>;
	return {
		shot_id: String(obj.shot_id ?? ""),
		shot_type: String(obj.shot_type ?? "medium"),
		description: String(obj.description ?? ""),
		camera_movement: String(obj.camera_movement ?? "static"),
		characters: Array.isArray(obj.characters)
			? (obj.characters as unknown[]).map(String)
			: [],
		duration_seconds: Number(obj.duration_seconds ?? 5),
	};
}

export function validateCharacterListResponse(
	data: unknown
): CharacterListResponse {
	const obj = data as Record<string, unknown>;
	return {
		characters: Array.isArray(obj.characters)
			? (obj.characters as unknown[]).map(validateCharacterResponse)
			: [],
	};
}

function validateCharacterResponse(data: unknown): CharacterResponse {
	const obj = data as Record<string, unknown>;
	return {
		name: String(obj.name ?? ""),
		description: String(obj.description ?? ""),
		age: String(obj.age ?? ""),
		gender: String(obj.gender ?? ""),
		appearance: String(obj.appearance ?? ""),
		personality: String(obj.personality ?? ""),
		role: String(obj.role ?? "minor"),
		relationships: Array.isArray(obj.relationships)
			? (obj.relationships as unknown[]).map(String)
			: [],
		portrait_prompt: String(obj.portrait_prompt ?? ""),
	};
}

export function validateChapterCompressionResponse(
	data: unknown
): ChapterCompressionResponse {
	const obj = data as Record<string, unknown>;
	return {
		title: String(obj.title ?? ""),
		scenes: Array.isArray(obj.scenes)
			? (obj.scenes as unknown[]).map((s) => {
					const scene = s as Record<string, unknown>;
					return {
						title: String(scene.title ?? ""),
						description: String(scene.description ?? ""),
						characters: Array.isArray(scene.characters)
							? (scene.characters as unknown[]).map(String)
							: [],
						setting: String(scene.setting ?? ""),
					};
				})
			: [],
	};
}
