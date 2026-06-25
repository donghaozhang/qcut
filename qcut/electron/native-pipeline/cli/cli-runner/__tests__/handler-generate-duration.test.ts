import { beforeAll, describe, expect, it } from "vitest";
import {
	type PipelineStep,
	type StepResult,
	PipelineExecutor,
} from "../../../execution/executor.js";
import type { StepInput } from "../../../execution/step-executors.js";
import { ModelRegistry } from "../../../infra/registry.js";
import { registerImageToVideoModels } from "../../../registry-data/image-to-video.js";
import { registerTextToVideoModels } from "../../../registry-data/text-to-video.js";
import { registerVideoToVideoModels } from "../../../registry-data/video-to-video.js";
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
		if (!ModelRegistry.has("imarouter_seedance_2_0_ref2v")) {
			registerImageToVideoModels();
		}
		if (!ModelRegistry.has("luma_ray_3_2_edit")) {
			registerVideoToVideoModels();
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

	it("stages IMA Router Ref2V reference images for executor upload", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			{
				...buildVideoOptions({
					model: "imarouter_seedance_2_0_ref2v",
				}),
				referenceImages: ["/tmp/a.png", "/tmp/b.png"],
			},
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("executor reached");
		expect(executor.steps).toHaveLength(1);
		expect(executor.steps[0].params.image_urls).toEqual([
			"/tmp/a.png",
			"/tmp/b.png",
		]);
	});

	it("stages Luma Ray 3.2 reference images as start/end frame candidates", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			{
				...buildVideoOptions({
					model: "luma_ray_3_2",
				}),
				referenceImages: ["/tmp/start.png", "/tmp/end.png", "/tmp/ignored.png"],
			},
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("executor reached");
		expect(executor.steps).toHaveLength(1);
		expect(executor.steps[0].params.image_urls).toEqual([
			"/tmp/start.png",
			"/tmp/end.png",
		]);
	});

	it("stages Luma Ray 3.2 keyframe images and indexes", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			{
				...buildVideoOptions({
					model: "luma_ray_3_2",
				}),
				keyframeImages: ["/tmp/beat-1.png", "/tmp/beat-2.png"],
				keyframeIndexes: ["0", "120"],
			},
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("executor reached");
		expect(executor.steps).toHaveLength(1);
		expect(executor.steps[0].params).toMatchObject({
			keyframe_images: ["/tmp/beat-1.png", "/tmp/beat-2.png"],
			keyframe_indexes: ["0", "120"],
		});
	});

	it("rejects Luma keyframe indexes without keyframe images", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			{
				...buildVideoOptions({
					model: "luma_ray_3_2",
				}),
				keyframeIndexes: ["0"],
			},
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("requires --keyframe-images");
		expect(executor.steps).toHaveLength(0);
	});

	it("rejects Luma keyframe images on non-Ray models", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			{
				...buildVideoOptions({
					model: "imarouter_seedance_2_0_fast_t2v",
				}),
				keyframeImages: ["/tmp/beat-1.png"],
			},
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("only with -m luma_ray_3_2");
		expect(executor.steps).toHaveLength(0);
	});

	it("requires a prompt for Luma Ray 3.2 even with an anchor image", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			{
				...buildVideoOptions({
					model: "luma_ray_3_2",
				}),
				text: undefined,
				imageUrl: "https://example.com/start.jpg",
			},
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("requires --text");
		expect(executor.steps).toHaveLength(0);
	});

	it("passes Luma Ray 3.2 advanced video toggles into params", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			{
				...buildVideoOptions({
					model: "luma_ray_3_2",
				}),
				loop: true,
				hdr: true,
				exrExport: true,
			},
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("executor reached");
		expect(executor.steps[0].params).toMatchObject({
			loop: true,
			hdr: true,
			exr_export: true,
		});
	});

	it("stages Luma Ray 3.2 edit source and guide frame params", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			{
				...buildVideoOptions({
					model: "luma_ray_3_2_edit",
				}),
				sourceGenerationId: "d290f1ee-6c54-4b01-90e6-d701748f0851",
				editStrength: "flex_2",
				referenceImages: ["/tmp/guide.png", "/tmp/ignored.png"],
			},
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("executor reached");
		expect(executor.steps[0].params).toMatchObject({
			source_generation_id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
			edit_strength: "flex_2",
			image_urls: ["/tmp/guide.png"],
		});
	});

	it("requires a source for Luma Ray 3.2 edit", async () => {
		const executor = new CapturingExecutor();

		const result = await handleGenerate(
			buildVideoOptions({
				model: "luma_ray_3_2_edit",
			}),
			ignoreProgress,
			executor,
			new AbortController().signal
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("--video-url or --source-generation-id");
		expect(executor.steps).toHaveLength(0);
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

	it("parses Luma Ray 3.2 keyframe flags in session mode", () => {
		const options = parseSessionLine(
			'create-video -m luma_ray_3_2 -t "beats" --keyframe-images a.png --keyframe-images b.png --keyframe-indexes 0 --keyframe-indexes 120',
			{
				outputDir: "/tmp/qcut-session-parse-test",
			}
		);

		expect(options?.keyframeImages).toEqual(["a.png", "b.png"]);
		expect(options?.keyframeIndexes).toEqual(["0", "120"]);
	});
});
