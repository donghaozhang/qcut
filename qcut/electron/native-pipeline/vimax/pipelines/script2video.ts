/**
 * Script to Video Pipeline
 *
 * Converts an existing script into a video:
 * 1. Parse script (from object, dict, or JSON file)
 * 2. Generate storyboard images
 * 3. Generate videos from storyboard
 * 4. Concatenate to final video
 *
 * Ported from: vimax/pipelines/script2video.py
 */

import * as fs from "fs";
import * as path from "path";

import {
	type Script,
	StoryboardArtist,
	type StoryboardArtistConfig,
	CameraImageGenerator,
	type CameraGeneratorConfig,
} from "../agents/index.js";
import { CharacterPortraitRegistry } from "../types/character.js";
import type { PipelineOutput } from "../types/output.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface Script2VideoConfig {
	output_dir: string;
	video_model: string;
	image_model: string;
	use_character_references: boolean;
	storyboard_artist?: Partial<StoryboardArtistConfig>;
	camera_generator?: Partial<CameraGeneratorConfig>;
}

export function createScript2VideoConfig(
	partial?: Partial<Script2VideoConfig>
): Script2VideoConfig {
	return {
		output_dir: "media/generated/vimax/script2video",
		video_model: "kling",
		image_model: "gmi_gemini_3_pro_image",
		use_character_references: true,
		...partial,
	};
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface Script2VideoResult {
	success: boolean;
	script: Script;
	portrait_registry?: CharacterPortraitRegistry;
	used_references: boolean;
	output?: PipelineOutput;
	started_at: string;
	completed_at?: string;
	total_cost: number;
	errors: string[];
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export class Script2VideoPipeline {
	config: Script2VideoConfig;

	private storyboard_artist!: StoryboardArtist;
	private camera_generator!: CameraImageGenerator;

	constructor(config?: Partial<Script2VideoConfig>) {
		this.config = createScript2VideoConfig(config);
		this._initAgents();
	}

	private _initAgents(): void {
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

	/**
	 * Run the pipeline.
	 *
	 * @param script - Script object, plain object, or path to JSON file
	 * @param portraitRegistry - Optional registry of character portraits for consistency
	 */
	async run(
		script: Script | Record<string, unknown> | string,
		portraitRegistry?: CharacterPortraitRegistry
	): Promise<Script2VideoResult> {
		// Parse script input
		const parsedScript = this._parseScript(script);

		const result: Script2VideoResult = {
			success: false,
			script: parsedScript,
			used_references: false,
			started_at: new Date().toISOString(),
			total_cost: 0,
			errors: [],
		};

		// Store registry if provided
		if (portraitRegistry && this.config.use_character_references) {
			result.portrait_registry = portraitRegistry;
			result.used_references = portraitRegistry.portraits.size > 0;
			console.log(
				`[script2video] Using portrait registry with ${portraitRegistry.portraits.size} characters`
			);
		}

		console.log(`[script2video] Starting pipeline for: ${parsedScript.title}`);

		try {
			fs.mkdirSync(this.config.output_dir, { recursive: true });

			// Step 1: Generate Storyboard
			console.log("[script2video] Step 1/2: Generating storyboard...");
			const storyboardResult = await this.storyboard_artist.process(
				parsedScript,
				result.portrait_registry
			);
			if (!storyboardResult.success || !storyboardResult.result) {
				result.errors.push(`Storyboard failed: ${storyboardResult.error}`);
				return result;
			}
			result.total_cost += (storyboardResult.metadata.cost as number) ?? 0;

			// Step 2: Generate Videos
			console.log("[script2video] Step 2/2: Generating videos...");
			const videoResult = await this.camera_generator.process(
				storyboardResult.result
			);
			if (!videoResult.success || !videoResult.result) {
				result.errors.push(`Video generation failed: ${videoResult.error}`);
				return result;
			}

			result.output = videoResult.result;
			result.total_cost += (videoResult.metadata.cost as number) ?? 0;
			result.success = true;
			result.completed_at = new Date().toISOString();

			console.log(
				`[script2video] Pipeline completed! Cost: $${result.total_cost.toFixed(3)}`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[script2video] Pipeline failed: ${msg}`);
			result.errors.push(msg);
		}

		return result;
	}

	/** Parse script from various input formats. */
	private _parseScript(
		input: Script | Record<string, unknown> | string
	): Script {
		if (typeof input === "string") {
			return this._loadScript(input);
		}

		// Check if it's already a Script (has scenes array)
		if (Array.isArray((input as Script).scenes)) {
			return input as Script;
		}

		// Treat as plain object
		const obj = input as Record<string, unknown>;
		return {
			title: String(obj.title ?? "Untitled"),
			logline: String(obj.logline ?? ""),
			scenes: Array.isArray(obj.scenes) ? (obj.scenes as Script["scenes"]) : [],
			total_duration: Number(obj.total_duration ?? 0),
		};
	}

	/** Load script from JSON file. */
	private _loadScript(filePath: string): Script {
		if (!fs.existsSync(filePath)) {
			throw new Error(`Script file not found: ${filePath}`);
		}

		const raw = fs.readFileSync(filePath, "utf-8");
		let data: unknown;
		try {
			data = JSON.parse(raw);
		} catch {
			throw new Error(`Invalid JSON in script file ${filePath}`);
		}

		const obj = data as Record<string, unknown>;
		return {
			title: String(obj.title ?? "Untitled"),
			logline: String(obj.logline ?? ""),
			scenes: Array.isArray(obj.scenes) ? (obj.scenes as Script["scenes"]) : [],
			total_duration: Number(obj.total_duration ?? 0),
		};
	}
}
