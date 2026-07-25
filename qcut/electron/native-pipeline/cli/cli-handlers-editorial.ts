import { promises as fs } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { PipelineExecutor } from "../execution/executor.js";
import { extractWordTimestamps } from "../output/srt-generator.js";
import { verifyEdit } from "../editorial/cut-verification.js";
import { createEditPlan, readMediaIndex } from "../editorial/edit-plan.js";
import { createMediaIndex } from "../editorial/media-index.js";
import { probeDuration } from "../editorial/media-process.js";
import {
	buildScriptBeats,
	detectScriptLanguage,
	readNarrationWords,
	readScriptInput,
} from "../editorial/narration.js";
import { analyzeSourceSemantics } from "../editorial/semantic-analysis.js";
import { renderTimelineView } from "../editorial/timeline-view.js";
import type { NarrationWord } from "../editorial/types.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";
import { handleTranscribe } from "./cli-handlers-media.js";

const DEFAULT_SEMANTIC_MODEL = "openrouter_gemini_3_5_flash_video";

function parsePositiveNumber({
	value,
	name,
	fallback,
}: {
	value: number | string | undefined;
	name: string;
	fallback?: number;
}): number {
	if (value === undefined && fallback !== undefined) return fallback;
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${name} must be greater than zero`);
	}
	return parsed;
}

function parseNonNegativeNumber({
	value,
	name,
	fallback,
}: {
	value: number | string | undefined;
	name: string;
	fallback: number;
}): number {
	if (value === undefined) return fallback;
	const parsed = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		throw new Error(`${name} must be zero or greater`);
	}
	return parsed;
}

function normalizeTranscriptionWords({
	value,
}: {
	value: unknown;
}): NarrationWord[] {
	const words = extractWordTimestamps(value) ?? [];
	return words.map((word) => ({
		text: word.word,
		start: word.start,
		end: word.end,
	}));
}

function findIndexedSource({
	index,
	sourceRef,
}: {
	index: Awaited<ReturnType<typeof readMediaIndex>>;
	sourceRef: string;
}) {
	const normalized = resolve(sourceRef);
	return index.sources.find(
		(source) =>
			source.id === sourceRef ||
			source.filename === sourceRef ||
			source.source === normalized ||
			basename(source.source) === basename(sourceRef)
	);
}

export async function handleAnalyzeIndex(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	executor: PipelineExecutor,
	signal: AbortSignal
): Promise<CLIResult> {
	const directory = options.dir || options.directory;
	if (!directory) return { success: false, error: "Missing --dir" };
	try {
		const sampleFps = parsePositiveNumber({
			value: options.fps,
			name: "--fps",
			fallback: 2,
		});
		const sceneThreshold = options.threshold ?? 0.32;
		if (sceneThreshold <= 0 || sceneThreshold >= 1) {
			return {
				success: false,
				error: "--scene-threshold/--threshold must be between zero and one",
			};
		}
		const candidateDuration = parsePositiveNumber({
			value: options.candidateDuration,
			name: "--candidate-duration",
			fallback: 6,
		});
		const outputDir = options.outputDirExplicit
			? resolve(options.outputDir)
			: resolve(directory, "analysis");
		const semanticModel = options.model || DEFAULT_SEMANTIC_MODEL;
		const result = await createMediaIndex({
			directory,
			outputDir,
			sampleFps,
			sceneThreshold,
			candidateDuration,
			recursive: !options.noRecursive,
			semanticModel: options.noAi ? undefined : semanticModel,
			signal,
			onProgress: (progress) =>
				onProgress({
					stage: progress.stage,
					percent: progress.percent,
					message: progress.message,
					model: options.noAi ? undefined : semanticModel,
				}),
			analyzeSemantics: options.noAi
				? undefined
				: ({
						path,
						probe,
						sceneBoundaries,
						signal: semanticSignal,
						onProgress: report,
					}) =>
						analyzeSourceSemantics({
							path,
							probe,
							sceneBoundaries,
							model: semanticModel,
							executor,
							signal: semanticSignal,
							onProgress: report,
						}),
		});
		return {
			success: true,
			outputPath: result.indexPath,
			data: {
				indexPath: result.indexPath,
				sources: result.index.sources.length,
				candidates: result.index.sources.reduce(
					(sum, source) => sum + source.candidates.length,
					0
				),
				warnings: [
					...result.index.warnings,
					...result.index.sources.flatMap((source) => source.warnings),
				],
			},
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function handleAnalyzeInspect(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	_executor: PipelineExecutor,
	signal: AbortSignal
): Promise<CLIResult> {
	if (!options.mediaIndexPath) {
		return { success: false, error: "Missing --index" };
	}
	if (!options.source) return { success: false, error: "Missing --source" };
	if (options.startTime === undefined || options.endTime === undefined) {
		return { success: false, error: "Both --start and --end are required" };
	}
	try {
		const index = await readMediaIndex({ path: options.mediaIndexPath });
		const source = findIndexedSource({ index, sourceRef: options.source });
		if (!source) {
			return {
				success: false,
				error: `Source '${options.source}' is not present in the index`,
			};
		}
		if (
			options.startTime < 0 ||
			options.endTime <= options.startTime ||
			options.endTime > source.probe.duration + 0.01
		) {
			return {
				success: false,
				error: `Inspect range must be within 0-${source.probe.duration.toFixed(3)}s`,
			};
		}
		onProgress({
			stage: "rendering",
			percent: 20,
			message: "Rendering local timeline view",
		});
		const words = options.transcript
			? await readNarrationWords({ path: options.transcript })
			: [];
		const outputDir = options.outputDirExplicit
			? resolve(options.outputDir)
			: resolve(dirname(options.mediaIndexPath), "inspect");
		await fs.mkdir(outputDir, { recursive: true });
		const stem = `${source.id}-${options.startTime.toFixed(3)}-${options.endTime.toFixed(3)}`;
		const view = await renderTimelineView({
			source: source.source,
			start: options.startTime,
			end: options.endTime,
			outputPath: resolve(outputDir, `${stem}.png`),
			sceneBoundaries: source.sceneBoundaries,
			narration: options.narration,
			words,
			signal,
		});
		onProgress({
			stage: "complete",
			percent: 100,
			message: "Timeline view ready",
		});
		return {
			success: true,
			outputPath: view.imagePath,
			outputPaths: [view.imagePath, view.dataPath],
			data: {
				source: source.filename,
				start: options.startTime,
				end: options.endTime,
				imagePath: view.imagePath,
				dataPath: view.dataPath,
			},
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function resolvePlanWords({
	options,
	narration,
	onProgress,
	executor,
	signal,
	outputDir,
}: {
	options: CLIRunOptions;
	narration?: string;
	onProgress: ProgressFn;
	executor: PipelineExecutor;
	signal: AbortSignal;
	outputDir: string;
}): Promise<{ words: NarrationWord[]; warning?: string }> {
	if (options.transcript) {
		return { words: await readNarrationWords({ path: options.transcript }) };
	}
	if (!narration) return { words: [] };
	const transcription = await handleTranscribe(
		{
			...options,
			command: "transcribe",
			input: narration,
			model: undefined,
			outputDir: resolve(outputDir, "transcription"),
			outputDirExplicit: true,
			rawJson: true,
			srt: true,
		},
		onProgress,
		executor,
		signal
	);
	if (!transcription.success) {
		return {
			words: [],
			warning: `Narration transcription failed; using script-weight timing: ${transcription.error}`,
		};
	}
	return { words: normalizeTranscriptionWords({ value: transcription.data }) };
}

async function renderPlanViews({
	plan,
	index,
	outputDir,
	signal,
}: {
	plan: Awaited<ReturnType<typeof createEditPlan>>;
	index: Awaited<ReturnType<typeof readMediaIndex>>;
	outputDir: string;
	signal: AbortSignal;
}): Promise<string[]> {
	const sourceById = new Map(
		index.sources.map((source) => [source.id, source])
	);
	const viewDir = resolve(outputDir, "views");
	await fs.mkdir(viewDir, { recursive: true });
	return Promise.all(
		plan.edl.clips.map(async (clip) => {
			const source = sourceById.get(clip.sourceId);
			if (!source) throw new Error(`Unknown source '${clip.sourceId}'`);
			const view = await renderTimelineView({
				source: source.source,
				start: clip.start,
				end: clip.end,
				outputPath: resolve(viewDir, `${clip.id}.png`),
				sceneBoundaries: source.sceneBoundaries,
				narration: plan.edl.narration,
				narrationStart: clip.timelineStart,
				narrationEnd: clip.timelineEnd,
				words: plan.edl.beats.flatMap((beat) => beat.words),
				signal,
			});
			return view.imagePath;
		})
	);
}

export async function handleEditPlan(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	executor: PipelineExecutor,
	signal: AbortSignal
): Promise<CLIResult> {
	if (!options.mediaIndexPath) {
		return { success: false, error: "Missing --index" };
	}
	if (!options.script) return { success: false, error: "Missing --script" };
	try {
		const requestedDuration = parsePositiveNumber({
			value: options.duration ?? options.targetDuration,
			name: "--duration",
		});
		const transitionDuration = parseNonNegativeNumber({
			value: options.transitionDuration,
			name: "--transition-duration",
			fallback: 0,
		});
		const index = await readMediaIndex({ path: options.mediaIndexPath });
		const script = await readScriptInput({ value: options.script });
		const narration = options.narration
			? resolve(options.narration)
			: undefined;
		const outputDir = options.outputDirExplicit
			? resolve(options.outputDir)
			: resolve(
					dirname(options.mediaIndexPath),
					`plan-${options.language || detectScriptLanguage({ script: script.text })}`
				);
		await fs.mkdir(outputDir, { recursive: true });
		const narrationDuration = narration
			? await probeDuration({ path: narration }).catch(() => undefined)
			: undefined;
		const timing = await resolvePlanWords({
			options,
			narration,
			onProgress,
			executor,
			signal,
			outputDir,
		});
		const language =
			options.language || detectScriptLanguage({ script: script.text });
		const beats = buildScriptBeats({
			script: script.text,
			duration: requestedDuration,
			words: timing.words,
		});
		onProgress({
			stage: "planning",
			percent: 65,
			message: "Aligning narration beats with indexed ranges",
		});
		const plan = await createEditPlan({
			index,
			indexPath: options.mediaIndexPath,
			scriptPath: script.path,
			narration,
			language,
			beats,
			duration: requestedDuration,
			transitionDuration,
			outputDir,
			narrationDuration,
			warnings: timing.warning ? [timing.warning] : [],
		});
		const views = options.noTimelineViews
			? []
			: await renderPlanViews({ plan, index, outputDir, signal });
		onProgress({
			stage: "complete",
			percent: 100,
			message: "EDL and QCut timeline manifest ready",
		});
		return {
			success: true,
			outputPath: plan.edlPath,
			outputPaths: [plan.edlPath, plan.manifestPath, ...views],
			data: {
				edlPath: plan.edlPath,
				manifestPath: plan.manifestPath,
				duration: plan.edl.duration,
				beats: plan.edl.beats.length,
				clips: plan.edl.clips.length,
				views,
				warnings: plan.edl.warnings,
			},
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function handleEditVerify(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	_executor: PipelineExecutor,
	signal: AbortSignal
): Promise<CLIResult> {
	if (!options.edl) return { success: false, error: "Missing --edl" };
	if (!options.video) return { success: false, error: "Missing --video" };
	try {
		const cutWindow = parsePositiveNumber({
			value: options.cutWindow,
			name: "--cut-window",
			fallback: 1.5,
		});
		const outputDir = options.outputDirExplicit
			? resolve(options.outputDir)
			: resolve(dirname(options.edl), "verification");
		onProgress({
			stage: "verifying",
			percent: 5,
			message: "Checking rendered cut points",
		});
		const result = await verifyEdit({
			edlPath: options.edl,
			video: options.video,
			outputDir,
			cutWindow,
			signal,
		});
		onProgress({
			stage: "complete",
			percent: 100,
			message: result.report.passed
				? "Cut verification passed"
				: "Cut verification found adjustments",
		});
		return {
			success: true,
			outputPath: result.reportPath,
			outputPaths: [
				result.reportPath,
				...result.report.cuts.flatMap((cut) =>
					cut.evidencePath ? [cut.evidencePath] : []
				),
			],
			data: result.report,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
