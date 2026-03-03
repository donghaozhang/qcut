/**
 * Pipeline execution handler.
 * @module electron/native-pipeline/cli/cli-runner/handler-pipeline
 */

import * as fs from "node:fs";
import { PipelineExecutor } from "../../execution/executor.js";
import { ParallelPipelineExecutor } from "../../execution/parallel-executor.js";
import {
	parseChainConfig,
	validateChain,
} from "../../execution/chain-parser.js";
import { estimatePipelineCost } from "../../infra/cost-calculator.js";
import { resolveOutputDir } from "../../output/output-utils.js";
import { isInteractive, confirm } from "../interactive.js";
import type { CLIRunOptions, CLIResult, ProgressFn } from "./types.js";

export async function handleRunPipeline(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	executor: PipelineExecutor,
	signal: AbortSignal
): Promise<CLIResult> {
	if (!options.config) {
		return {
			success: false,
			error: "Missing --config. Run --help for usage.",
		};
	}

	let yamlContent: string;
	try {
		yamlContent = fs.readFileSync(options.config, "utf-8");
	} catch {
		return { success: false, error: `Cannot read config: ${options.config}` };
	}

	let chain: ReturnType<typeof parseChainConfig>;
	try {
		chain = parseChainConfig(yamlContent);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			error: `Failed to parse pipeline config: ${message}`,
		};
	}

	const validation = validateChain(chain);
	if (!validation.valid) {
		return {
			success: false,
			error: `Pipeline validation failed:\n  ${validation.errors.join("\n  ")}`,
		};
	}

	const startTime = Date.now();
	const sessionId = `cli-${Date.now()}`;
	const outputDir = resolveOutputDir(options.outputDir, sessionId);
	chain.config.outputDir = outputDir;
	chain.config.saveIntermediates = options.saveIntermediates;

	if (options.parallel) {
		chain.config.parallel = true;
		if (options.maxWorkers) chain.config.maxWorkers = options.maxWorkers;
	}

	let input = options.input || options.text || "";
	if (options.promptFile) {
		try {
			input = fs.readFileSync(options.promptFile, "utf-8").trim();
		} catch {
			return {
				success: false,
				error: `Cannot read prompt file: ${options.promptFile}`,
			};
		}
	}

	const enabledSteps = chain.steps.filter((s) => s.enabled);
	const costEstimate = estimatePipelineCost(chain);
	if (!options.quiet) {
		console.error(
			`Pipeline: ${enabledSteps.length} steps, estimated cost: $${costEstimate.totalCost.toFixed(3)}`
		);
	}

	const skipConfirm = options.noConfirm || !isInteractive();
	if (!skipConfirm) {
		const proceed = await confirm("Proceed with execution?");
		if (!proceed) {
			return { success: false, error: "Execution cancelled by user" };
		}
	}

	const activeExecutor = chain.config.parallel
		? new ParallelPipelineExecutor({
				enabled: true,
				maxWorkers: chain.config.maxWorkers ?? 8,
			})
		: executor;

	try {
		const result = await activeExecutor.executeChain(
			chain,
			input,
			(progress) => {
				onProgress({
					stage: progress.stage,
					percent: progress.percent,
					message: progress.message,
					model: progress.model,
				});
				if (options.stream) {
					const event = {
						type: "progress",
						stage: progress.stage,
						percent: progress.percent,
						message: progress.message,
						model: progress.model,
						timestamp: new Date().toISOString(),
					};
					process.stderr.write(`${JSON.stringify(event)}\n`);
				}
			},
			signal
		);

		return {
			success: result.success,
			outputPath: result.outputPath,
			outputPaths: result.outputPaths,
			error: result.error,
			cost: result.totalCost,
			duration: (Date.now() - startTime) / 1000,
			data: {
				stepsCompleted: result.stepsCompleted,
				totalSteps: result.totalSteps,
				steps: result.stepResults.map((s, i) => ({
					step: i + 1,
					success: s.success,
					outputPath: s.outputPath,
					duration: s.duration,
					cost: s.cost,
					error: s.error,
				})),
			},
		};
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			error: `Pipeline execution failed: ${message}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}
}
