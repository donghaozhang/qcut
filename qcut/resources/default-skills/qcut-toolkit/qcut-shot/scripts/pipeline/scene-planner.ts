import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ContentFormat, Medium, Scene, SceneBreakdown } from "../core/types";
import { slugify } from "../core/utils";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

const CREDENTIAL_PATHS = [
	join(homedir(), ".qcut", ".env"),
	join(homedir(), ".config", "video-ai-studio", "credentials.env"),
];

function loadKeyFromFiles({ envName }: { envName: string }): string | undefined {
	for (const filePath of CREDENTIAL_PATHS) {
		if (!existsSync(filePath)) continue;
		const content = readFileSync(filePath, "utf8");
		const match = content.match(new RegExp(`^(?:export\\s+)?${envName}=["']?(.+?)["']?$`, "m"));
		if (match?.[1]?.trim()) return match[1].trim();
	}
	return undefined;
}

function getApiKey(): string {
	const key = process.env.OPENROUTER_API_KEY || loadKeyFromFiles({ envName: "OPENROUTER_API_KEY" });
	if (!key) {
		throw new Error(
			"OPENROUTER_API_KEY is required for scene planning. Set it in your environment or ~/.qcut/.env.",
		);
	}
	return key;
}

function getModel(): string {
	return process.env.SCENE_PLANNER_MODEL || DEFAULT_MODEL;
}

function buildSystemPrompt({
	targetShots,
	medium,
	format,
}: {
	targetShots: number;
	medium: Medium;
	format: ContentFormat;
}): string {
	return `You are a professional cinematographer creating a shot-by-shot breakdown for visual content production.

Given the source content, create exactly ${targetShots} distinct scenes for a ${medium} ${format}.

## Output Format
Return ONLY a JSON object (no markdown fences, no commentary) with this exact structure:

{
  "characters": [
    {
      "id": "kebab-case-name",
      "role": "story role",
      "description": "Detailed visual description for image generation — face shape, skin tone, body type, hair style and color, wardrobe details, distinguishing features. Specific enough to produce the same person consistently across multiple images."
    }
  ],
  "continuityNotes": [
    "Rules for maintaining visual consistency across scenes"
  ],
  "scenes": [
    {
      "index": 1,
      "title": "Evocative Scene Title",
      "camera": {
        "lens": "35mm",
        "framing": "wide establishing shot",
        "movement": "slow dolly forward",
        "angle": "eye level"
      },
      "lighting": "Specific lighting for this scene — time of day, quality, direction, color temperature",
      "location": "Specific location with architectural and environmental details",
      "action": "What is happening in the frame — who is doing what, body language, facial expression, emotion",
      "characterIds": ["character-id"],
      "mood": "Emotional tone of this specific scene",
      "props": ["visible objects that matter to the story"],
      "colorPalette": "Dominant colors — e.g. warm gold, amber, deep sienna",
      "negative": "What to avoid — e.g. no crowd, no modern phones, no collage"
    }
  ]
}

## Rules
- Extract ALL named or implied characters from the source. Give each a unique kebab-case ID.
- Character descriptions must be detailed enough for consistent image generation: include physical appearance, wardrobe, hair, and distinguishing features.
- Scene titles must be evocative and specific (e.g. "Golden Hour on the Seine"), never generic ("Beat 1", "Scene 2").
- Camera choices should serve the story: wide for establishing, close for emotion, overhead for isolation, etc.
- Lens choices should be realistic: 24mm for wide/environmental, 35mm for narrative wide, 50mm for natural, 85mm for portrait/intimate, 135mm for compressed telephoto.
- Lighting must match the time, place, and mood described in the source — never use generic "dramatic lighting".
- Action descriptions must be specific and visual — describe what the camera sees, not abstract narration.
- Location descriptions must be concrete — name the place, describe the surfaces, materials, and atmosphere.
- The first scene should establish the world; the last should deliver emotional payoff.
- Each scene's negative field should prevent common image generation failures relevant to that scene.
- Maintain visual continuity — same characters, locations, and props across scenes where the story requires it.
- Color palette should reflect the story's emotional arc — shift it across scenes if the mood changes.`;
}

interface OpenRouterChoice {
	message?: { content?: string };
}

interface OpenRouterResponse {
	choices?: OpenRouterChoice[];
	error?: { message?: string };
}

function extractJson({ text }: { text: string }): string {
	const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/u);
	if (fenced?.[1]) {
		return fenced[1].trim();
	}
	const firstBrace = text.indexOf("{");
	const lastBrace = text.lastIndexOf("}");
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		return text.slice(firstBrace, lastBrace + 1);
	}
	return text.trim();
}

function normalizeScenes({ scenes }: { scenes: Scene[] }): Scene[] {
	return scenes.map((scene, index) => {
		const sceneIndex = scene.index || index + 1;
		const title = scene.title || `Scene ${sceneIndex}`;
		const stem = slugify({ value: title }).split("-").slice(0, 5).join("-");
		const rawStem =
			scene.fileStem ||
			`${String(sceneIndex).padStart(2, "0")}-${stem || `scene-${sceneIndex}`}`;
		const fileStem = rawStem.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
		return {
			...scene,
			index: sceneIndex,
			fileStem,
			characterIds: Array.isArray(scene.characterIds) ? scene.characterIds : [],
			props: Array.isArray(scene.props) ? scene.props : [],
			negative: scene.negative || "no text, no watermark, no collage, no UI overlay",
		};
	});
}

/** Plans scenes by sending source content to an LLM via OpenRouter and parsing the scene breakdown. */
export async function planScenes({
	sourceContent,
	targetShots,
	medium,
	format,
}: {
	sourceContent: string;
	targetShots: number;
	medium: Medium;
	format: ContentFormat;
}): Promise<SceneBreakdown> {
	const apiKey = getApiKey();
	const model = getModel();
	const systemPrompt = buildSystemPrompt({ targetShots, medium, format });

	console.log(`Planning ${targetShots} scenes with ${model} via OpenRouter...`);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 60_000);

	let response: Response;
	try {
		response = await fetch(OPENROUTER_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				max_tokens: 8192,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: sourceContent },
				],
			}),
			signal: controller.signal,
		});
	} catch (error) {
		clearTimeout(timeout);
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error("OpenRouter request timed out after 60 seconds");
		}
		throw error;
	}
	clearTimeout(timeout);

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`OpenRouter API error (${response.status}): ${text}`);
	}

	const result = (await response.json()) as OpenRouterResponse;

	if (result.error?.message) {
		throw new Error(`OpenRouter error: ${result.error.message}`);
	}

	const content = result.choices?.[0]?.message?.content;
	if (!content) {
		throw new Error("No content in OpenRouter response");
	}

	const jsonText = extractJson({ text: content });
	let parsed: Partial<SceneBreakdown>;
	try {
		parsed = JSON.parse(jsonText) as Partial<SceneBreakdown>;
	} catch (error) {
		throw new Error(`Failed to parse scene planner JSON output: ${error instanceof Error ? error.message : String(error)}`);
	}

	if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
		throw new Error("Scene planner returned no scenes");
	}
	if (!Array.isArray(parsed.characters) || parsed.characters.length === 0) {
		throw new Error("Scene planner returned no characters");
	}

	console.log(
		`Scene planning complete: ${parsed.characters.length} characters, ${parsed.scenes.length} scenes.`,
	);

	return {
		characters: parsed.characters,
		continuityNotes: Array.isArray(parsed.continuityNotes) ? parsed.continuityNotes : [],
		scenes: normalizeScenes({ scenes: parsed.scenes as Scene[] }),
	};
}
