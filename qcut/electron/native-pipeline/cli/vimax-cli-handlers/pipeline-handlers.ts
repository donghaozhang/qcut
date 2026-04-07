/**
 * ViMax Pipeline Handlers
 *
 * idea2video, script2video, novel2movie
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CLIRunOptions, CLIResult } from "../cli-runner/types.js";
import { resolveOutputDir } from "../../output/output-utils.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

/** vimax:idea2video — Full pipeline from idea to video. */
export async function handleVimaxIdea2Video(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const idea = options.idea || options.text;
	if (!idea) {
		return { success: false, error: "Missing --idea or --text" };
	}

	onProgress({
		stage: "starting",
		percent: 0,
		message: "Starting idea-to-video pipeline...",
	});

	try {
		const { Idea2VideoPipeline } = await import(
			"../../vimax/pipelines/idea2video.js"
		);
		const sessionId = `cli-${Date.now()}`;
		const outputDir = resolveOutputDir(options.outputDir, sessionId);
		const startTime = Date.now();

		// Load config from YAML file if --config is specified
		const configOverrides: Record<string, unknown> = {};
		if (options.config) {
			try {
				const configContent = fs.readFileSync(options.config, "utf-8");
				// Simple YAML-like parsing for key: value pairs
				for (const line of configContent.split("\n")) {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith("#")) continue;
					const colonIdx = trimmed.indexOf(":");
					if (colonIdx > 0) {
						const key = trimmed.slice(0, colonIdx).trim();
						const val = trimmed.slice(colonIdx + 1).trim();
						configOverrides[key] =
							val === "true" ? true : val === "false" ? false : val;
					}
				}
			} catch {
				return {
					success: false,
					error: `Cannot read config: ${options.config}`,
				};
			}
		}

		// --no-references separates reference use from portrait generation
		const useReferences = !(options.noReferences ?? false);

		const pipeline = new Idea2VideoPipeline({
			output_dir: outputDir,
			generate_portraits: !(options.noPortraits ?? false),
			use_character_references: useReferences,
			video_model: options.videoModel,
			image_model: options.imageModel,
			llm_model: options.llmModel,
			target_duration: options.duration
				? parseInt(options.duration, 10)
				: undefined,
			...configOverrides,
		});

		const result = await pipeline.run(idea);

		return {
			success: result.success,
			outputPath: result.output?.final_video?.video_path,
			cost: result.total_cost,
			duration: (Date.now() - startTime) / 1000,
			data: {
				idea: result.idea,
				characters: result.characters.length,
				errors: result.errors,
			},
		};
	} catch (err) {
		return {
			success: false,
			error: `Idea2Video failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/** vimax:script2video — Pipeline from script JSON to video. */
export async function handleVimaxScript2Video(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const scriptPath = options.script || options.input;
	if (!scriptPath) {
		return { success: false, error: "Missing --script or --input (JSON path)" };
	}

	onProgress({
		stage: "starting",
		percent: 0,
		message: "Starting script-to-video pipeline...",
	});

	try {
		const { Script2VideoPipeline } = await import(
			"../../vimax/pipelines/script2video.js"
		);
		const sessionId = `cli-${Date.now()}`;
		const outputDir = resolveOutputDir(options.outputDir, sessionId);
		const startTime = Date.now();

		let scriptData: string;
		try {
			scriptData = fs.readFileSync(scriptPath, "utf-8");
		} catch {
			return { success: false, error: `Cannot read script: ${scriptPath}` };
		}

		// Load portrait registry if --portraits is specified
		let portraitRegistry:
			| import("../../vimax/types/character.js").CharacterPortraitRegistry
			| undefined;
		if (options.portraits) {
			try {
				const { CharacterPortraitRegistry } = await import(
					"../../vimax/types/character.js"
				);
				const regContent = fs.readFileSync(options.portraits, "utf-8");
				portraitRegistry = CharacterPortraitRegistry.fromJSON(
					JSON.parse(regContent)
				);
			} catch {
				return {
					success: false,
					error: `Cannot read portrait registry: ${options.portraits}`,
				};
			}
		}

		const pipeline = new Script2VideoPipeline({
			output_dir: outputDir,
			video_model: options.videoModel,
			image_model: options.imageModel,
			use_character_references: !(options.noReferences ?? false),
		});

		const scriptObj = JSON.parse(scriptData);
		if (portraitRegistry) {
			scriptObj._portrait_registry = portraitRegistry;
		}

		const result = await pipeline.run(scriptObj);

		return {
			success: result.success,
			outputPath: result.output?.final_video?.video_path,
			cost: result.total_cost,
			duration: (Date.now() - startTime) / 1000,
			data: { errors: result.errors },
		};
	} catch (err) {
		return {
			success: false,
			error: `Script2Video failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/** Bundled example novel for testing when no --novel is provided. */
const EXAMPLE_NOVEL_PATH = path.resolve(
	__dirname,
	"..",
	"..",
	"vimax",
	"examples",
	"drama-example.md"
);

/** vimax:novel2movie — Pipeline from novel text to movie. */
export async function handleVimaxNovel2Movie(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	let novelPath = options.novel || options.input;
	if (!novelPath) {
		// Fall back to bundled example
		if (fs.existsSync(EXAMPLE_NOVEL_PATH)) {
			novelPath = EXAMPLE_NOVEL_PATH;
			onProgress({
				stage: "starting",
				percent: 0,
				message: "No --novel provided, using bundled example: drama-example.md",
			});
		} else {
			return {
				success: false,
				error: "Missing --novel or --input (text file path)",
			};
		}
	}

	onProgress({
		stage: "starting",
		percent: 0,
		message: "Starting novel-to-movie pipeline...",
	});

	try {
		const { Novel2MoviePipeline } = await import(
			"../../vimax/pipelines/novel2movie.js"
		);
		const startTime = Date.now();

		let novelText: string;
		try {
			novelText = fs.readFileSync(novelPath, "utf-8");
		} catch {
			return { success: false, error: `Cannot read novel: ${novelPath}` };
		}

		// Auto-detect title from file name when --title is not provided
		const title =
			options.title || path.basename(novelPath, path.extname(novelPath));

		// Default output to ~/Documents/QCut/Exports/novel2movie/
		const outputDir = options.outputDirExplicit
			? resolveOutputDir(options.outputDir, `cli-${Date.now()}`)
			: path.join(os.homedir(), "Documents", "QCut", "Exports", "novel2movie");

		const pipelineConfig: Partial<
			import("../../vimax/pipelines/novel2movie.js").Novel2MovieConfig
		> = {
			output_dir: outputDir,
			generate_portraits: !(options.noPortraits ?? false),
			use_character_references: true,
			scripts_only: options.scriptsOnly ?? false,
			storyboard_only: options.storyboardOnly ?? false,
			...(options.maxImages != null ? { max_images: options.maxImages } : {}),
		};
		if (options.videoModel) pipelineConfig.video_model = options.videoModel;
		if (options.imageModel) pipelineConfig.image_model = options.imageModel;
		if (options.llmModel) pipelineConfig.llm_model = options.llmModel;

		const pipeline = new Novel2MoviePipeline(pipelineConfig);

		const result = await pipeline.run(
			novelText,
			title,
			path.resolve(novelPath)
		);

		return {
			success: result.success,
			outputPath: result.output?.final_video?.video_path,
			cost: result.total_cost,
			duration: (Date.now() - startTime) / 1000,
			data: {
				novelTitle: result.novel_title,
				scripts: result.scripts.length,
				characters: result.characters.length,
				errors: result.errors,
			},
		};
	} catch (err) {
		return {
			success: false,
			error: `Novel2Movie failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
