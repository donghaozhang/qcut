import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { PipelineStep } from "../../execution/executor.js";
import type { StepInput, StepOutput } from "../../execution/step-executors.js";
import { ModelRegistry } from "../../infra/registry.js";
import { handleAnalyzeConsistencyWithDeps } from "../cli-handlers-character-consistency.js";
import type { CLIRunOptions } from "../cli-runner/types.js";

function registerModel(): void {
	ModelRegistry.register({
		key: "openrouter_gemini_3_5_flash_video",
		name: "Gemini consistency test model",
		provider: "OpenRouter",
		providerBackend: "openrouter",
		endpoint: "chat/completions",
		categories: ["image_understanding"],
		description: "test",
		pricing: 0,
		defaults: { model: "google/gemini-3.5-flash" },
	});
}

function makeOptions({
	outputDir,
	refs = ["data:image/jpeg;base64,ref"],
}: {
	outputDir: string;
	refs?: string[];
}): CLIRunOptions {
	return {
		command: "analyze-consistency",
		input: "video.mp4",
		refs,
		outputDir,
		outputDirExplicit: true,
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

function makeExecutor({ capturedInputs }: { capturedInputs: StepInput[] }): {
	executeStep: (
		step: PipelineStep,
		input: StepInput,
		options: {
			outputDir?: string;
			onProgress?: (percent: number, message: string) => void;
			signal?: AbortSignal;
		}
	) => Promise<StepOutput>;
} {
	return {
		async executeStep(_step: PipelineStep, input: StepInput) {
			capturedInputs.push(input);
			return {
				success: true,
				text: JSON.stringify([
					{
						frameNumber: 0,
						category: "proportion/height",
						severity: "high",
						comment: "too short",
						fix: "fix scale",
					},
				]),
				duration: 0.1,
			};
		},
	};
}

describe("handleAnalyzeConsistency", () => {
	beforeEach(() => {
		ModelRegistry.clear();
		registerModel();
	});

	it("runs the consistency pipeline and writes artifacts", async () => {
		const outputDir = mkdtempSync(
			path.join(os.tmpdir(), "qcut-cli-consistency-")
		);
		const capturedInputs: StepInput[] = [];

		const result = await handleAnalyzeConsistencyWithDeps({
			options: makeOptions({ outputDir }),
			onProgress: () => undefined,
			executor: makeExecutor({ capturedInputs }) as never,
			signal: new AbortController().signal,
			async runConsistencyCheckFn({ options, executor }) {
				const step: PipelineStep = {
					type: "image_understanding",
					model: options.model,
					params: { prompt: "test" },
					enabled: true,
					retryCount: 0,
				};
				await executor.executeStep(
					step,
					{
						images: [options.refs[0], "data:image/jpeg;base64,frame0"],
					},
					{}
				);
				return {
					video: options.videoInput,
					model: options.model,
					videoFps: 30,
					totalFrames: 60,
					referenceImages: options.refs,
					samplingFps: options.fps,
					minSeverity: options.minSeverity,
					findings: [
						{
							startFrame: 0,
							endFrame: 29,
							startTime: "00:00:00.000",
							endTime: "00:00:00.967",
							category: "proportion/height",
							severity: "high",
							comment: "too short",
							fix: "fix scale",
						},
					],
				};
			},
		});

		expect(result.success).toBe(true);
		expect(result.outputPath).toBe(
			path.join(outputDir, "consistency-report.md")
		);
		expect(capturedInputs[0]?.images?.[0]).toBe("data:image/jpeg;base64,ref");
		expect(existsSync(path.join(outputDir, "consistency-findings.json"))).toBe(
			true
		);
		expect(readFileSync(result.outputPath as string, "utf-8")).toContain(
			"Findings: 1"
		);
	});

	it("rejects missing references", async () => {
		const outputDir = mkdtempSync(
			path.join(os.tmpdir(), "qcut-cli-consistency-")
		);
		const result = await handleAnalyzeConsistencyWithDeps({
			options: makeOptions({ outputDir, refs: [] }),
			onProgress: () => undefined,
			executor: makeExecutor({ capturedInputs: [] }) as never,
			signal: new AbortController().signal,
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("Missing --ref");
	});
});
