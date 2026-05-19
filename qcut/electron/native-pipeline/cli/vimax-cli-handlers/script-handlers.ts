/**
 * ViMax Script Handlers
 *
 * generate-script, generate-storyboard
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CLIRunOptions, CLIResult } from "../cli-runner/types.js";
import { resolveOutputDir } from "../../output/output-utils.js";
import {
	resolveProjectPaths,
	safeProjectSlug,
} from "../../output/project-paths.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

type StoryboardInputKind = "scenes" | "script";

type StoryboardInput = {
	path: string;
	kind: StoryboardInputKind;
};

function resolveStoryboardInput({
	options,
}: {
	options: CLIRunOptions;
}):
	| { success: true; input: StoryboardInput }
	| { success: false; error: string } {
	const explicitScenesPath = options.scenes;
	if (explicitScenesPath) {
		return {
			success: true,
			input: { path: explicitScenesPath, kind: "scenes" },
		};
	}

	const explicitScriptPath = options.script || options.input;
	if (explicitScriptPath) {
		return {
			success: true,
			input: {
				path: explicitScriptPath,
				kind: options.script
					? "script"
					: inferStoryboardInputKind(explicitScriptPath),
			},
		};
	}

	if (options.projectId) {
		const paths = resolveProjectPaths(safeProjectSlug(options.projectId));
		return {
			success: true,
			input: { path: path.join(paths.root, "scenes.json"), kind: "scenes" },
		};
	}

	return {
		success: false,
		error:
			"Missing --scenes, --script, --input, or --project (flow scenes JSON is preferred)",
	};
}

function inferStoryboardInputKind(filePath: string): StoryboardInputKind {
	return path.basename(filePath).toLowerCase().includes("scene")
		? "scenes"
		: "script";
}

/** vimax:generate-script — Generate screenplay from idea using Screenwriter agent. */
export async function handleVimaxGenerateScript(
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
		message: "Generating screenplay...",
	});

	try {
		const { Screenwriter } = await import("../../vimax/agents/screenwriter.js");

		const startTime = Date.now();
		const writer = new Screenwriter({
			model: options.llmModel,
			target_duration: options.duration
				? parseInt(options.duration, 10)
				: undefined,
		});

		const result = await writer.process(idea);

		onProgress({ stage: "complete", percent: 100, message: "Done" });

		if (!result.success) {
			return {
				success: false,
				error: `Script generation failed: ${result.error}`,
			};
		}

		const outputDir = resolveOutputDir(options.outputDir, `cli-${Date.now()}`);
		const outputPath = path.join(outputDir, "script.json");
		fs.writeFileSync(outputPath, JSON.stringify(result.result, null, 2));

		return {
			success: true,
			outputPath,
			duration: (Date.now() - startTime) / 1000,
			data: {
				title: result.result?.title,
				scenes: result.result?.scenes.length ?? 0,
				total_duration: result.result?.total_duration ?? 0,
			},
		};
	} catch (err) {
		return {
			success: false,
			error: `Generate script failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/** vimax:generate-storyboard — Generate storyboard images from script using StoryboardArtist. */
export async function handleVimaxGenerateStoryboard(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const resolvedInput = resolveStoryboardInput({ options });
	if (!resolvedInput.success) {
		return { success: false, error: resolvedInput.error };
	}
	const storyboardInput = resolvedInput.input;

	onProgress({
		stage: "starting",
		percent: 0,
		message: `Generating storyboard from ${storyboardInput.kind}...`,
	});

	try {
		const { StoryboardArtist } = await import(
			"../../vimax/agents/storyboard-artist.js"
		);

		let scriptData: string;
		try {
			scriptData = fs.readFileSync(storyboardInput.path, "utf-8");
		} catch {
			return {
				success: false,
				error: `Cannot read ${storyboardInput.kind}: ${storyboardInput.path}`,
			};
		}

		const script = JSON.parse(scriptData);
		const startTime = Date.now();
		const sessionId = `cli-${Date.now()}`;
		const projectPaths = options.projectId
			? resolveProjectPaths(safeProjectSlug(options.projectId))
			: undefined;
		const outputDir =
			projectPaths && !options.outputDirExplicit
				? projectPaths.storyboardDir
				: resolveOutputDir(options.outputDir, sessionId);

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

		const artist = new StoryboardArtist({
			image_model: options.imageModel,
			output_dir: outputDir,
			...(options.style ? { style_prefix: options.style } : {}),
			...(portraitRegistry ? { use_character_references: true } : {}),
			...(options.referenceModel
				? { reference_model: options.referenceModel }
				: {}),
			...(options.referenceStrength != null
				? { reference_strength: options.referenceStrength }
				: {}),
		});

		// If portrait registry is loaded, inject it into the script context
		if (portraitRegistry) {
			script._portrait_registry = portraitRegistry;
		}

		const result = await artist.process(script);

		onProgress({ stage: "complete", percent: 100, message: "Done" });

		if (!result.success) {
			return {
				success: false,
				error: `Storyboard generation failed: ${result.error}`,
			};
		}

		return {
			success: true,
			outputPath: outputDir,
			cost: result.result?.total_cost ?? 0,
			duration: (Date.now() - startTime) / 1000,
			data: {
				title: result.result?.title,
				images: result.result?.images.length ?? 0,
				total_cost: result.result?.total_cost ?? 0,
				input: storyboardInput.path,
				input_kind: storyboardInput.kind,
			},
		};
	} catch (err) {
		return {
			success: false,
			error: `Generate storyboard failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
