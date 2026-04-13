/**
 * ViMax Character Handlers
 *
 * extract-characters, generate-portraits
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CLIRunOptions, CLIResult } from "../cli-runner/types.js";
import type { CharacterInNovel } from "../../vimax/types/character.js";
import { resolveOutputDir } from "../../output/output-utils.js";
import {
	resolveProjectPaths,
	ensureProjectDirs,
	writeProjectMetadata,
	markStageCompleted,
	safeProjectSlug,
} from "../../output/project-paths.js";
import { extractNovelStyleHeader } from "./pipeline-handlers.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

/** vimax:extract-characters — Extract characters from text using CharacterExtractor agent. */
export async function handleVimaxExtractCharacters(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	// Accept --novel (preferred) / --input / --text. `--novel` is the
	// canonical staged-workflow flag; the others stay supported for
	// backward compatibility.
	const source = options.novel || options.input || options.text;
	if (!source) {
		return {
			success: false,
			error: "Missing --novel, --input, or --text (novel file or raw text)",
		};
	}

	onProgress({
		stage: "starting",
		percent: 0,
		message: "Extracting characters...",
	});

	try {
		const { CharacterExtractor } = await import(
			"../../vimax/agents/character-extractor.js"
		);

		let inputText = source;
		let sourceFilePath: string | undefined;
		if (fs.existsSync(source)) {
			sourceFilePath = path.resolve(source);
			inputText = fs.readFileSync(sourceFilePath, "utf-8");
		}

		// Style header lets later stages (portraits/storyboard) route the
		// correct visual aesthetic. Persist it into project.json.
		const style = extractNovelStyleHeader(inputText);

		const startTime = Date.now();
		const extractor = new CharacterExtractor({
			model: options.llmModel,
			...(style ? { portrait_style: style } : {}),
		});

		const result = await extractor.process(inputText);

		onProgress({ stage: "complete", percent: 100, message: "Done" });

		if (!result.success) {
			return {
				success: false,
				error: `Character extraction failed: ${result.error}`,
			};
		}

		// Resolve output: project dir when --project is given, fallback to
		// timestamped output-dir otherwise.
		const slug = options.projectId
			? safeProjectSlug(options.projectId)
			: undefined;

		let outputPath: string;
		if (slug) {
			const paths = resolveProjectPaths(slug);
			ensureProjectDirs(paths);
			if (sourceFilePath) {
				try {
					fs.copyFileSync(sourceFilePath, paths.novelPath);
				} catch {
					// Non-fatal; metadata still records the absolute path.
				}
			}
			writeProjectMetadata(paths, {
				slug,
				...(sourceFilePath ? { novel_path: sourceFilePath } : {}),
				title:
					options.title ??
					(sourceFilePath
						? path.basename(sourceFilePath, path.extname(sourceFilePath))
						: undefined),
				...(style ? { style } : {}),
			});
			outputPath = paths.charactersPath;
			fs.writeFileSync(outputPath, JSON.stringify(result.result, null, 2));
			markStageCompleted(paths, "characters");
		} else {
			const outputDir = resolveOutputDir(
				options.outputDir,
				`cli-${Date.now()}`
			);
			outputPath = path.join(outputDir, "characters.json");
			fs.writeFileSync(outputPath, JSON.stringify(result.result, null, 2));
		}

		return {
			success: true,
			outputPath,
			duration: (Date.now() - startTime) / 1000,
			data: {
				characters: result.result,
				count: result.result?.length ?? 0,
				...(style ? { style } : {}),
				...(slug ? { project: slug } : {}),
			},
		};
	} catch (err) {
		return {
			success: false,
			error: `Extract characters failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/** vimax:generate-portraits — Generate character portraits using CharacterPortraitsGenerator. */
export async function handleVimaxGeneratePortraits(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	// Source precedence:
	//   1. --project <slug>  → read <proj>/characters.json, write to <proj>/portraits/
	//   2. -p / --portraits  → explicit characters JSON path
	//   3. --text / --input  → raw text (re-extracts characters)
	const slug = options.projectId
		? safeProjectSlug(options.projectId)
		: undefined;
	const projectPaths = slug ? resolveProjectPaths(slug) : undefined;
	const text =
		options.portraits ??
		options.text ??
		options.input ??
		(projectPaths ? projectPaths.charactersPath : undefined);
	if (!text) {
		return {
			success: false,
			error:
				"Missing --project, --portraits, --text, or --input (project slug, character JSON path, or raw text)",
		};
	}

	onProgress({
		stage: "starting",
		percent: 0,
		message: "Generating character portraits...",
	});

	try {
		const { CharacterExtractor } = await import(
			"../../vimax/agents/character-extractor.js"
		);
		const { CharacterPortraitsGenerator } = await import(
			"../../vimax/agents/character-portraits.js"
		);

		const startTime = Date.now();
		const sessionId = `cli-${Date.now()}`;
		const outputDir = projectPaths?.root
			? projectPaths.root
			: resolveOutputDir(options.outputDir, sessionId);
		if (projectPaths) {
			ensureProjectDirs(projectPaths);
			fs.mkdirSync(projectPaths.portraitsDir, { recursive: true });
		}

		let characters: CharacterInNovel[];

		// Check if input is a JSON file with pre-extracted characters
		if (fs.existsSync(text) && text.endsWith(".json")) {
			const content = fs.readFileSync(text, "utf-8");
			const parsed = JSON.parse(content);
			const parsedCharacters = Array.isArray(parsed)
				? parsed
				: parsed.characters;
			if (!Array.isArray(parsedCharacters)) {
				return {
					success: false,
					error:
						"Invalid character JSON: expected an array or { characters: [...] }",
				};
			}
			characters = parsedCharacters;
		} else {
			// Extract characters from text first
			let inputText = text;
			if (fs.existsSync(text)) {
				inputText = fs.readFileSync(text, "utf-8");
			}

			onProgress({
				stage: "extracting",
				percent: 10,
				message: "Extracting characters from text...",
			});
			const extractor = new CharacterExtractor({ model: options.llmModel });
			const extractResult = await extractor.process(inputText);

			if (!extractResult.success || !extractResult.result) {
				return {
					success: false,
					error: `Character extraction failed: ${extractResult.error}`,
				};
			}
			characters = extractResult.result;
		}

		// Apply --max-characters limit (guard against NaN from bad CLI input)
		const rawMaxChars = options.maxCharacters ?? 5;
		const maxChars = Number.isNaN(rawMaxChars) ? 5 : rawMaxChars;
		if (characters.length > maxChars) {
			characters = characters.slice(0, maxChars);
		}

		// Parse --views (comma-separated: front,side,back,three_quarter)
		const views = options.views
			? options.views.split(",").map((v: string) => v.trim())
			: undefined;

		// Honour --style, or reuse the style persisted in project.json
		// when running in staged-project mode.
		let resolvedStyle: string | undefined = options.style;
		if (!resolvedStyle && projectPaths) {
			try {
				const { readProjectMetadata } = await import(
					"../../output/project-paths.js"
				);
				const meta = readProjectMetadata(projectPaths);
				if (meta?.style) resolvedStyle = meta.style;
			} catch {
				// Non-fatal: fall back to generator default.
			}
		}

		onProgress({
			stage: "generating",
			percent: 30,
			message: `Generating portraits for ${characters.length} characters...`,
		});

		const portraitsDir = projectPaths
			? projectPaths.portraitsDir
			: path.join(outputDir, "portraits");

		const generator = new CharacterPortraitsGenerator({
			image_model: options.imageModel,
			llm_model: options.llmModel,
			output_dir: portraitsDir,
			...(views ? { views } : {}),
			...(resolvedStyle ? { style: resolvedStyle } : {}),
		});

		const batchResult = await generator.generateBatch(characters);

		onProgress({ stage: "complete", percent: 100, message: "Done" });

		if (!batchResult.success) {
			return {
				success: false,
				error: `Portrait generation failed: ${batchResult.error}`,
			};
		}

		const portraitCount = Object.keys(batchResult.result ?? {}).length;

		// Save portrait registry JSON (default: true, disable with --save-registry=false)
		const shouldSaveRegistry = options.saveRegistry !== false;
		let registryPath: string | undefined;
		if (shouldSaveRegistry && batchResult.result) {
			try {
				const { CharacterPortraitRegistry } = await import(
					"../../vimax/types/character.js"
				);
				const registry = new CharacterPortraitRegistry(
					options.projectId || "cli-project"
				);
				for (const portrait of Object.values(
					batchResult.result as Record<
						string,
						import("../../vimax/types/character.js").CharacterPortrait
					>
				)) {
					registry.addPortrait(portrait);
				}
				registryPath = projectPaths
					? projectPaths.portraitRegistryPath
					: path.join(outputDir, "portraits", "registry.json");
				fs.writeFileSync(
					registryPath,
					JSON.stringify(registry.toJSON(), null, 2)
				);
			} catch {
				// Non-fatal: registry save is optional
			}
		}

		if (projectPaths) {
			markStageCompleted(projectPaths, "portraits");
		}

		return {
			success: true,
			outputPath: portraitsDir,
			cost: (batchResult.metadata?.cost as number) ?? 0,
			duration: (Date.now() - startTime) / 1000,
			data: {
				characters: portraitCount,
				portraits_generated: portraitCount,
				registry_path: registryPath,
				...(slug ? { project: slug } : {}),
			},
		};
	} catch (err) {
		return {
			success: false,
			error: `Generate portraits failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
