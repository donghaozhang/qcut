/**
 * Character Portraits Generator Agent
 *
 * Generates multi-angle character portraits (front, side, back, 3/4)
 * from character descriptions to ensure visual consistency.
 *
 * Ported from: vimax/agents/character_portraits.py
 */

import * as path from "path";
import * as fs from "fs";
import {
	BaseAgent,
	type AgentConfig,
	type AgentResult,
	createAgentConfig,
	agentOk,
	agentFail,
} from "./base-agent.js";
import {
	ImageGeneratorAdapter,
	type ImageAdapterConfig,
} from "../adapters/image-adapter.js";
import { LLMAdapter, type Message } from "../adapters/llm-adapter.js";
import type {
	CharacterInNovel,
	CharacterPortrait,
} from "../types/character.js";

export interface PortraitsGeneratorConfig extends AgentConfig {
	image_model: string;
	llm_model: string;
	views: string[];
	style: string;
	aspect_ratio: string;
	output_dir: string;
}

export function createPortraitsGeneratorConfig(
	partial?: Partial<PortraitsGeneratorConfig>
): PortraitsGeneratorConfig {
	return {
		...createAgentConfig({ name: "CharacterPortraitsGenerator" }),
		image_model: "nano_banana_2",
		llm_model: "kimi-k2.5",
		views: ["front"],
		style:
			"detailed character portrait, professional, consistent style, plain white background",
		aspect_ratio: "9:16",
		output_dir: "media/generated/vimax/portraits",
		...partial,
	};
}

const PORTRAIT_PROMPT_TEMPLATE = `Create a detailed image generation prompt for a {view} view portrait.

CHARACTER INFORMATION:
Name: {name}
Description: {description}
Appearance: {appearance}
Age: {age}
Gender: {gender}

STYLE: {style}

Generate a single, detailed prompt that will create a {view} view portrait of this character.
The prompt should include specific details about pose, lighting, and composition for a {view} view.
Keep the character's appearance consistent across all views.
The portrait MUST have a clean, plain white background with no scenery or props.

Respond with ONLY the image generation prompt, no other text.`;

const SUPPORTED_VIEWS = new Set(["front", "side", "back", "three_quarter"]);

function safeSlug(value: string): string {
	const safe = value.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^_|_$/g, "");
	return safe || "unknown";
}

export class CharacterPortraitsGenerator extends BaseAgent<
	CharacterInNovel,
	CharacterPortrait
> {
	declare config: PortraitsGeneratorConfig;
	private _imageAdapter: ImageGeneratorAdapter | null = null;
	private _llm: LLMAdapter | null = null;

	constructor(config?: Partial<PortraitsGeneratorConfig>) {
		super(createPortraitsGeneratorConfig(config));
	}

	private async _ensureAdapters(): Promise<void> {
		if (!this._imageAdapter) {
			this._imageAdapter = new ImageGeneratorAdapter({
				model: this.config.image_model,
				output_dir: this.config.output_dir,
			} as Partial<ImageAdapterConfig>);
			await this._imageAdapter.initialize();
		}
		if (!this._llm) {
			this._llm = new LLMAdapter({ model: this.config.llm_model });
			await this._llm.initialize();
		}
	}

	private async _generatePrompt(
		character: CharacterInNovel,
		view: string
	): Promise<string> {
		const prompt = PORTRAIT_PROMPT_TEMPLATE.replace(/\{view\}/g, view)
			.replace("{name}", character.name)
			.replace("{description}", character.description)
			.replace("{appearance}", character.appearance)
			.replace("{age}", character.age ?? "unknown")
			.replace("{gender}", character.gender ?? "unknown")
			.replace("{style}", this.config.style);

		const response = await this._llm!.chat([
			{ role: "user", content: prompt } as Message,
		]);
		const result = (response.content || "").trim();

		// Guard against empty LLM responses
		if (result.length < 3) {
			console.warn(
				`[portraits] LLM returned empty prompt for ${character.name} ${view} view, using fallback`
			);
			return `${this.config.style}, ${view} view portrait of ${character.name}, ${character.description}, ${character.appearance}`;
		}

		return result;
	}

	async process(
		character: CharacterInNovel
	): Promise<AgentResult<CharacterPortrait>> {
		await this._ensureAdapters();

		console.log(`[portraits] Generating portraits for: ${character.name}`);

		try {
			const portrait: CharacterPortrait = {
				character_name: character.name,
				description: "",
			};
			let totalCost = 0;

			// Validate views
			const unknownViews = this.config.views.filter(
				(v) => !SUPPORTED_VIEWS.has(v)
			);
			if (unknownViews.length > 0) {
				throw new Error(
					`Unsupported portrait view(s): ${[...new Set(unknownViews)].sort().join(", ")}`
				);
			}

			const charSlug = safeSlug(character.name);
			const charDir = path.join(this.config.output_dir, charSlug);
			if (!fs.existsSync(charDir)) {
				fs.mkdirSync(charDir, { recursive: true });
			}

			for (const view of this.config.views) {
				console.log(
					`[portraits] Generating ${view} view for ${character.name}`
				);

				const prompt = await this._generatePrompt(character, view);
				const outputPath = path.join(charDir, `${view}.png`);

				const result = await this._imageAdapter!.generate(prompt, {
					aspect_ratio: this.config.aspect_ratio,
					output_path: outputPath,
				});

				totalCost += result.cost;

				if (view === "front") portrait.front_view = result.image_path;
				else if (view === "side") portrait.side_view = result.image_path;
				else if (view === "back") portrait.back_view = result.image_path;
				else if (view === "three_quarter")
					portrait.three_quarter_view = result.image_path;
			}

			console.log(`[portraits] Generated portraits for ${character.name}`);

			return agentOk(portrait, {
				views_generated: this.config.views.length,
				cost: totalCost,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[portraits] Failed: ${msg}`);
			return agentFail(msg);
		}
	}

	/** Generate portraits for multiple characters. */
	async generateBatch(
		characters: CharacterInNovel[]
	): Promise<AgentResult<Record<string, CharacterPortrait>>> {
		const portraits: Record<string, CharacterPortrait> = {};
		let totalCost = 0;
		const errors: string[] = [];

		for (const char of characters) {
			const result = await this.process(char);
			if (result.success && result.result) {
				portraits[char.name] = result.result;
				totalCost += (result.metadata.cost as number) ?? 0;
			} else {
				errors.push(
					`Failed to generate portrait for ${char.name}: ${result.error}`
				);
			}
		}

		if (errors.length > 0) {
			console.warn(`[portraits] Some portraits failed: ${errors.join("; ")}`);
		}

		return agentOk(portraits, {
			cost: totalCost,
			errors: errors.length > 0 ? errors : undefined,
		});
	}
}
