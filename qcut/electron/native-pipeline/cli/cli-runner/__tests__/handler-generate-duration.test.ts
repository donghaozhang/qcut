import { beforeAll, describe, expect, it } from "vitest";
import {
	type PipelineStep,
	type StepResult,
	PipelineExecutor,
} from "../../../execution/executor.js";
import type { StepInput } from "../../../execution/step-executors.js";
import { ModelRegistry } from "../../../infra/registry.js";
import { registerTextToVideoModels } from "../../../registry-data/text-to-video.js";
import {
	getDefaultModelForCommand,
	handleGenerate,
	validateDurationOption,
} from "../handler-generate.js";
import { parseSessionLine } from "../session.js";
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

function buildVideoOptions({
	duration,
	model,
}: {
	duration?: string;
	model?: string;
}): CLIRunOptions {
	return {
		command: "create-video",
		model,
		text: "small blue square moving left to right",
		duration,
		outputDir: "/tmp/qcut-handler-generate-duration-test",
		saveIntermediates: false,
		json: true,
		verbose: false,
		quiet: true,
	};
}

const ignoreProgress: ProgressFn = () => undefined;

describe("create-video duration validation", () => {
	beforeAll(() => {
		if (!ModelRegistry.has("imarouter_seedance_2_0_fast_t2v")) {
			registerTextToVideoModels();
		}
	});

	it("uses the documented default model for create-video", () => {
		expect(getDefaultModelForCommand({ command: "create-video" })).toBe(
			"imarouter_seedance_2_0_fast_t2v"
		);
	});

	it("rejects unsupported model durations before calling the executor", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			buildVideoOptions({
				duration: "1s",
				model: "imarouter_seedance_2_0_fast_t2v",
			}),
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Invalid --duration '1s'");
		expect(result.error).toContain("Supported durations: 5s, 6s, 7s");
		expect(executor.steps).toHaveLength(0);
	});

	it("accepts valid suffixed durations and passes a numeric payload", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			buildVideoOptions({
				duration: "5s",
				model: "imarouter_seedance_2_0_fast_t2v",
			}),
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("executor reached");
		expect(executor.steps).toHaveLength(1);
		expect(executor.steps[0].params.duration).toBe(5);
	});

	it("normalizes unsuffixed and suffixed durations for validation", () => {
		expect(
			validateDurationOption({
				modelKey: "imarouter_seedance_2_0_fast_t2v",
				duration: "5",
			})
		).toBeUndefined();
		expect(
			validateDurationOption({
				modelKey: "imarouter_seedance_2_0_fast_t2v",
				duration: "5s",
			})
		).toBeUndefined();
	});
});

describe("session command parsing", () => {
	it("parses --ratio as an aspect-ratio alias", () => {
		const options = parseSessionLine(
			'generate-image -t "poster" --ratio 9:16',
			{
				outputDir: "/tmp/qcut-session-parse-test",
			}
		);

		expect(options?.aspectRatio).toBe("9:16");
	});
});
