/**
 * Novel to Movie Pipeline
 *
 * Extended pipeline for converting novels or long-form content into videos:
 * 1. Extract characters from full novel
 * 2. Generate character portraits for consistency
 * 3. Compress novel into key scenes (chapters)
 * 4. Per-chapter: Generate script -> Storyboard -> Videos
 * 5. Concatenate all chapter videos into final movie
 *
 * Supports `scripts_only` and `storyboard_only` mode flags for partial runs.
 *
 * Ported from: vimax/pipelines/novel2movie.py
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
	CameraImageGenerator,
	type CameraGeneratorConfig,
} from "../agents/index.js";
import {
	CHAPTER_COMPRESSION_JSON_SCHEMA,
	validateChapterCompressionResponse,
} from "../agents/schemas.js";
import { LLMAdapter, type Message } from "../adapters/llm-adapter.js";
import { VideoGeneratorAdapter } from "../adapters/video-adapter.js";
import type {
	CharacterInNovel,
	CharacterPortrait,
} from "../types/character.js";
import { CharacterPortraitRegistry } from "../types/character.js";
import type { PipelineOutput, VideoOutput } from "../types/output.js";
import { detectLanguageInstruction } from "../detect-language.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface Novel2MovieConfig {
	output_dir: string;
	max_scenes: number;
	scene_duration: number;
	video_model: string;
	image_model: string;
	llm_model: string;
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
		max_scenes: 10,
		scene_duration: 30.0,
		video_model: "kling",
		image_model: "nano_banana_2",
		llm_model: "google/gemini-3-flash-preview",
		generate_portraits: true,
		use_character_references: true,
		max_characters: 5,
		scripts_only: false,
		storyboard_only: false,
		save_intermediate: true,
		chunk_size: 10_000,
		overlap: 500,
		...partial,
	};
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface ChapterSummary {
	chapter_id: string;
	title: string;
	summary: string;
	key_events: string[];
	characters: string[];
	setting: string;
}

export interface Novel2MovieResult {
	success: boolean;
	novel_title: string;
	chapters: ChapterSummary[];
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
// Prompt
// ---------------------------------------------------------------------------

const COMPRESSION_PROMPT = `You are an expert at adapting novels for film.
{lang_instruction}

Analyze this section of text and extract the key visual scenes that would work for a short film adaptation.

TEXT:
{text}

For each key scene, provide:
1. A brief title
2. A visual description (what we would SEE on screen)
3. The main characters involved
4. The setting/location

Focus on scenes with strong visual potential. Limit to {max_scenes} scenes.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Novel size limits (in characters)
// ---------------------------------------------------------------------------

/** ~150K words — fits in Gemini 3 Flash context window */
const NOVEL_WARN_THRESHOLD = 600_000;
/** ~500K words — too large to process reliably */
const NOVEL_MAX_THRESHOLD = 2_000_000;
/** Target size per split file when novel exceeds max */
const SPLIT_FILE_SIZE = 500_000;

function safeSlug(value: string): string {
	// Allow Unicode word characters (CJK, etc.), digits, dots, hyphens
	const safe = value
		.replace(/[^\p{L}\p{N}._-]+/gu, "_")
		.replace(/^_|_$/g, "");
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

	private _llm!: LLMAdapter;
	private screenwriter!: Screenwriter;
	private character_extractor!: CharacterExtractor;
	private portraits_generator!: CharacterPortraitsGenerator;
	private storyboard_artist!: StoryboardArtist;
	private camera_generator!: CameraImageGenerator;

	constructor(config?: Partial<Novel2MovieConfig>) {
		this.config = createNovel2MovieConfig(config);
		this._initComponents();
	}

	/**
	 * Initialize all components.
	 * When outputDir is provided, portraits and storyboard are saved under that directory.
	 */
	private _initComponents(outputDir?: string): void {
		const base = outputDir ?? this.config.output_dir;

		this._llm = new LLMAdapter({ model: this.config.llm_model });

		this.screenwriter = new Screenwriter({
			model: this.config.llm_model,
			target_duration: this.config.scene_duration,
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
		title = "Untitled Novel"
	): Promise<Novel2MovieResult> {
		const result: Novel2MovieResult = {
			success: false,
			novel_title: title,
			chapters: [],
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

					// Try to split at paragraph boundary
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
				console.log("[novel2movie] Run novel2movie on each part separately:");
				console.log(
					`  bun run pipeline vimax:novel2movie --novel ${splitDir}/part_01.txt --title "${title} Part 1"`
				);

				result.errors.push(
					`Novel too large (${wordEstimate.toLocaleString()} words). Split into ${partIndex} files at ${splitDir}`
				);
			} catch (err) {
				result.errors.push(
					`Novel too large (${wordEstimate.toLocaleString()} words) and splitting failed: ${err instanceof Error ? err.message : String(err)}`
				);
			}
			return result;
		}

		if (charCount > NOVEL_WARN_THRESHOLD) {
			console.warn(
				`[novel2movie] ⚠ Large novel (~${wordEstimate.toLocaleString()} words). ` +
					"Processing may be slow and use more API credits. Consider using --max-scenes to limit output."
			);
		}

		console.log(
			`[novel2movie] Starting pipeline for: ${title} (~${wordEstimate.toLocaleString()} words)`
		);

		try {
			const safeTitle = safeSlug(title);
			const outputDir = path.join(this.config.output_dir, safeTitle);
			fs.mkdirSync(outputDir, { recursive: true });

			// Re-init components so portraits/storyboard go under per-title dir
			this._initComponents(outputDir);

			// Initialize LLM
			await this._llm.initialize();

			// Step 1: Extract characters from full novel
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

			// Step 1b: Generate character portraits for consistency
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

			// Step 2: Compress novel into key scenes
			console.log("[novel2movie] Step 2: Compressing novel into scenes...");
			const chapters = await this._compressNovel(novelText);
			result.chapters = chapters;
			if (this.config.save_intermediate) {
				saveJson(chapters, path.join(outputDir, "chapters.json"));
			}

			// Step 3: Generate scripts for each chapter
			console.log("[novel2movie] Step 3: Generating scripts...");
			const allVideos: VideoOutput[] = [];
			const scriptsDir = path.join(outputDir, "scripts");
			if (this.config.save_intermediate) {
				fs.mkdirSync(scriptsDir, { recursive: true });
			}

			const chaptersToProcess = chapters.slice(0, this.config.max_scenes);
			for (let i = 0; i < chaptersToProcess.length; i++) {
				const chapter = chaptersToProcess[i];
				console.log(
					`[novel2movie] Processing chapter ${i + 1}/${chaptersToProcess.length}: ${chapter.title}`
				);

				// Generate script from chapter summary
				const scriptIdea = this._chapterToIdea(chapter);
				const scriptResult = await this.screenwriter.process(scriptIdea);

				if (!scriptResult.success || !scriptResult.result) {
					console.warn(
						`[novel2movie] Script generation failed for chapter ${i + 1}`
					);
					continue;
				}

				result.scripts.push(scriptResult.result);
				result.total_cost += (scriptResult.metadata.cost as number) ?? 0;
				if (this.config.save_intermediate) {
					saveJson(
						scriptResult.result,
						path.join(
							scriptsDir,
							`chapter_${String(i + 1).padStart(3, "0")}.json`
						)
					);
				}

				// Skip image/video generation in scripts_only mode
				if (this.config.scripts_only) {
					continue;
				}

				// Generate storyboard with character references
				const storyboardResult = await this.storyboard_artist.process(
					scriptResult.result,
					result.portrait_registry,
					i + 1
				);
				if (!storyboardResult.success || !storyboardResult.result) {
					continue;
				}
				result.total_cost += (storyboardResult.metadata.cost as number) ?? 0;

				// Re-save script now that resolveReferences has enriched shots
				if (this.config.save_intermediate) {
					saveJson(
						scriptResult.result,
						path.join(
							scriptsDir,
							`chapter_${String(i + 1).padStart(3, "0")}.json`
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

			// Step 4: Concatenate all chapter videos
			if (
				allVideos.length > 0 &&
				!this.config.storyboard_only &&
				!this.config.scripts_only
			) {
				console.log("[novel2movie] Step 4: Assembling final video...");
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

			console.log(
				"[novel2movie] Pipeline completed! " +
					`Chapters: ${result.chapters.length}, ` +
					`Scripts: ${result.scripts.length}, ` +
					`Cost: $${result.total_cost.toFixed(3)}`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[novel2movie] Pipeline failed: ${msg}`);
			result.errors.push(msg);
		}

		return result;
	}

	/** Compress novel into key scenes using LLM. */
	private async _compressNovel(text: string): Promise<ChapterSummary[]> {
		const chapters: ChapterSummary[] = [];
		const chunks = this._splitText(text);
		const langInstruction = detectLanguageInstruction(text);

		for (let i = 0; i < chunks.length; i++) {
			const prompt = COMPRESSION_PROMPT.replace(
				"{lang_instruction}",
				langInstruction
			)
				.replace("{text}", chunks[i])
				.replace("{max_scenes}", "3");

			try {
				const messages: Message[] = [{ role: "user", content: prompt }];
				const result = await this._llm.chatWithStructuredOutput(
					messages,
					"chapter_compression",
					CHAPTER_COMPRESSION_JSON_SCHEMA,
					validateChapterCompressionResponse,
					{ temperature: 0.5 }
				);

				const chapter: ChapterSummary = {
					chapter_id: `chapter_${i + 1}`,
					title: result.title,
					summary: "",
					key_events: result.scenes.map((s) => s.description),
					characters: result.scenes.flatMap((s) => s.characters),
					setting: result.scenes[0]?.setting ?? "",
				};
				chapters.push(chapter);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.warn(`[novel2movie] Failed to parse chapter ${i + 1}: ${msg}`);
			}
		}

		return chapters;
	}

	/** Split text into overlapping chunks with sentence boundary detection. */
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

			// Try to end at sentence boundary
			if (end < text.length) {
				const lastPeriod = chunk.lastIndexOf(".");
				if (lastPeriod > this.config.chunk_size * 0.8) {
					chunk = chunk.slice(0, lastPeriod + 1);
					end = start + lastPeriod + 1;
				}
			}

			chunks.push(chunk);
			start = end - this.config.overlap;
		}

		return chunks;
	}

	/** Convert chapter summary to screenplay idea. */
	private _chapterToIdea(chapter: ChapterSummary): string {
		const parts: string[] = [`Scene: ${chapter.title}`];

		if (chapter.key_events.length > 0) {
			parts.push("Key moments:");
			for (const event of chapter.key_events.slice(0, 3)) {
				parts.push(`- ${event}`);
			}
		}

		if (chapter.characters.length > 0) {
			const uniqueChars = [...new Set(chapter.characters)];
			parts.push(`Characters: ${uniqueChars.slice(0, 5).join(", ")}`);
		}

		return parts.join("\n");
	}

	private _saveSummary(result: Novel2MovieResult, filePath: string): void {
		const summary = {
			success: result.success,
			novel_title: result.novel_title,
			chapter_count: result.chapters.length,
			script_count: result.scripts.length,
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
