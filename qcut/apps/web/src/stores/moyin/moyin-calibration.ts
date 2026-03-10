/**
 * Moyin calibration helpers — AI-powered character and scene enhancement.
 * Extracted from moyin-store.ts to keep it under 800 lines.
 *
 * Enhanced prompts request richer data matching the full ScriptCharacter/ScriptScene types
 * (identity anchors, art direction, color palette, etc.).
 */

import type {
	ScriptCharacter,
	ScriptScene,
	ScriptData,
	ProjectBackground,
	EpisodeRawScript,
} from "@/types/moyin-script";
import { platform } from "@qcut/platform-core";

interface LLMResult {
	success: boolean;
	text?: string;
	error?: string;
}

interface MoyinApi {
	callLLM: (params: {
		systemPrompt: string;
		userPrompt: string;
		temperature?: number;
		maxTokens?: number;
	}) => Promise<LLMResult>;
}

/** Get the Moyin Electron API, throwing if unavailable. */
function getMoyinApi(): MoyinApi {
	const api = platform().moyin;
	if (!api?.callLLM) {
		throw new Error("Moyin API not available. Please run in Electron.");
	}
	return api as MoyinApi;
}

/** Parse a JSON array from LLM text, stripping markdown fences. */
function parseJsonArray<T>(text: string): T[] {
	let cleaned = text
		.replace(/```json\n?/g, "")
		.replace(/```\n?/g, "")
		.trim();
	const jsonStart = cleaned.indexOf("[");
	const jsonEnd = cleaned.lastIndexOf("]");
	if (jsonStart !== -1 && jsonEnd !== -1) {
		cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
	}
	return JSON.parse(cleaned) as T[];
}

/** Build calibration context from raw script by parsing episodes and background. */
async function getCalibrationContext({
	rawScript,
	scriptData,
}: {
	rawScript?: string;
	scriptData: ScriptData | null;
}): Promise<{
	background: ProjectBackground;
	episodeScripts: EpisodeRawScript[];
} | null> {
	if (!rawScript?.trim()) {
		return null;
	}

	try {
		const { parseFullScript } = await import(
			"@/lib/moyin/script/episode-parser"
		);
		const parsed = parseFullScript(rawScript);
		if (!parsed.episodes.length) {
			return null;
		}

		const background: ProjectBackground = {
			...parsed.background,
			title: parsed.background.title || scriptData?.title || "未命名剧本",
			outline: parsed.background.outline || scriptData?.logline || "",
			characterBios: parsed.background.characterBios || "",
			era: parsed.background.era || "现代",
			genre: parsed.background.genre || scriptData?.genre,
		};

		return { background, episodeScripts: parsed.episodes };
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error));
		console.warn(
			"[moyin-calibration] failed to build calibrator context, using legacy enhancement:",
			err.message
		);
		return null;
	}
}

// ==================== Title Calibration ====================

/** Refine the screenplay title and logline using an LLM. */
export async function calibrateTitleLLM(
	scriptData: ScriptData,
	rawScript: string
): Promise<{ title: string; logline: string }> {
	const api = getMoyinApi();

	const result = await api.callLLM({
		systemPrompt: `You are a screenplay development expert. Refine the title and logline for a screenplay.

Return JSON only:
{"title": "refined title", "logline": "compelling one-sentence logline"}`,
		userPrompt: `Current title: "${scriptData.title}"
Current logline: "${scriptData.logline || ""}"
Genre: ${scriptData.genre || "Drama"}

Script excerpt (first 500 chars):
${rawScript.slice(0, 500)}

Refine the title and logline. Keep the original if it's already strong.`,
		temperature: 0.5,
		maxTokens: 256,
	});

	if (!result.success || !result.text) {
		throw new Error(result.error || "Title calibration failed");
	}

	const cleaned = result.text
		.replace(/```json\n?/g, "")
		.replace(/```\n?/g, "")
		.trim();
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned);
	} catch (e) {
		throw new Error(
			`Failed to parse LLM response as JSON: ${e instanceof Error ? e.message : String(e)}`
		);
	}
	const obj = parsed as { title?: string; logline?: string };
	if (typeof obj.title !== "string" || typeof obj.logline !== "string") {
		throw new Error(
			"Title calibration returned invalid data: missing title or logline"
		);
	}
	return { title: obj.title, logline: obj.logline };
}

// ==================== Synopsis Generation ====================

/** Generate a 2-3 sentence synopsis for the screenplay via LLM. */
export async function generateSynopsisLLM(
	scriptData: ScriptData,
	rawScript: string
): Promise<string> {
	const api = getMoyinApi();

	const charNames = scriptData.characters
		.slice(0, 5)
		.map((c) => c.name)
		.join(", ");

	const result = await api.callLLM({
		systemPrompt: `You are a screenplay development expert. Write a concise 2-3 sentence synopsis for the screenplay.
Return only the synopsis text, no JSON wrapping.`,
		userPrompt: `Title: "${scriptData.title}"
Genre: ${scriptData.genre || "Drama"}
Logline: ${scriptData.logline || ""}
Main characters: ${charNames}
Scenes: ${scriptData.scenes.length}

Script excerpt (first 800 chars):
${rawScript.slice(0, 800)}

Write a compelling 2-3 sentence synopsis.`,
		temperature: 0.7,
		maxTokens: 512,
	});

	if (!result.success || !result.text) {
		throw new Error(result.error || "Synopsis generation failed");
	}

	const synopsis = result.text.trim();
	if (!synopsis) {
		throw new Error("Synopsis generation returned empty text");
	}
	return synopsis;
}

// ==================== Character Enhancement ====================

interface EnhancedCharacterData {
	id: string;
	visualPromptEn?: string;
	appearance?: string;
	identityAnchors?: {
		boneStructure?: string;
		eyeShape?: string;
		noseShape?: string;
		lipShape?: string;
		uniqueMarks?: string[];
		hairStyle?: string;
		skinTexture?: string;
	};
}

/** Enhance character visual descriptions and identity anchors via LLM or calibrator. */
export async function enhanceCharactersLLM(
	characters: ScriptCharacter[],
	scriptData: ScriptData | null,
	rawScript?: string
): Promise<ScriptCharacter[]> {
	const calibrationContext = await getCalibrationContext({
		rawScript,
		scriptData,
	});
	if (calibrationContext) {
		try {
			const { calibrateCharacters, convertToScriptCharacters } = await import(
				"@/lib/moyin/script/character-calibrator"
			);
			const result = await calibrateCharacters(
				characters,
				calibrationContext.background,
				calibrationContext.episodeScripts
			);
			return convertToScriptCharacters(result.characters, characters);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.warn(
				"[moyin-calibration] character calibrator failed, falling back to legacy enhancement:",
				err.message
			);
		}
	}

	const api = getMoyinApi();
	const title = scriptData?.title || "Unknown";
	const genre = scriptData?.genre || "Drama";

	const charSummary = characters
		.map(
			(c) =>
				`- ${c.id}: ${c.name}, ${c.role || "unknown role"}, ${c.gender || ""} ${c.age || ""}. Appearance: ${c.appearance || "unknown"}`
		)
		.join("\n");

	const result = await api.callLLM({
		systemPrompt: `You are a professional character designer specializing in visual identity for AI image generation.

For each character, generate:
1. A detailed English visual description (visualPromptEn)
2. A concise appearance summary
3. Identity anchors: bone structure, eye shape, nose shape, lip shape, unique marks, hair style, skin texture

Return JSON array:
[{
  "id": "char_id",
  "visualPromptEn": "detailed description for AI image generation including face, hair, build, clothing, distinguishing features",
  "appearance": "concise 1-line summary",
  "identityAnchors": {
    "boneStructure": "e.g., oval face, high cheekbones",
    "eyeShape": "e.g., almond-shaped, deep-set",
    "noseShape": "e.g., straight, slightly upturned",
    "lipShape": "e.g., full, bow-shaped",
    "uniqueMarks": ["scar on left cheek", "beauty mark"],
    "hairStyle": "e.g., shoulder-length wavy black hair",
    "skinTexture": "e.g., smooth, sun-kissed"
  }
}]

Only return the JSON array, no other text.`,
		userPrompt: `Project: "${title}" (${genre})

Characters:
${charSummary}

Generate rich visual descriptions and identity anchors for each character.`,
		temperature: 0.5,
		maxTokens: 4096,
	});

	if (!result.success || !result.text) {
		throw new Error(result.error || "AI enhancement failed");
	}

	const enhanced = parseJsonArray<EnhancedCharacterData>(result.text);
	const enhancedMap = new Map(enhanced.map((e) => [e.id, e]));

	return characters.map((c) => {
		const e = enhancedMap.get(c.id);
		if (!e) return c;
		return {
			...c,
			visualPromptEn: e.visualPromptEn || c.visualPromptEn,
			appearance: e.appearance || c.appearance,
			identityAnchors: e.identityAnchors
				? {
						boneStructure: e.identityAnchors.boneStructure || "",
						eyeShape: e.identityAnchors.eyeShape,
						noseShape: e.identityAnchors.noseShape,
						lipShape: e.identityAnchors.lipShape,
						uniqueMarks: e.identityAnchors.uniqueMarks || [],
						hairStyle: e.identityAnchors.hairStyle,
						skinTexture: e.identityAnchors.skinTexture,
					}
				: c.identityAnchors,
		};
	});
}

// ==================== Scene Enhancement ====================

interface EnhancedSceneData {
	id: string;
	visualPrompt?: string;
	visualPromptEn?: string;
	lightingDesign?: string;
	architectureStyle?: string;
	colorPalette?: string;
	keyProps?: string;
	spatialLayout?: string;
	eraDetails?: string;
}

/** Enhance scene art direction (lighting, color, spatial layout) via LLM or calibrator. */
export async function enhanceScenesLLM(
	scenes: ScriptScene[],
	scriptData: ScriptData | null,
	rawScript?: string
): Promise<ScriptScene[]> {
	const calibrationContext = await getCalibrationContext({
		rawScript,
		scriptData,
	});
	if (calibrationContext) {
		try {
			const { calibrateScenes, convertToScriptScenes } = await import(
				"@/lib/moyin/script/scene-calibrator"
			);
			const result = await calibrateScenes(
				scenes,
				calibrationContext.background,
				calibrationContext.episodeScripts
			);
			return convertToScriptScenes(result.scenes, scenes);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			console.warn(
				"[moyin-calibration] scene calibrator failed, falling back to legacy enhancement:",
				err.message
			);
		}
	}

	const api = getMoyinApi();
	const title = scriptData?.title || "Unknown";
	const genre = scriptData?.genre || "Drama";

	const sceneSummary = scenes
		.map(
			(s) =>
				`- ${s.id}: ${s.name || s.location}, time: ${s.time || ""}, atmosphere: ${s.atmosphere || ""}`
		)
		.join("\n");

	const result = await api.callLLM({
		systemPrompt: `You are a professional art director. For each scene, generate comprehensive visual design data for AI concept art generation.

Return JSON array:
[{
  "id": "scene_id",
  "visualPrompt": "detailed scene description for AI image generation",
  "visualPromptEn": "English visual prompt optimized for AI",
  "lightingDesign": "lighting setup description",
  "architectureStyle": "architectural style of the location",
  "colorPalette": "dominant colors comma-separated, e.g. warm amber, deep blue, soft white",
  "keyProps": "important objects/props in the scene",
  "spatialLayout": "spatial arrangement description",
  "eraDetails": "historical or temporal details"
}]

Only return the JSON array, no other text.`,
		userPrompt: `Project: "${title}" (${genre})

Scenes:
${sceneSummary}

Generate comprehensive art direction for each scene.`,
		temperature: 0.5,
		maxTokens: 4096,
	});

	if (!result.success || !result.text) {
		throw new Error(result.error || "AI enhancement failed");
	}

	const enhanced = parseJsonArray<EnhancedSceneData>(result.text);
	const enhancedMap = new Map(enhanced.map((e) => [e.id, e]));

	return scenes.map((s) => {
		const e = enhancedMap.get(s.id);
		if (!e) return s;
		return {
			...s,
			visualPrompt: e.visualPrompt || s.visualPrompt,
			visualPromptEn: e.visualPromptEn || s.visualPromptEn,
			lightingDesign: e.lightingDesign || s.lightingDesign,
			architectureStyle: e.architectureStyle || s.architectureStyle,
			colorPalette: e.colorPalette || s.colorPalette,
			keyProps: e.keyProps
				? e.keyProps
						.split(",")
						.map((p) => p.trim())
						.filter(Boolean)
				: s.keyProps,
			spatialLayout: e.spatialLayout || s.spatialLayout,
			eraDetails: e.eraDetails || s.eraDetails,
		};
	});
}
