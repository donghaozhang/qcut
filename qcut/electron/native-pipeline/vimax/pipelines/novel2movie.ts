/**
 * Novel to Movie Pipeline
 *
 * Converts novels or long-form content into videos:
 * 1. Extract characters from full novel
 * 2. Generate character portraits for consistency
 * 3. Segment novel directly into ~15s shots (no compression, zero info loss)
 * 4. Generate storyboard images / videos from shots
 * 5. Concatenate all videos into final movie
 *
 * Supports `scripts_only` and `storyboard_only` mode flags for partial runs.
 */

import * as fs from "fs";
import * as path from "path";

import {
	type Script,
	CharacterExtractor,
	CharacterPortraitsGenerator,
	StoryboardArtist,
	CameraImageGenerator,
	NovelSegmenter,
	buildPromptDescriptions,
} from "../agents/index.js";
import { VideoGeneratorAdapter } from "../adapters/video-adapter.js";
import type {
	CharacterInNovel,
	CharacterPortrait,
} from "../types/character.js";
import { CharacterPortraitRegistry } from "../types/character.js";
import type { PipelineOutput, VideoOutput } from "../types/output.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface Novel2MovieConfig {
	output_dir: string;
	video_model: string;
	image_model: string;
	llm_model: string;
	shot_duration: number;
	visual_style: string;
	generate_portraits: boolean;
	use_character_references: boolean;
	max_characters: number;
	scripts_only: boolean;
	storyboard_only: boolean;
	save_intermediate: boolean;
	chunk_size: number;
	overlap: number;
}

export function createNovel2MovieConfig(
	partial?: Partial<Novel2MovieConfig>
): Novel2MovieConfig {
	return {
		output_dir: "media/generated/vimax/novel2movie",
		video_model: "kling",
		image_model: "nano_banana_2",
		llm_model: "google/gemini-3-flash-preview",
		shot_duration: 15,
		visual_style: "真人写实, 电视风格, 暖色调",
		generate_portraits: true,
		use_character_references: true,
		max_characters: 5,
		scripts_only: false,
		storyboard_only: false,
		save_intermediate: true,
		chunk_size: 2_000,
		overlap: 200,
		...partial,
	};
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface Novel2MovieResult {
	success: boolean;
	novel_title: string;
	scripts: Script[];
	characters: CharacterInNovel[];
	portraits: Record<string, CharacterPortrait>;
	portrait_registry?: CharacterPortraitRegistry;
	output?: PipelineOutput;
	started_at: string;
	completed_at?: string;
	total_cost: number;
	errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ~150K words — fits in Gemini 3 Flash context window */
const NOVEL_WARN_THRESHOLD = 600_000;
/** ~500K words — too large to process reliably */
const NOVEL_MAX_THRESHOLD = 2_000_000;
/** Target size per split file when novel exceeds max */
const SPLIT_FILE_SIZE = 500_000;

function safeSlug(value: string): string {
	const safe = value.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/^_|_$/g, "");
	return safe || "untitled";
}

function saveJson(data: unknown, filePath: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export class Novel2MoviePipeline {
	config: Novel2MovieConfig;

	private segmenter!: NovelSegmenter;
	private character_extractor!: CharacterExtractor;
	private portraits_generator!: CharacterPortraitsGenerator;
	private storyboard_artist!: StoryboardArtist;
	private camera_generator!: CameraImageGenerator;

	constructor(config?: Partial<Novel2MovieConfig>) {
		this.config = createNovel2MovieConfig(config);
		this._initComponents();
	}

	private _initComponents(outputDir?: string): void {
		const base = outputDir ?? this.config.output_dir;

		this.segmenter = new NovelSegmenter({
			model: this.config.llm_model,
			shot_duration: this.config.shot_duration,
		});

		this.character_extractor = new CharacterExtractor({
			model: this.config.llm_model,
		});

		this.portraits_generator = new CharacterPortraitsGenerator({
			image_model: this.config.image_model,
			llm_model: this.config.llm_model,
			output_dir: `${base}/portraits`,
		});

		this.storyboard_artist = new StoryboardArtist({
			image_model: this.config.image_model,
			output_dir: `${base}/storyboard`,
		});

		this.camera_generator = new CameraImageGenerator({
			video_model: this.config.video_model,
			output_dir: `${base}/videos`,
		});
	}

	async run(
		novelText: string,
		title = "Untitled Novel",
		sourcePath?: string
	): Promise<Novel2MovieResult> {
		const result: Novel2MovieResult = {
			success: false,
			novel_title: title,
			scripts: [],
			characters: [],
			portraits: {},
			started_at: new Date().toISOString(),
			total_cost: 0,
			errors: [],
		};

		const charCount = novelText.length;
		const wordEstimate = Math.round(charCount / 4);

		// --- Novel size validation ---
		if (charCount > NOVEL_MAX_THRESHOLD) {
			console.log(
				`[novel2movie] Novel too large (~${wordEstimate.toLocaleString()} words, ${charCount.toLocaleString()} chars).`
			);
			console.log(
				`[novel2movie] Maximum supported size is ~${(NOVEL_MAX_THRESHOLD / 4).toLocaleString()} words.`
			);
			console.log("[novel2movie] Splitting into smaller files...");

			try {
				const splitDir = path.join(
					this.config.output_dir,
					safeSlug(title),
					"split_parts"
				);
				fs.mkdirSync(splitDir, { recursive: true });

				let partIndex = 0;
				let start = 0;
				while (start < charCount) {
					let end = Math.min(start + SPLIT_FILE_SIZE, charCount);
					if (end < charCount) {
						const chunk = novelText.slice(start, end);
						const lastParagraph = chunk.lastIndexOf("\n\n");
						if (lastParagraph > SPLIT_FILE_SIZE * 0.8) {
							end = start + lastParagraph + 2;
						}
					}
					const partFile = path.join(
						splitDir,
						`part_${String(partIndex + 1).padStart(2, "0")}.txt`
					);
					fs.writeFileSync(partFile, novelText.slice(start, end));
					start = end;
					partIndex++;
				}

				console.log(
					`[novel2movie] Split into ${partIndex} files at: ${splitDir}`
				);
				result.errors.push(
					`Novel too large (${wordEstimate.toLocaleString()} words). Split into ${partIndex} files at ${splitDir}`
				);
			} catch (err) {
				result.errors.push(
					`Novel too large and splitting failed: ${err instanceof Error ? err.message : String(err)}`
				);
			}
			return result;
		}

		if (charCount > NOVEL_WARN_THRESHOLD) {
			console.warn(
				`[novel2movie] Large novel (~${wordEstimate.toLocaleString()} words). Processing may be slow.`
			);
		}

		console.log(
			`[novel2movie] Starting pipeline for: ${title} (~${wordEstimate.toLocaleString()} words)`
		);

		try {
			const safeTitle = safeSlug(title);
			const timestamp = new Date()
				.toISOString()
				.replace(/[-:T]/g, "")
				.slice(0, 12);
			const outputDir = path.join(
				this.config.output_dir,
				`${safeTitle}_${timestamp}`
			);
			fs.mkdirSync(outputDir, { recursive: true });

			// Copy source novel into output folder for easy reference
			if (sourcePath && fs.existsSync(sourcePath)) {
				const ext = path.extname(sourcePath) || ".txt";
				fs.copyFileSync(sourcePath, path.join(outputDir, `novel${ext}`));
			} else {
				fs.writeFileSync(path.join(outputDir, "novel.txt"), novelText);
			}

			// Re-init components so portraits/storyboard go under per-title dir
			this._initComponents(outputDir);

			// Step 1: Extract characters
			console.log("[novel2movie] Step 1: Extracting characters...");
			const charResult = await this.character_extractor.process(
				novelText.slice(0, 50_000)
			);
			if (charResult.success && charResult.result) {
				result.characters = charResult.result;
				result.total_cost += (charResult.metadata.cost as number) ?? 0;
				if (this.config.save_intermediate) {
					saveJson(result.characters, path.join(outputDir, "characters.json"));
				}
			}

			// Step 1b: Generate character portraits
			if (
				this.config.generate_portraits &&
				!this.config.scripts_only &&
				result.characters.length > 0
			) {
				console.log("[novel2movie] Step 1b: Generating character portraits...");
				const portraitsResult = await this.portraits_generator.generateBatch(
					result.characters.slice(0, this.config.max_characters)
				);
				result.portraits = portraitsResult.result ?? {};
				result.total_cost += (portraitsResult.metadata.cost as number) ?? 0;

				if (
					Object.keys(result.portraits).length > 0 &&
					this.config.use_character_references
				) {
					result.portrait_registry = new CharacterPortraitRegistry(safeTitle);
					for (const portrait of Object.values(result.portraits)) {
						result.portrait_registry.addPortrait(portrait);
					}
					console.log(
						`[novel2movie] Created portrait registry with ${Object.keys(result.portraits).length} characters`
					);
					if (this.config.save_intermediate) {
						saveJson(
							result.portrait_registry.toJSON(),
							path.join(outputDir, "portrait_registry.json")
						);
					}
				}
			} else if (this.config.scripts_only) {
				console.log("[novel2movie] Step 1b: Skipped (scripts_only mode)");
			}

			// Step 2: Segment novel directly into shots (no compression)
			console.log("[novel2movie] Step 2: Segmenting novel into shots...");
			const allVideos: VideoOutput[] = [];
			const scriptsDir = path.join(outputDir, "scripts");
			if (this.config.save_intermediate) {
				fs.mkdirSync(scriptsDir, { recursive: true });
			}

			const chunks = this._splitText(novelText);
			for (let i = 0; i < chunks.length; i++) {
				console.log(
					`[novel2movie] Segmenting chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`
				);

				const segResult = await this.segmenter.process(chunks[i]);

				if (!segResult.success || !segResult.result) {
					console.warn(`[novel2movie] Segmentation failed for chunk ${i + 1}`);
					result.errors.push(
						`Segmentation failed for chunk ${i + 1}: ${segResult.error}`
					);
					continue;
				}

				// Enrich shots with prompt_description
				buildPromptDescriptions(segResult.result, result.characters, {
					style: this.config.visual_style,
				});

				result.scripts.push(segResult.result);
				result.total_cost += (segResult.metadata.cost as number) ?? 0;
				if (this.config.save_intermediate) {
					saveJson(
						segResult.result,
						path.join(
							scriptsDir,
							`chunk_${String(i + 1).padStart(3, "0")}.json`
						)
					);
				}

				// Skip image/video generation in scripts_only mode
				if (this.config.scripts_only) {
					continue;
				}

				// Generate storyboard with character references
				const storyboardResult = await this.storyboard_artist.process(
					segResult.result,
					result.portrait_registry,
					i + 1
				);
				if (!storyboardResult.success || !storyboardResult.result) {
					continue;
				}
				result.total_cost += (storyboardResult.metadata.cost as number) ?? 0;

				if (this.config.save_intermediate) {
					saveJson(
						segResult.result,
						path.join(
							scriptsDir,
							`chunk_${String(i + 1).padStart(3, "0")}.json`
						)
					);
				}

				if (this.config.storyboard_only) {
					continue;
				}

				// Generate videos
				const videoResult = await this.camera_generator.process(
					storyboardResult.result
				);
				if (videoResult.success && videoResult.result?.videos) {
					allVideos.push(...videoResult.result.videos);
					result.total_cost += (videoResult.metadata.cost as number) ?? 0;
				}
			}

			// Step 3: Concatenate all videos
			if (
				allVideos.length > 0 &&
				!this.config.storyboard_only &&
				!this.config.scripts_only
			) {
				console.log("[novel2movie] Step 3: Assembling final video...");
				const finalPath = path.join(outputDir, "final_movie.mp4");

				const videoAdapter = new VideoGeneratorAdapter();
				await videoAdapter.initialize();

				const finalVideo = await videoAdapter.concatenateVideos(
					allVideos,
					finalPath
				);

				result.output = {
					pipeline_name: `novel2movie_${safeTitle}`,
					started_at: result.started_at,
					images: [],
					videos: allVideos,
					final_video: finalVideo,
					total_cost: result.total_cost,
					output_directory: outputDir,
					errors: [],
				};
			}

			result.success = result.scripts.length > 0;
			result.completed_at = new Date().toISOString();

			if (this.config.save_intermediate) {
				this._saveSummary(result, path.join(outputDir, "summary.json"));
			}

			const totalShots = result.scripts.reduce(
				(sum, s) => sum + s.scenes.reduce((ss, sc) => ss + sc.shots.length, 0),
				0
			);
			console.log(
				"[novel2movie] Pipeline completed! " +
					`Scripts: ${result.scripts.length}, ` +
					`Shots: ${totalShots}, ` +
					`Cost: $${result.total_cost.toFixed(3)}`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[novel2movie] Pipeline failed: ${msg}`);
			result.errors.push(msg);
		}

		return result;
	}

	/** Split text into overlapping chunks for segmentation. */
	private _splitText(text: string): string[] {
		if (this.config.overlap >= this.config.chunk_size) {
			throw new Error(
				`overlap (${this.config.overlap}) must be less than chunk_size (${this.config.chunk_size})`
			);
		}

		const chunks: string[] = [];
		let start = 0;

		while (start < text.length) {
			let end = start + this.config.chunk_size;
			let chunk = text.slice(start, end);

			// Try to end at paragraph boundary
			if (end < text.length) {
				const lastBreak = chunk.lastIndexOf("\n\n");
				if (lastBreak > this.config.chunk_size * 0.7) {
					chunk = chunk.slice(0, lastBreak + 2);
					end = start + lastBreak + 2;
				}
			}

			chunks.push(chunk);
			start = end - this.config.overlap;
		}

		return chunks;
	}

	private _saveSummary(result: Novel2MovieResult, filePath: string): void {
		const totalShots = result.scripts.reduce(
			(sum, s) => sum + s.scenes.reduce((ss, sc) => ss + sc.shots.length, 0),
			0
		);
		const summary = {
			success: result.success,
			novel_title: result.novel_title,
			script_count: result.scripts.length,
			total_shots: totalShots,
			character_count: result.characters.length,
			portrait_count: Object.keys(result.portraits).length,
			used_character_references: result.portrait_registry != null,
			storyboard_only: this.config.storyboard_only,
			video_count: result.output?.videos.length ?? 0,
			final_video: result.output?.final_video?.video_path ?? null,
			total_cost: result.total_cost,
			started_at: result.started_at,
			completed_at: result.completed_at ?? null,
			errors: result.errors,
		};
		saveJson(summary, filePath);
	}
}
