import { dirname } from "node:path";
import type { PipelineExecutor } from "../execution/executor.js";
import { ModelRegistry } from "../infra/registry.js";
import {
	writeConsistencyArtifacts,
	type ConsistencyArtifactResult,
} from "../character-consistency/consistency-artifacts.js";
import { runConsistencyCheck } from "../character-consistency/consistency-runner.js";
import {
	DEFAULT_CONSISTENCY_OPTIONS,
	CONSISTENCY_SEVERITIES,
	type ConsistencyLanguage,
	type ConsistencyRunOptions,
	type Severity,
} from "../character-consistency/types.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";

type RunConsistencyCheckFn = typeof runConsistencyCheck;

function isUrl({ input }: { input: string }): boolean {
	return /^https?:\/\//i.test(input);
}

function outputDirForRun({
	options,
	videoInput,
}: {
	options: CLIRunOptions;
	videoInput: string;
}): string {
	if (options.outputDirExplicit || isUrl({ input: videoInput })) {
		return options.outputDir;
	}
	return dirname(videoInput);
}

function positiveNumber({
	value,
	fallback,
}: {
	value: number | undefined;
	fallback: number;
}): number {
	return Number.isFinite(value) && value !== undefined && value > 0
		? value
		: fallback;
}

function resolveSeverity({ value }: { value?: string }): Severity {
	return (CONSISTENCY_SEVERITIES as string[]).includes(value ?? "")
		? (value as Severity)
		: DEFAULT_CONSISTENCY_OPTIONS.minSeverity;
}

function resolveLanguage({ value }: { value?: string }): ConsistencyLanguage {
	return value === "en" ? "en" : "zh";
}

function buildRunOptions({
	options,
	videoInput,
}: {
	options: CLIRunOptions;
	videoInput: string;
}): ConsistencyRunOptions {
	return {
		refs: options.refs ?? [],
		videoInput,
		model: options.model || DEFAULT_CONSISTENCY_OPTIONS.model,
		language: resolveLanguage({ value: options.language }),
		fps: positiveNumber({
			value: options.fps,
			fallback: DEFAULT_CONSISTENCY_OPTIONS.fps,
		}),
		sceneDetect: options.sceneDetect ?? DEFAULT_CONSISTENCY_OPTIONS.sceneDetect,
		batchSize: Math.max(
			1,
			Math.round(
				positiveNumber({
					value: options.batchSize,
					fallback: DEFAULT_CONSISTENCY_OPTIONS.batchSize,
				})
			)
		),
		minSeverity: resolveSeverity({ value: options.minSeverity }),
		maxTokens: Math.max(
			1,
			Math.round(
				positiveNumber({
					value: options.maxTokens,
					fallback: DEFAULT_CONSISTENCY_OPTIONS.maxTokens,
				})
			)
		),
		outputDir: outputDirForRun({ options, videoInput }),
	};
}

function validateAnalyzeConsistency({
	options,
	videoInput,
	model,
}: {
	options: CLIRunOptions;
	videoInput?: string;
	model: string;
}): string | null {
	if (!videoInput) return "Missing --input/-i (video path/URL)";
	if (!options.refs || options.refs.length === 0) {
		return "Missing --ref (at least one reference image is required)";
	}
	if (!ModelRegistry.has(model)) return `Unknown model '${model}'`;
	return null;
}

function buildResultData({
	artifacts,
	result,
	duration,
}: {
	artifacts: ConsistencyArtifactResult;
	result: unknown;
	duration: number;
}): Record<string, unknown> {
	return {
		type: "character_consistency",
		duration,
		content: result,
		artifacts,
	};
}

export async function handleAnalyzeConsistencyWithDeps({
	options,
	onProgress,
	executor,
	signal,
	runConsistencyCheckFn = runConsistencyCheck,
}: {
	options: CLIRunOptions;
	onProgress: ProgressFn;
	executor: PipelineExecutor;
	signal: AbortSignal;
	runConsistencyCheckFn?: RunConsistencyCheckFn;
}): Promise<CLIResult> {
	const videoInput = options.input || options.videoUrl;
	const model = options.model || DEFAULT_CONSISTENCY_OPTIONS.model;
	const validationError = validateAnalyzeConsistency({
		options,
		videoInput,
		model,
	});
	if (validationError) return { success: false, error: validationError };

	const runOptions = buildRunOptions({
		options,
		videoInput: videoInput as string,
	});
	const startTime = Date.now();
	try {
		const result = await runConsistencyCheckFn({
			options: runOptions,
			executor,
			onProgress,
			signal,
		});
		const artifacts = writeConsistencyArtifacts({
			outputDir: runOptions.outputDir,
			result,
		});
		const duration = (Date.now() - startTime) / 1000;
		return {
			success: true,
			outputPath: artifacts.reportPath,
			data: buildResultData({ artifacts, result, duration }),
			duration,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			duration: (Date.now() - startTime) / 1000,
		};
	}
}

export async function handleAnalyzeConsistency(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	executor: PipelineExecutor,
	signal: AbortSignal
): Promise<CLIResult> {
	return handleAnalyzeConsistencyWithDeps({
		options,
		onProgress,
		executor,
		signal,
	});
}
