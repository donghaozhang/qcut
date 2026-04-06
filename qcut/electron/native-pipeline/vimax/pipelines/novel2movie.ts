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
	/** Cap the number of storyboard images generated (0 = unlimited). */
	max_images: number;
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
		max_images: 0,
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
// Progress logging
// ---------------------------------------------------------------------------

interface PipelinePlan {
	scriptsOnly: boolean;
	storyboardOnly: boolean;
	imagesCapped: boolean;
	maxImages: number;
	generatePortraits: boolean;
}

function printStage(
	step: number,
	totalSteps: number,
	title: string,
	detail: string,
	next?: string
): void {
	const bar = `[${"=".repeat(step)}${"-".repeat(totalSteps - step)}]`;
	console.log("");
	console.log(`  ${bar}  Step ${step}/${totalSteps}: ${title}`);
	console.log(`  -> ${detail}`);
	if (next) {
		console.log(`  >> Next: ${next}`);
	}
}

/** Build the ordered list of pipeline step labels based on the plan. */
function buildStepLabels(plan: PipelinePlan): string[] {
	const steps: string[] = [];
	steps.push("Extract characters from novel");
	if (plan.generatePortraits && !plan.scriptsOnly) {
		steps.push("Generate character portraits");
	}
	steps.push("Segment novel into screenplay shots");
	if (!plan.scriptsOnly) {
		if (plan.imagesCapped) {
			steps.push(`Generate storyboard images (max ${plan.maxImages})`);
		} else {
			steps.push("Generate storyboard images (all shots)");
		}
	}
	if (!plan.scriptsOnly && !plan.storyboardOnly && !plan.imagesCapped) {
		steps.push("Generate videos from storyboard");
		steps.push("Assemble final movie");
	}
	return steps;
}

function printPlan(plan: PipelinePlan, title: string, wordCount: number): void {
	console.log("");
	console.log("=".repeat(60));
	console.log("  Novel-to-Movie Pipeline");
	console.log(`  Title: ${title} (~${wordCount.toLocaleString()} words)`);
	console.log("-".repeat(60));

	const steps = buildStepLabels(plan);
	for (let i = 0; i < steps.length; i++) {
		console.log(`  ${i + 1}. ${steps[i]}`);
	}

	if (plan.scriptsOnly) {
		console.log("\n  Mode: scripts-only (no images or videos)");
	} else if (plan.imagesCapped) {
		console.log(
			`\n  Mode: preview (${plan.maxImages} sample images, no videos)`
		);
	} else if (plan.storyboardOnly) {
		console.log("\n  Mode: storyboard-only (all images, no videos)");
	} else {
		console.log("\n  Mode: full pipeline (images + videos + final movie)");
	}
	console.log("=".repeat(60));
	console.log("");
}

function printDone(
	scriptCount: number,
	shotCount: number,
	imageCount: number,
	cost: number,
	outputDir: string
): void {
	console.log("");
	console.log("=".repeat(60));
	console.log("  Pipeline Complete!");
	console.log("-".repeat(60));
	console.log(`  Scripts:  ${scriptCount}`);
	console.log(`  Shots:    ${shotCount}`);
	if (imageCount > 0) {
		console.log(`  Images:   ${imageCount}`);
	}
	console.log(`  Cost:     $${cost.toFixed(3)}`);
	console.log(`  Output:   ${outputDir}`);
	console.log("=".repeat(60));
	console.log("");
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

		const imagesCapped =
			this.config.max_images > 0 && !this.config.scripts_only;
		const plan: PipelinePlan = {
			scriptsOnly: this.config.scripts_only,
			storyboardOnly: this.config.storyboard_only,
			imagesCapped,
			maxImages: this.config.max_images,
			generatePortraits: this.config.generate_portraits,
		};
		const stepLabels = buildStepLabels(plan);
		const totalSteps = stepLabels.length;

		printPlan(plan, title, wordEstimate);

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
			let currentStep = 1;
			printStage(
				currentStep,
				totalSteps,
				"Extract Characters",
				`Analyzing first ${Math.min(charCount, 50_000).toLocaleString()} chars for character profiles`,
				plan.generatePortraits && !plan.scriptsOnly
					? "Generate character portraits"
					: "Segment novel into shots"
			);
			const charResult = await this.character_extractor.process(
				novelText.slice(0, 50_000)
			);
			if (charResult.success && charResult.result) {
				result.characters = charResult.result;
				result.total_cost += (charResult.metadata.cost as number) ?? 0;
				console.log(
					`  Found ${result.characters.length} characters: ${result.characters.map((c) => c.name).join(", ")}`
				);
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
				currentStep++;
				const portraitNames = result.characters
					.slice(0, this.config.max_characters)
					.map((c) => c.name)
					.join(", ");
				printStage(
					currentStep,
					totalSteps,
					"Generate Portraits",
					`Creating reference portraits for: ${portraitNames}`,
					"Segment novel into shots"
				);
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
						`  Portrait registry created: ${Object.keys(result.portraits).length} characters`
					);
					if (this.config.save_intermediate) {
						saveJson(
							result.portrait_registry.toJSON(),
							path.join(outputDir, "portrait_registry.json")
						);
					}
				}
			} else if (this.config.scripts_only) {
				console.log("  Portraits: skipped (scripts-only mode)");
			}

			// Step 2: Segment novel directly into shots (no compression)
			currentStep++;
			const chunks = this._splitText(novelText);
			const imageLabel = plan.imagesCapped
				? `then generate up to ${plan.maxImages} sample images`
				: plan.scriptsOnly
					? "(scripts only, no images)"
					: "then generate storyboard images";
			printStage(
				currentStep,
				totalSteps,
				"Segment & Storyboard",
				`Splitting novel into ${chunks.length} chunks, converting to screenplay shots, ${imageLabel}`,
				plan.scriptsOnly || plan.storyboardOnly || plan.imagesCapped
					? "Done!"
					: "Generate videos from storyboard"
			);
			const allVideos: VideoOutput[] = [];
			const scriptsDir = path.join(outputDir, "scripts");
			if (this.config.save_intermediate) {
				fs.mkdirSync(scriptsDir, { recursive: true });
			}

			let totalImagesGenerated = 0;

			for (let i = 0; i < chunks.length; i++) {
				console.log(
					`\n  Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`
				);

				const segResult = await this.segmenter.process(chunks[i]);

				if (!segResult.success || !segResult.result) {
					console.warn(`  Segmentation failed for chunk ${i + 1}`);
					result.errors.push(
						`Segmentation failed for chunk ${i + 1}: ${segResult.error}`
					);
					continue;
				}

				// Enrich shots with prompt_description
				buildPromptDescriptions(segResult.result, result.characters, {
					style: this.config.visual_style,
				});

				const chunkShots = segResult.result.scenes.reduce(
					(s, sc) => s + sc.shots.length,
					0
				);
				console.log(
					`  -> ${segResult.result.scenes.length} scenes, ${chunkShots} shots`
				);
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

				// Skip storyboard if image cap already reached
				if (imagesCapped && totalImagesGenerated >= this.config.max_images) {
					console.log(
						`  Skipping images (${totalImagesGenerated}/${this.config.max_images} cap reached)`
					);
					continue;
				}

				// Generate storyboard with character references
				const storyboardResult = await this.storyboard_artist.process(
					segResult.result,
					result.portrait_registry,
					i + 1,
					imagesCapped
						? this.config.max_images - totalImagesGenerated
						: undefined
				);
				if (!storyboardResult.success || !storyboardResult.result) {
					continue;
				}
				result.total_cost += (storyboardResult.metadata.cost as number) ?? 0;
				totalImagesGenerated += storyboardResult.result?.images?.length ?? 0;

				if (this.config.save_intermediate) {
					saveJson(
						segResult.result,
						path.join(
							scriptsDir,
							`chunk_${String(i + 1).padStart(3, "0")}.json`
						)
					);
				}

				// When max_images is set, skip video generation (preview mode)
				if (this.config.storyboard_only || imagesCapped) {
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

			// Step: Concatenate all videos
			if (
				allVideos.length > 0 &&
				!this.config.storyboard_only &&
				!this.config.scripts_only
			) {
				currentStep++;
				printStage(
					currentStep,
					totalSteps,
					"Assemble Final Movie",
					`Concatenating ${allVideos.length} video clips into final movie`,
					"Done!"
				);
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
			if (result.success) {
				printDone(
					result.scripts.length,
					totalShots,
					totalImagesGenerated,
					result.total_cost,
					outputDir
				);
			} else {
				console.error(
					`\n  Pipeline finished with errors: ${result.errors.join("; ")}`
				);
			}
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
