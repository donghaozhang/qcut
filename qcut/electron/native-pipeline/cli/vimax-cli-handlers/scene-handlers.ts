/**
 * ViMax Scene Handlers
 *
 * extract-scenes
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CLIRunOptions, CLIResult } from "../cli-runner/types.js";
import { resolveOutputDir } from "../../output/output-utils.js";
import {
	ensureProjectDirs,
	resolveProjectPaths,
	safeProjectSlug,
	writeProjectMetadata,
} from "../../output/project-paths.js";
import {
	describeArtifact,
	printStageSummary,
	startStep,
	type GeneratedArtifact,
} from "../../output/stage-reporter.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

type SceneSource = {
	inputText: string;
	sourceFilePath?: string;
	title?: string;
};

function resolveSceneSource({
	options,
}: {
	options: CLIRunOptions;
}): { success: true; source: SceneSource } | { success: false; error: string } {
	const source = options.novel || options.input || options.text;
	if (!source) {
		return {
			success: false,
			error: "Missing --novel, --input, or --text (novel file or raw text)",
		};
	}

	if (fs.existsSync(source)) {
		const sourceFilePath = path.resolve(source);
		try {
			return {
				success: true,
				source: {
					inputText: fs.readFileSync(sourceFilePath, "utf-8"),
					sourceFilePath,
					title: path.basename(sourceFilePath, path.extname(sourceFilePath)),
				},
			};
		} catch (err) {
			return {
				success: false,
				error: `Cannot read source: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}

	if (options.novel) {
		return { success: false, error: `Cannot read source: ${source}` };
	}

	return {
		success: true,
		source: {
			inputText: source,
		},
	};
}

/** vimax:extract-scenes — Extract scene-level Script JSON from text. */
export async function handleVimaxExtractScenes(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const resolvedSource = resolveSceneSource({ options });
	if (!resolvedSource.success) {
		return { success: false, error: resolvedSource.error };
	}

	const { inputText, sourceFilePath } = resolvedSource.source;
	const title = options.title ?? resolvedSource.source.title ?? "scenes";
	const startTime = Date.now();

	onProgress({
		stage: "starting",
		percent: 0,
		message: "Extracting scenes...",
	});

	try {
		const { NovelSegmenter } = await import(
			"../../vimax/agents/novel-segmenter.js"
		);
		const segmenter = new NovelSegmenter({
			model: options.llmModel,
		});

		const extractStep = startStep("scene extraction LLM call");
		const result = await segmenter.process(inputText);
		extractStep.end(
			result.success && result.result
				? `${result.result.scenes.length} scenes`
				: "failed"
		);

		if (!result.success || !result.result) {
			return {
				success: false,
				error: `Scene extraction failed: ${result.error ?? "unknown error"}`,
			};
		}

		const script = {
			...result.result,
			title: result.result.title || title,
			scenes:
				options.maxScenes != null
					? result.result.scenes.slice(0, options.maxScenes)
					: result.result.scenes,
		};
		const totalDuration = script.scenes.reduce(
			(sum, scene) =>
				sum +
				scene.shots.reduce(
					(sceneSum, shot) => sceneSum + shot.duration_seconds,
					0
				),
			0
		);
		const output = {
			...script,
			total_duration: totalDuration,
		};

		const slug = options.projectId
			? safeProjectSlug(options.projectId)
			: undefined;
		let outputPath: string;
		const artifacts: GeneratedArtifact[] = [];

		if (slug) {
			const paths = resolveProjectPaths(slug);
			ensureProjectDirs(paths);
			if (sourceFilePath) {
				try {
					fs.copyFileSync(sourceFilePath, paths.novelPath);
					artifacts.push(describeArtifact(paths.novelPath, "novel copy"));
				} catch {
					// Source metadata below is enough if the copy fails.
				}
			}
			writeProjectMetadata(paths, {
				slug,
				title,
				...(sourceFilePath ? { novel_path: sourceFilePath } : {}),
			});
			artifacts.push(describeArtifact(paths.metadataPath, "project metadata"));
			outputPath = path.join(paths.root, "scenes.json");
		} else {
			const outputDir = resolveOutputDir(
				options.outputDir,
				`cli-${Date.now()}`
			);
			outputPath = path.join(outputDir, "scenes.json");
		}

		fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
		artifacts.push(describeArtifact(outputPath, "scenes"));

		onProgress({ stage: "complete", percent: 100, message: "Done" });

		const totalDurationSeconds = (Date.now() - startTime) / 1000;
		const shotCount = output.scenes.reduce(
			(sum, scene) => sum + scene.shots.length,
			0
		);
		printStageSummary({
			title: "Extract scenes",
			totalSeconds: totalDurationSeconds,
			totalCostUsd: (result.metadata.cost as number) ?? 0,
			artifacts,
			extraLines: [`Scenes: ${output.scenes.length}`, `Shots:  ${shotCount}`],
		});

		return {
			success: true,
			outputPath,
			cost: (result.metadata.cost as number) ?? 0,
			duration: totalDurationSeconds,
			data: {
				title: output.title,
				scenes: output.scenes.length,
				shots: shotCount,
				total_duration: output.total_duration,
				outputPath,
				...(slug ? { project: slug } : {}),
			},
		};
	} catch (err) {
		return {
			success: false,
			error: `Scene extraction failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
