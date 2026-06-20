import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PipelineExecutor } from "../execution/executor.js";
import { ModelRegistry } from "../infra/registry.js";
import {
	writeImageConsistencyArtifacts,
	type ImageConsistencyArtifactResult,
} from "../image-consistency/image-consistency-artifacts.js";
import { runImageConsistencyCheck } from "../image-consistency/image-consistency-runner.js";
import {
	DEFAULT_IMAGE_CONSISTENCY_OPTIONS,
	type ImageConsistencyLanguage,
	type ImageConsistencyRunOptions,
	type Severity,
} from "../image-consistency/types.js";
import { CONSISTENCY_SEVERITIES } from "../character-consistency/types.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";

type RunImageConsistencyCheckFn = typeof runImageConsistencyCheck;

function isUrl({ input }: { input: string }): boolean {
	return /^https?:\/\//i.test(input);
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
		: DEFAULT_IMAGE_CONSISTENCY_OPTIONS.minSeverity;
}

function resolveLanguage({
	value,
}: {
	value?: string;
}): ImageConsistencyLanguage {
	return value === "en" ? "en" : "zh";
}

function resolveRule({
	options,
}: {
	options: CLIRunOptions;
}): string | undefined {
	const parts: string[] = [];
	if (options.rule) parts.push(options.rule);
	if (options.rulesFile) {
		parts.push(readFileSync(options.rulesFile, "utf-8"));
	}
	const rule = parts.join("\n\n").trim();
	return rule.length > 0 ? rule : undefined;
}

function outputDirForRun({
	options,
	candidates,
}: {
	options: CLIRunOptions;
	candidates: string[];
}): string {
	if (options.outputDirExplicit) return options.outputDir;
	if (options.dir) return options.dir;
	const first = candidates[0];
	if (!first || isUrl({ input: first })) return options.outputDir;
	return dirname(first);
}

function buildRunOptions({
	options,
	candidates,
	rule,
}: {
	options: CLIRunOptions;
	candidates: string[];
	rule?: string;
}): ImageConsistencyRunOptions {
	return {
		refs: options.refs ?? [],
		candidates,
		dir: options.dir,
		rule,
		model: options.model || DEFAULT_IMAGE_CONSISTENCY_OPTIONS.model,
		language: resolveLanguage({ value: options.language }),
		batchSize: Math.max(
			1,
			Math.round(
				positiveNumber({
					value: options.batchSize,
					fallback: DEFAULT_IMAGE_CONSISTENCY_OPTIONS.batchSize,
				})
			)
		),
		minSeverity: resolveSeverity({ value: options.minSeverity }),
		maxTokens: Math.max(
			1,
			Math.round(
				positiveNumber({
					value: options.maxTokens,
					fallback: DEFAULT_IMAGE_CONSISTENCY_OPTIONS.maxTokens,
				})
			)
		),
		outputDir: outputDirForRun({ options, candidates }),
	};
}

function validateAnalyzeImageConsistency({
	options,
	hasCandidates,
	model,
}: {
	options: CLIRunOptions;
	hasCandidates: boolean;
	model: string;
}): string | null {
	if (!options.refs || options.refs.length === 0) {
		return "Missing --ref (at least one reference image is required)";
	}
	if (!hasCandidates) {
		return "Missing --candidate/--dir (at least one candidate image is required)";
	}
	if (!ModelRegistry.has(model)) return `Unknown model '${model}'`;
	return null;
}

function buildResultData({
	artifacts,
	result,
	duration,
}: {
	artifacts: ImageConsistencyArtifactResult;
	result: unknown;
	duration: number;
}): Record<string, unknown> {
	return {
		type: "image_consistency",
		duration,
		content: result,
		artifacts,
	};
}

export async function handleAnalyzeImageConsistencyWithDeps({
	options,
	onProgress,
	executor,
	signal,
	runImageConsistencyCheckFn = runImageConsistencyCheck,
}: {
	options: CLIRunOptions;
	onProgress: ProgressFn;
	executor: PipelineExecutor;
	signal: AbortSignal;
	runImageConsistencyCheckFn?: RunImageConsistencyCheckFn;
}): Promise<CLIResult> {
	const candidates = options.candidates ?? [];
	const model = options.model || DEFAULT_IMAGE_CONSISTENCY_OPTIONS.model;
	const validationError = validateAnalyzeImageConsistency({
		options,
		hasCandidates: candidates.length > 0 || Boolean(options.dir),
		model,
	});
	if (validationError) return { success: false, error: validationError };

	let rule: string | undefined;
	try {
		rule = resolveRule({ options });
	} catch (error) {
		return {
			success: false,
			error: `Failed to read --rules-file: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	const startTime = Date.now();
	try {
		const runOptions = buildRunOptions({ options, candidates, rule });
		const result = await runImageConsistencyCheckFn({
			options: runOptions,
			executor,
			onProgress,
			signal,
		});
		const artifacts = writeImageConsistencyArtifacts({
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

export async function handleAnalyzeImageConsistency(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	executor: PipelineExecutor,
	signal: AbortSignal
): Promise<CLIResult> {
	return handleAnalyzeImageConsistencyWithDeps({
		options,
		onProgress,
		executor,
		signal,
	});
}
