/**
 * Pipeline Executor - Orchestrates sequential step execution
 *
 * Replaces Python ChainExecutor. Runs steps in order,
 * passing outputs from step N as inputs to step N+1.
 *
 * @module electron/native-pipeline/executor
 */

import type { ModelCategory } from "../infra/registry.js";
import { ModelRegistry } from "../infra/registry.js";
import {
	executeStep,
	getOutputDataType,
	type StepInput,
	type StepOutput,
	type DataType,
} from "./step-executors.js";

export interface PipelineStep {
	type: ModelCategory;
	model: string;
	params: Record<string, unknown>;
	enabled: boolean;
	retryCount: number;
}

export interface PipelineChain {
	name: string;
	steps: PipelineStep[];
	config: {
		outputDir?: string;
		saveIntermediates?: boolean;
		inputType?: DataType;
		parallel?: boolean;
		maxWorkers?: number;
	};
}

export interface PipelineProgress {
	stage: string;
	percent: number;
	message: string;
	model?: string;
	eta?: number;
	stepIndex?: number;
	totalSteps?: number;
}

export interface StepResult {
	success: boolean;
	endpoint?: string;
	outputPath?: string;
	outputUrl?: string;
	text?: string;
	error?: string;
	duration: number;
	cost?: number;
	data?: unknown;
}

export interface PipelineResult {
	success: boolean;
	stepsCompleted: number;
	totalSteps: number;
	totalCost: number;
	totalTime: number;
	outputs: Record<string, unknown>;
	error?: string;
	stepResults: StepResult[];
	outputPath?: string;
	outputPaths?: string[];
}

export class PipelineExecutor {
	async executeChain(
		chain: PipelineChain,
		input: string,
		onProgress: (progress: PipelineProgress) => void,
		signal?: AbortSignal
	): Promise<PipelineResult> {
		const enabledSteps = chain.steps.filter((s) => s.enabled);
		const totalSteps = enabledSteps.length;
		const stepResults: StepResult[] = [];
		let totalCost = 0;
		let totalTime = 0;
		const outputPaths: string[] = [];

		let currentInput: StepInput = this.buildInitialInput(input, chain);

		for (let i = 0; i < enabledSteps.length; i++) {
			const step = enabledSteps[i];

			if (signal?.aborted) {
				return {
					success: false,
					stepsCompleted: i,
					totalSteps,
					totalCost,
					totalTime,
					outputs: {},
					error: "Pipeline cancelled",
					stepResults,
				};
			}

			onProgress({
				stage: `step_${i + 1}`,
				percent: Math.round((i / totalSteps) * 100),
				message: `Executing step ${i + 1}/${totalSteps}: ${step.type} (${step.model})`,
				model: step.model,
				stepIndex: i,
				totalSteps,
			});

			const result = await this.executeStepWithRetry(step, currentInput, {
				outputDir: chain.config.outputDir,
				onProgress: (p, m) => {
					const basePercent = (i / totalSteps) * 100;
					const stepPercent = (p / 100) * (100 / totalSteps);
					onProgress({
						stage: `step_${i + 1}`,
						percent: Math.round(basePercent + stepPercent),
						message: m,
						model: step.model,
						stepIndex: i,
						totalSteps,
					});
				},
				signal,
			});

			stepResults.push(result);
			totalTime += result.duration;
			if (result.cost) totalCost += result.cost;

			if (!result.success) {
				return {
					success: false,
					stepsCompleted: i,
					totalSteps,
					totalCost,
					totalTime,
					outputs: {},
					error: `Step ${i + 1} (${step.model}) failed: ${result.error}`,
					stepResults,
				};
			}

			if (result.outputPath) {
				outputPaths.push(result.outputPath);
			}

			currentInput = this.buildNextInput(step, result, currentInput);
		}

		onProgress({
			stage: "complete",
			percent: 100,
			message: "Pipeline completed successfully",
			totalSteps,
		});

		const lastResult = stepResults[stepResults.length - 1];
		return {
			success: true,
			stepsCompleted: totalSteps,
			totalSteps,
			totalCost,
			totalTime,
			outputs: { finalOutput: lastResult?.data },
			stepResults,
			outputPath: lastResult?.outputPath || outputPaths[outputPaths.length - 1],
			outputPaths: outputPaths.length > 0 ? outputPaths : undefined,
		};
	}

	async executeStep(
		step: PipelineStep,
		input: StepInput,
		options: {
			outputDir?: string;
			onProgress?: (percent: number, message: string) => void;
			signal?: AbortSignal;
		}
	): Promise<StepResult> {
		const model = ModelRegistry.get(step.model);
		const result = await executeStep(model, input, step.params, options);
		return {
			success: result.success,
			endpoint: result.endpoint,
			outputPath: result.outputPath,
			outputUrl: result.outputUrl,
			text: result.text,
			error: result.error,
			duration: result.duration,
			cost: result.cost,
			data: result.data,
		};
	}

	private async executeStepWithRetry(
		step: PipelineStep,
		input: StepInput,
		options: {
			outputDir?: string;
			onProgress?: (percent: number, message: string) => void;
			signal?: AbortSignal;
		}
	): Promise<StepResult> {
		const maxAttempts = Math.max(1, step.retryCount + 1);
		let lastResult: StepResult | null = null;

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			if (attempt > 0) {
				console.log(
					`[PipelineExecutor] Retrying step ${step.model} (attempt ${attempt + 1}/${maxAttempts})`
				);
				await new Promise((r) => setTimeout(r, 2000 * attempt));
			}
			lastResult = await this.executeStep(step, input, options);
			if (lastResult.success) return lastResult;
		}

		return lastResult as StepResult;
	}

	private buildInitialInput(input: string, chain: PipelineChain): StepInput {
		const inputType = chain.config.inputType || this.inferInputType(input);
		switch (inputType) {
			case "image":
				return { imageUrl: input };
			case "video":
				return { videoUrl: input };
			case "audio":
				return { audioUrl: input };
			default:
				return { text: input };
		}
	}

	private inferInputType(input: string): DataType {
		if (input.startsWith("http") || input.startsWith("/")) {
			const lower = input.toLowerCase();
			if (
				lower.endsWith(".mp4") ||
				lower.endsWith(".webm") ||
				lower.endsWith(".mov")
			)
				return "video";
			if (
				lower.endsWith(".png") ||
				lower.endsWith(".jpg") ||
				lower.endsWith(".jpeg") ||
				lower.endsWith(".webp")
			)
				return "image";
			if (
				lower.endsWith(".mp3") ||
				lower.endsWith(".wav") ||
				lower.endsWith(".m4a")
			)
				return "audio";
		}
		return "text";
	}

	private buildNextInput(
		step: PipelineStep,
		result: StepResult,
		previousInput: StepInput
	): StepInput {
		const outputType = getOutputDataType(step.type);

		switch (outputType) {
			case "image":
				return {
					...previousInput,
					imageUrl: result.outputUrl || result.outputPath,
				};
			case "video":
				return {
					...previousInput,
					videoUrl: result.outputUrl || result.outputPath,
				};
			case "audio":
				return {
					...previousInput,
					audioUrl: result.outputUrl || result.outputPath,
				};
			case "text":
				return {
					...previousInput,
					text: result.text || previousInput.text,
				};
			default:
				return previousInput;
		}
	}
}
