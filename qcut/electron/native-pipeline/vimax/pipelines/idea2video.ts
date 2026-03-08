/**
 * Idea to Video Pipeline
 *
 * Complete workflow from a text idea to a final video:
 * 1. Screenwriter: Idea -> Script
 * 2. CharacterExtractor: Script -> Characters
 * 3. CharacterPortraitsGenerator: Characters -> Portraits
 * 4. StoryboardArtist: Script -> Storyboard images
 * 5. CameraImageGenerator: Storyboard -> Videos + Final
 *
 * Ported from: vimax/pipelines/idea2video.py
 */

import * as fs from "fs";
import * as path from "path";

import {
	Screenwriter,
	type ScreenwriterConfig,
	type Script,
	CharacterExtractor,
	type CharacterExtractorConfig,
	CharacterPortraitsGenerator,
	type PortraitsGeneratorConfig,
	StoryboardArtist,
	type StoryboardArtistConfig,
	type StoryboardResult,
	CameraImageGenerator,
	type CameraGeneratorConfig,
} from "../agents/index.js";
import type {
	CharacterInNovel,
	CharacterPortrait,
} from "../types/character.js";
import { CharacterPortraitRegistry } from "../types/character.js";
import type { PipelineOutput } from "../types/output.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface Idea2VideoConfig {
	output_dir: string;
	save_intermediate: boolean;
	target_duration: number;
	video_model: string;
	image_model: string;
	llm_model: string;
	screenwriter?: Partial<ScreenwriterConfig>;
	character_extractor?: Partial<CharacterExtractorConfig>;
	portraits_generator?: Partial<PortraitsGeneratorConfig>;
	storyboard_artist?: Partial<StoryboardArtistConfig>;
	camera_generator?: Partial<CameraGeneratorConfig>;
	generate_portraits: boolean;
	use_character_references: boolean;
	parallel_generation: boolean;
}

export function createIdea2VideoConfig(
	partial?: Partial<Idea2VideoConfig>
): Idea2VideoConfig {
	return {
		output_dir: "media/generated/vimax/idea2video",
		save_intermediate: true,
		target_duration: 60.0,
		video_model: "kling",
		image_model: "nano_banana_pro",
		llm_model: "google/gemini-3-flash-preview",
		generate_portraits: true,
		use_character_references: true,
		parallel_generation: false,
		...partial,
	};
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface Idea2VideoResult {
	success: boolean;
	idea: string;
	script?: Script;
	characters: CharacterInNovel[];
	portraits: Record<string, CharacterPortrait>;
	portrait_registry?: CharacterPortraitRegistry;
	storyboard?: StoryboardResult;
	output?: PipelineOutput;
	started_at: string;
	completed_at?: string;
	total_cost: number;
	errors: string[];
}

function createResult(idea: string): Idea2VideoResult {
	return {
		success: false,
		idea,
		characters: [],
		portraits: {},
		started_at: new Date().toISOString(),
		total_cost: 0,
		errors: [],
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeSlug(value: string): string {
	const safe = value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_|_$/g, "");
	return safe || "untitled";
}

function scriptToText(script: Script): string {
	const parts: string[] = [
		`Title: ${script.title}`,
		`Logline: ${script.logline}`,
		"",
	];
	for (const scene of script.scenes) {
		parts.push(`Scene: ${scene.title}`);
		parts.push(`Location: ${scene.location}`);
		for (const shot of scene.shots) {
			parts.push(`- ${shot.description}`);
		}
		parts.push("");
	}
	return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export class Idea2VideoPipeline {
	config: Idea2VideoConfig;

	private screenwriter!: Screenwriter;
	private character_extractor!: CharacterExtractor;
	private portraits_generator!: CharacterPortraitsGenerator;
	private storyboard_artist!: StoryboardArtist;
	private camera_generator!: CameraImageGenerator;

	constructor(config?: Partial<Idea2VideoConfig>) {
		this.config = createIdea2VideoConfig(config);
		this._initAgents();
	}

	/** Create pipeline from a YAML config file. */
	static fromYaml(yamlPath: string): Idea2VideoPipeline {
		const content = fs.readFileSync(yamlPath, "utf-8");
		// Simple YAML key: value parsing for pipeline config
		const config: Record<string, unknown> = {};
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const colonIdx = trimmed.indexOf(":");
			if (colonIdx === -1) continue;
			const key = trimmed.slice(0, colonIdx).trim();
			let value: unknown = trimmed.slice(colonIdx + 1).trim();
			// Parse basic types
			if (value === "true") value = true;
			else if (value === "false") value = false;
			else if (!isNaN(Number(value)) && value !== "") value = Number(value);
			config[key] = value;
		}
		return new Idea2VideoPipeline(config as Partial<Idea2VideoConfig>);
	}

	private _initAgents(): void {
		this.screenwriter = new Screenwriter({
			model: this.config.llm_model,
			target_duration: this.config.target_duration,
			...this.config.screenwriter,
		});

		this.character_extractor = new CharacterExtractor({
			model: this.config.llm_model,
			...this.config.character_extractor,
		});

		this.portraits_generator = new CharacterPortraitsGenerator({
			image_model: this.config.image_model,
			llm_model: this.config.llm_model,
			output_dir: `${this.config.output_dir}/portraits`,
			...this.config.portraits_generator,
		});

		this.storyboard_artist = new StoryboardArtist({
			image_model: this.config.image_model,
			output_dir: `${this.config.output_dir}/storyboard`,
			...this.config.storyboard_artist,
		});

		this.camera_generator = new CameraImageGenerator({
			video_model: this.config.video_model,
			output_dir: `${this.config.output_dir}/videos`,
			...this.config.camera_generator,
		});
	}

	async run(idea: string): Promise<Idea2VideoResult> {
		const result = createResult(idea);

		console.log(`[idea2video] Starting pipeline for: ${idea.slice(0, 100)}...`);

		try {
			const outputDir = this.config.output_dir;
			fs.mkdirSync(outputDir, { recursive: true });

			// Step 1: Generate Script
			console.log("[idea2video] Step 1/5: Generating script...");
			const scriptResult = await this.screenwriter.process(idea);
			if (!scriptResult.success || !scriptResult.result) {
				result.errors.push(`Script generation failed: ${scriptResult.error}`);
				return result;
			}
			result.script = scriptResult.result;
			result.total_cost += (scriptResult.metadata.cost as number) ?? 0;

			if (this.config.save_intermediate) {
				this._saveJson(result.script, path.join(outputDir, "script.json"));
			}

			// Step 2: Extract Characters
			console.log("[idea2video] Step 2/5: Extracting characters...");
			const scriptText = scriptToText(result.script);
			const charResult = await this.character_extractor.process(scriptText);
			if (charResult.success && charResult.result) {
				result.characters = charResult.result;
				result.total_cost += (charResult.metadata.cost as number) ?? 0;
			} else {
				console.warn(
					`[idea2video] Character extraction failed: ${charResult.error}`
				);
			}

			// Step 3: Generate Character Portraits (optional)
			if (this.config.generate_portraits && result.characters.length > 0) {
				console.log("[idea2video] Step 3/5: Generating character portraits...");
				const portraitsResult = await this.portraits_generator.generateBatch(
					result.characters.slice(0, 5)
				);
				result.portraits = portraitsResult.result ?? {};
				result.total_cost += (portraitsResult.metadata.cost as number) ?? 0;

				if (
					Object.keys(result.portraits).length > 0 &&
					this.config.use_character_references &&
					result.script
				) {
					result.portrait_registry = new CharacterPortraitRegistry(
						safeSlug(result.script.title)
					);
					for (const portrait of Object.values(result.portraits)) {
						result.portrait_registry.addPortrait(portrait);
					}
					console.log(
						`[idea2video] Created portrait registry with ${Object.keys(result.portraits).length} characters`
					);
				}
			}

			// Step 4: Generate Storyboard
			console.log("[idea2video] Step 4/5: Generating storyboard...");
			const storyboardResult = await this.storyboard_artist.process(
				result.script,
				result.portrait_registry
			);
			if (!storyboardResult.success || !storyboardResult.result) {
				result.errors.push(
					`Storyboard generation failed: ${storyboardResult.error}`
				);
				return result;
			}
			result.storyboard = storyboardResult.result;
			result.total_cost += (storyboardResult.metadata.cost as number) ?? 0;

			// Step 5: Generate Videos
			console.log("[idea2video] Step 5/5: Generating videos...");
			const videoResult = await this.camera_generator.process(
				result.storyboard
			);
			if (!videoResult.success || !videoResult.result) {
				result.errors.push(`Video generation failed: ${videoResult.error}`);
				return result;
			}
			result.output = videoResult.result;
			result.total_cost += (videoResult.metadata.cost as number) ?? 0;

			// Mark success
			result.success = true;
			result.completed_at = new Date().toISOString();

			const durationMs = result.completed_at
				? new Date(result.completed_at).getTime() -
					new Date(result.started_at).getTime()
				: 0;
			console.log(
				`[idea2video] Pipeline completed! Duration: ${(durationMs / 1000).toFixed(1)}s, Cost: $${result.total_cost.toFixed(3)}`
			);

			if (this.config.save_intermediate) {
				this._saveSummary(result, path.join(outputDir, "summary.json"));
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[idea2video] Pipeline failed: ${msg}`);
			result.errors.push(msg);
		}

		return result;
	}

	private _saveJson(data: unknown, filePath: string): void {
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
	}

	private _saveSummary(result: Idea2VideoResult, filePath: string): void {
		const summary = {
			success: result.success,
			idea: result.idea,
			script_title: result.script?.title ?? null,
			scene_count: result.script?.scenes.length ?? 0,
			character_count: result.characters.length,
			portrait_count: Object.keys(result.portraits).length,
			used_character_references: result.portrait_registry != null,
			video_count: result.output?.videos.length ?? 0,
			final_video: result.output?.final_video?.video_path ?? null,
			total_cost: result.total_cost,
			duration_seconds: result.completed_at
				? (new Date(result.completed_at).getTime() -
						new Date(result.started_at).getTime()) /
					1000
				: null,
			errors: result.errors,
		};
		this._saveJson(summary, filePath);
	}
}

/** Factory: create pipeline from config or defaults. */
export function createPipeline(
	config?: Partial<Idea2VideoConfig>
): Idea2VideoPipeline {
	return new Idea2VideoPipeline(config);
}
