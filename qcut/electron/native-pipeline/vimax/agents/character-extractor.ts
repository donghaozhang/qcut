/**
 * Character Extractor Agent
 *
 * Extracts character information from scripts, novels, or story text
 * using LLM analysis.
 *
 * Ported from: vimax/agents/character_extractor.py
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
	CHARACTER_LIST_JSON_SCHEMA,
	validateCharacterListResponse,
} from "./schemas.js";
import { LLMAdapter, type Message } from "../adapters/llm-adapter.js";
import type { CharacterInNovel } from "../types/character.js";
import {
	createCharacterInNovel,
	composePortraitPrompt,
} from "../types/character.js";
import { detectLanguageInstruction } from "../detect-language.js";

/** Configuration for the character extraction agent. */
export interface CharacterExtractorConfig extends AgentConfig {
	max_characters: number;
	/**
	 * Visual style to bake into each character's generated portrait_prompt.
	 * Replaces the default "photorealistic studio headshot" wrapper so the
	 * downstream image model renders in the drama's native aesthetic
	 * instead of a LinkedIn-style headshot.
	 */
	portrait_style?: string;
}

/** Create a {@link CharacterExtractorConfig} with sensible defaults. */
export function createCharacterExtractorConfig(
	partial?: Partial<CharacterExtractorConfig>
): CharacterExtractorConfig {
	return {
		...createAgentConfig({ name: "CharacterExtractor" }),
		model: "kimi-k2.5",
		max_characters: 20,
		...partial,
	};
}

const EXTRACTION_PROMPT = `You are an expert story analyst. Extract all characters from the following text.
{lang_instruction}

For each character, provide:
- name: Character's name
- description: Brief description
- age: Age or age range (if mentioned or can be inferred)
- gender: Gender (if mentioned or can be inferred)
- appearance: Physical appearance description
- personality: Personality traits
- role: Role in the story (protagonist, antagonist, supporting, minor)
- relationships: List of relationships with other characters
- portrait: A structured object describing the character's visual appearance for portrait generation. ALWAYS write ALL portrait fields in ENGLISH regardless of input language. Fields:
  - age: e.g. "young", "early 20s", "middle-aged", "elderly"
  - gender: e.g. "female", "male"
  - ethnicity: (strongly recommended when the text specifies or clearly implies one — e.g. "Japanese", "Chinese", "Korean", "Indian", "Black British", "Latin American"). Omit only when truly indeterminate. Image models default to Caucasian faces otherwise, so preserving this signal matters.
  - hair: e.g. "long wavy brown hair", "short black hair with bangs"
  - expression: e.g. "determined and cold", "warm smile", "nervous and guilty"
  - clothing: e.g. "white silk dress", "black business suit with tie"
  - features: (optional) e.g. "delicate features, high cheekbones", "strong jawline"
  - accessories: (optional) e.g. "gold earrings", "glasses", "red scarf"

Only include characters that appear in the text.
If a field cannot be determined, use an empty string or empty list.

TEXT:
{text}

Return a JSON object with a "characters" key containing an array of characters.`;

/** Agent that extracts character profiles from story text using an LLM. */
export class CharacterExtractor extends BaseAgent<string, CharacterInNovel[]> {
	declare config: CharacterExtractorConfig;
	private _llm: LLMAdapter | null = null;

	constructor(config?: Partial<CharacterExtractorConfig>) {
		super(createCharacterExtractorConfig(config));
	}

	private async _ensureLlm(): Promise<void> {
		if (!this._llm) {
			this._llm = new LLMAdapter({ model: this.config.model });
			await this._llm.initialize();
		}
	}

	async process(text: string): Promise<AgentResult<CharacterInNovel[]>> {
		await this._ensureLlm();

		console.log(
			`[character_extractor] Extracting from text (${text.length} chars)`
		);

		try {
			const langInstruction = detectLanguageInstruction(text);
			const prompt = EXTRACTION_PROMPT.replace(
				"{lang_instruction}",
				langInstruction
			).replace("{text}", text.slice(0, 50_000));
			const messages: Message[] = [{ role: "user", content: prompt }];

			const result = await this._llm!.chatWithStructuredOutput(
				messages,
				"character_list",
				CHARACTER_LIST_JSON_SCHEMA,
				validateCharacterListResponse,
				{ temperature: 0.3 }
			);

			const characters: CharacterInNovel[] = [];
			for (const item of result.characters.slice(
				0,
				this.config.max_characters
			)) {
				const portrait = item.portrait;
				characters.push(
					createCharacterInNovel({
						name: item.name,
						description: item.description,
						age: item.age || undefined,
						gender: item.gender || undefined,
						appearance: item.appearance,
						personality: item.personality,
						role: item.role,
						relationships: item.relationships,
						portrait: portrait || undefined,
						portrait_prompt: portrait
							? composePortraitPrompt(portrait, {
									style: this.config.portrait_style,
								})
							: undefined,
					})
				);
			}

			console.log(
				`[character_extractor] Extracted ${characters.length} characters`
			);

			return agentOk(characters, {
				character_count: characters.length,
				cost: 0,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[character_extractor] Failed: ${msg}`);
			return agentFail(msg);
		}
	}

	/** Extract only main characters (protagonist, antagonist, supporting). */
	async extractMainCharacters(
		text: string,
		maxCharacters = 5
	): Promise<CharacterInNovel[]> {
		const result = await this.process(text);
		if (!result.success || !result.result) return [];

		const mainRoles = new Set(["protagonist", "antagonist", "supporting"]);
		return result.result
			.filter((c) => mainRoles.has((c.role || "").toLowerCase()))
			.slice(0, maxCharacters);
	}
}
