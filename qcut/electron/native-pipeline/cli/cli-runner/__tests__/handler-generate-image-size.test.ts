import { beforeAll, describe, expect, it } from "vitest";
import {
	type PipelineStep,
	type StepResult,
	PipelineExecutor,
} from "../../../execution/executor.js";
import type { StepInput } from "../../../execution/step-executors.js";
import { ModelRegistry } from "../../../infra/registry.js";
import { registerTextToImageModels } from "../../../registry-data/text-to-image.js";
import { handleGenerate } from "../handler-generate.js";
import type { CLIRunOptions, ProgressFn } from "../types.js";

class CapturingExecutor extends PipelineExecutor {
	steps: PipelineStep[] = [];

	override async executeStep(
		step: PipelineStep,
		_input: StepInput,
		_options: {
			outputDir?: string;
			onProgress?: (percent: number, message: string) => void;
			signal?: AbortSignal;
		}
	): Promise<StepResult> {
		this.steps.push(step);
		return {
			success: false,
			error: "executor reached",
			duration: 0,
		};
	}
}

function buildImageOptions({
	model = "gpt_image_2_ima",
	aspectRatio,
	width,
	height,
}: {
	model?: string;
	aspectRatio?: string;
	width?: number;
	height?: number;
}): CLIRunOptions {
	const options: CLIRunOptions = {
		command: "generate-image",
		model,
		text: "wide product hero image",
		outputDir: "/tmp/qcut-handler-generate-image-size-test",
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
	if (aspectRatio !== undefined) options.aspectRatio = aspectRatio;
	if (width !== undefined) options.width = width;
	if (height !== undefined) options.height = height;
	return options;
}

const ignoreProgress: ProgressFn = () => undefined;

describe("generate-image custom size handling", () => {
	beforeAll(() => {
		if (!ModelRegistry.has("gpt_image_2_ima")) {
			registerTextToImageModels();
		}
	});

	it("passes custom IMA Router GPT Image 2 size through params", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			buildImageOptions({
				aspectRatio: "16:9",
				width: 2000,
				height: 1152,
			}),
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("executor reached");
		expect(executor.steps).toHaveLength(1);
		expect(executor.steps[0].params.aspect_ratio).toBe("16:9");
		expect(executor.steps[0].params.size).toBe("2000x1152");
	});

	it("rejects partial custom image dimensions before calling the executor", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			buildImageOptions({ width: 2000 }),
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("--width and --height");
		expect(executor.steps).toHaveLength(0);
	});

	it("rejects custom sizes for non-IMA Router GPT Image 2 models", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			buildImageOptions({
				model: "gpt_image_2_fal",
				width: 2000,
				height: 1152,
			}),
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("gpt_image_2_ima");
		expect(executor.steps).toHaveLength(0);
	});
});
