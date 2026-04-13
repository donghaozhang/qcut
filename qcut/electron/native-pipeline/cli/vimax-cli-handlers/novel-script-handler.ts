/**
 * ViMax Novel-to-Script handler.
 *
 * Implements the third standalone stage in the decomposed Novel-to-Movie
 * workflow: turn a novel markdown file into a sequence of `Script` JSON
 * chunks via `NovelSegmenter`, landing them under a project directory so
 * downstream stages (portraits, storyboard, video) can consume them
 * independently.
 *
 * The chunking logic mirrors the monolithic `novel2movie` pipeline — the
 * goal is that `flow novel2script` produces exactly the same
 * `scripts/chunk_NNN.json` layout `flow novel2movie --scripts-only`
 * would have produced, minus the surrounding stages.
 *
 * @module electron/native-pipeline/cli/vimax-cli-handlers/novel-script-handler
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CLIRunOptions, CLIResult } from "../cli-runner/types.js";
import { resolveOutputDir } from "../../output/output-utils.js";
import {
	resolveProjectPaths,
	ensureProjectDirs,
	writeProjectMetadata,
	markStageCompleted,
	safeProjectSlug,
} from "../../output/project-paths.js";
import {
	estimateNovel2Script,
	printEstimate,
	printStageSummary,
	startStep,
	describeArtifact,
	type GeneratedArtifact,
} from "../../output/stage-reporter.js";
import { extractNovelStyleHeader } from "./pipeline-handlers.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

const DEFAULT_CHUNK_SIZE = 2_000;
const DEFAULT_OVERLAP = 200;

/** vimax:novel2script — Segment a novel into shot-level Script chunks. */
export async function handleVimaxNovel2Script(
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const novelPath = options.novel || options.input;
	if (!novelPath) {
		return {
			success: false,
			error: "Missing --novel or --input (novel file path)",
		};
	}

	if (!fs.existsSync(novelPath)) {
		return { success: false, error: `Cannot read novel: ${novelPath}` };
	}

	let novelText: string;
	try {
		novelText = fs.readFileSync(novelPath, "utf-8");
	} catch (err) {
		return {
			success: false,
			error: `Cannot read novel: ${err instanceof Error ? err.message : String(err)}`,
		};
	}

	const title =
		options.title || path.basename(novelPath, path.extname(novelPath));

	onProgress({
		stage: "starting",
		percent: 0,
		message: "Segmenting novel into script chunks...",
	});

	const startTime = Date.now();
	const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
	const overlap = options.overlap ?? DEFAULT_OVERLAP;

	// Print pre-flight estimate before kicking off any LLM calls.
	printEstimate(estimateNovel2Script(novelText.length, chunkSize, overlap));

	try {
		const { NovelSegmenter } = await import(
			"../../vimax/agents/novel-segmenter.js"
		);
		const { splitNovelText } = await import(
			"../../vimax/pipelines/novel2movie.js"
		);

		// Resolve output layout: project dir when --project is given,
		// timestamped fallback otherwise (same convention as other handlers).
		const slug = options.projectId
			? safeProjectSlug(options.projectId)
			: undefined;

		let scriptsDir: string;
		let outputPath: string;
		if (slug) {
			const paths = resolveProjectPaths(slug);
			ensureProjectDirs(paths);
			fs.mkdirSync(paths.scriptsDir, { recursive: true });

			// Persist a copy of the novel + update metadata
			try {
				fs.copyFileSync(novelPath, paths.novelPath);
			} catch {
				// Non-fatal; the source path is recorded in metadata regardless.
			}
			// Only patch `style` when the novel actually declares one —
			// otherwise `{ style: undefined }` would silently erase a
			// previously-set style in project.json (e.g. from Stage 1).
			const novelStyleHeader = extractNovelStyleHeader(novelText);
			writeProjectMetadata(paths, {
				slug,
				novel_path: path.resolve(novelPath),
				title,
				...(novelStyleHeader ? { style: novelStyleHeader } : {}),
			});

			scriptsDir = paths.scriptsDir;
			outputPath = paths.scriptsDir;
		} else {
			const outputDir = resolveOutputDir(
				options.outputDir,
				`cli-${Date.now()}`
			);
			scriptsDir = path.join(outputDir, "scripts");
			fs.mkdirSync(scriptsDir, { recursive: true });
			outputPath = scriptsDir;
		}

		const splitStep = startStep("split novel into chunks");
		const chunks = splitNovelText(novelText, {
			chunk_size: chunkSize,
			overlap,
		});
		splitStep.end(`${chunks.length} chunks`);
		if (chunks.length === 0) {
			return { success: false, error: "Novel produced no chunks" };
		}

		const segmenter = new NovelSegmenter({
			model: options.llmModel,
		});

		let totalCost = 0;
		let totalScenes = 0;
		let totalShots = 0;
		const errors: string[] = [];
		let emitted = 0;
		const chunkArtifacts: GeneratedArtifact[] = [];

		for (let i = 0; i < chunks.length; i++) {
			const progressPct = Math.round(((i + 0.5) / chunks.length) * 90);
			onProgress({
				stage: "segmenting",
				percent: progressPct,
				message: `Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`,
			});

			// Enforce --max-scenes cap across chunks (same semantics as
			// novel2movie) — if the cap is reached we stop segmenting.
			if (options.maxScenes != null && totalScenes >= options.maxScenes) {
				break;
			}

			const chunkStep = startStep(
				`chunk ${i + 1}/${chunks.length} segmentation`
			);
			const segResult = await segmenter.process(chunks[i]);
			if (!segResult.success || !segResult.result) {
				chunkStep.end("failed");
				errors.push(
					`Segmentation failed for chunk ${i + 1}: ${segResult.error ?? "unknown error"}`
				);
				continue;
			}

			let script = segResult.result;
			if (options.maxScenes != null) {
				const remaining = options.maxScenes - totalScenes;
				if (remaining <= 0) {
					chunkStep.end("skipped (cap reached)");
					break;
				}
				if (script.scenes.length > remaining) {
					script = { ...script, scenes: script.scenes.slice(0, remaining) };
				}
			}

			const scenes = script.scenes.length;
			const shots = script.scenes.reduce((s, sc) => s + sc.shots.length, 0);
			totalScenes += scenes;
			totalShots += shots;
			totalCost += (segResult.metadata.cost as number) ?? 0;

			const chunkPath = path.join(
				scriptsDir,
				`chunk_${String(i + 1).padStart(3, "0")}.json`
			);
			fs.writeFileSync(chunkPath, JSON.stringify(script, null, 2));
			chunkArtifacts.push(
				describeArtifact(
					chunkPath,
					`chunk ${i + 1} (${scenes} scenes, ${shots} shots)`
				)
			);
			chunkStep.end(`${scenes} scenes, ${shots} shots`);
			emitted++;
		}

		onProgress({ stage: "complete", percent: 100, message: "Done" });

		if (slug) {
			markStageCompleted(resolveProjectPaths(slug), "scripts");
		}

		const totalDurationSeconds = (Date.now() - startTime) / 1000;

		// Collect artifacts for the summary banner (project metadata + novel
		// copy show up when we're in project mode).
		const summaryArtifacts: GeneratedArtifact[] = [];
		if (slug) {
			const paths = resolveProjectPaths(slug);
			summaryArtifacts.push(
				describeArtifact(paths.metadataPath, "project metadata")
			);
			if (fs.existsSync(paths.novelPath)) {
				summaryArtifacts.push(describeArtifact(paths.novelPath, "novel copy"));
			}
		}
		summaryArtifacts.push(...chunkArtifacts);

		printStageSummary({
			title: "Stage 3 — Segment novel into scripts",
			totalSeconds: totalDurationSeconds,
			totalCostUsd: totalCost,
			artifacts: summaryArtifacts,
			extraLines: [
				`Chunks emitted:  ${emitted}/${chunks.length}`,
				`Scenes total:    ${totalScenes}`,
				`Shots total:     ${totalShots}`,
				...(errors.length > 0 ? [`Errors:          ${errors.length}`] : []),
			],
		});

		return {
			success: emitted > 0,
			outputPath,
			cost: totalCost,
			duration: totalDurationSeconds,
			data: {
				novelTitle: title,
				chunks: emitted,
				scenes: totalScenes,
				shots: totalShots,
				errors,
				artifacts: summaryArtifacts.map((a) => a.path),
			},
			...(emitted === 0
				? {
						error: `No chunks segmented successfully: ${errors.join("; ") || "unknown"}`,
					}
				: {}),
		};
	} catch (err) {
		return {
			success: false,
			error: `Novel2Script failed: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
