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
import { createCharacterInNovel } from "../types/character.js";
import { detectLanguageInstruction } from "../detect-language.js";

export interface CharacterExtractorConfig extends AgentConfig {
	max_characters: number;
}

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

Only include characters that appear in the text.
If a field cannot be determined, use an empty string or empty list.

TEXT:
{text}

Return a JSON object with a "characters" key containing an array of characters.`;

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
