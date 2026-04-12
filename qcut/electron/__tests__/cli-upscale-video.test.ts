import { describe, expect, it, beforeEach, vi } from "vitest";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import { handleUpscaleVideo } from "../native-pipeline/cli/cli-runner/handler-upscale.js";
import { getCommand } from "../native-pipeline/cli/command-registry.js";
import { resolveCommandGroup } from "../native-pipeline/cli/command-groups.js";
import { HANDLER_MAP } from "../native-pipeline/cli/cli-runner/handler-map.js";
import { ModelRegistry } from "../native-pipeline/infra/registry.js";
import { initRegistry, resetInitState } from "../native-pipeline/init.js";

describe("upscale-video CLI", () => {
	beforeEach(() => {
		ModelRegistry.clear();
		resetInitState();
		initRegistry();
	});

	describe("group resolution", () => {
		it("resolves 'edit upscale-video' to 'upscale-video'", () => {
			expect(resolveCommandGroup(["edit", "upscale-video"])).toEqual({
				command: "upscale-video",
				remainingArgs: [],
			});
		});

		it("passes remaining args through", () => {
			expect(
				resolveCommandGroup([
					"edit",
					"upscale-video",
					"--video",
					"clip.mp4",
					"-u",
					"4",
				])
			).toEqual({
				command: "upscale-video",
				remainingArgs: ["--video", "clip.mp4", "-u", "4"],
			});
		});

		it("keeps existing 'edit upscale' mapping intact", () => {
			expect(resolveCommandGroup(["edit", "upscale"])).toEqual({
				command: "upscale-image",
				remainingArgs: [],
			});
		});
	});

	describe("registry contract", () => {
		it("has a command entry for upscale-video", () => {
			const cmd = getCommand("upscale-video");
			expect(cmd).toBeDefined();
			expect(cmd!.name).toBe("upscale-video");
		});

		it("declares --video, --video-url, --upscale, --target-fps flags", () => {
			const cmd = getCommand("upscale-video")!;
			const names = cmd.flags.map((f) => f.name);
			expect(names).toEqual(
				expect.arrayContaining([
					"--video",
					"--video-url",
					"--input",
					"--model",
					"--upscale",
					"--target-fps",
					"--output-format",
				])
			);
		});

		it("has a handler registered for upscale-video", () => {
			expect(HANDLER_MAP["upscale-video"]).toBeDefined();
			expect(typeof HANDLER_MAP["upscale-video"]).toBe("function");
		});

		it("topaz model is registered under upscale_video category", () => {
			expect(ModelRegistry.has("topaz")).toBe(true);
			const topaz = ModelRegistry.get("topaz")!;
			expect(topaz.categories).toContain("upscale_video");
			expect(topaz.endpoint).toBe("fal-ai/topaz/upscale/video");
		});
	});

	describe("parseCliArgs", () => {
		it("parses 'edit upscale-video' with all flags", () => {
			const opts = parseCliArgs([
				"edit",
				"upscale-video",
				"--video",
				"clip.mp4",
				"--upscale",
				"4",
				"--target-fps",
				"60",
				"--output-format",
				"mp4",
				"--quiet",
			]);
			expect(opts.command).toBe("upscale-video");
			expect(opts.video).toBe("clip.mp4");
			expect(opts.upscale).toBe("4");
			expect(opts.targetFps).toBe(60);
			expect(opts.outputFormat).toBe("mp4");
		});

		it("parses --video-url for remote input", () => {
			const opts = parseCliArgs([
				"edit",
				"upscale-video",
				"--video-url",
				"https://example.com/clip.mp4",
				"--upscale",
				"2",
				"--quiet",
			]);
			expect(opts.videoUrl).toBe("https://example.com/clip.mp4");
			expect(opts.upscale).toBe("2");
		});

		it("--target-fps not provided leaves targetFps undefined", () => {
			const opts = parseCliArgs([
				"edit",
				"upscale-video",
				"--video",
				"clip.mp4",
				"--quiet",
			]);
			expect(opts.targetFps).toBeUndefined();
		});
	});

	describe("handleUpscaleVideo validation", () => {
		const noopProgress = vi.fn();
		const stubExecutor = { executeStep: vi.fn() } as never;
		const signal = new AbortController().signal;

		it("rejects when no video source is provided", async () => {
			const result = await handleUpscaleVideo(
				{
					command: "upscale-video",
					outputDir: "./test-output",
					saveIntermediates: false,
					json: false,
					verbose: false,
					quiet: true,
				},
				noopProgress,
				stubExecutor,
				signal
			);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/Missing --video/);
		});

		it("rejects unknown model", async () => {
			const result = await handleUpscaleVideo(
				{
					command: "upscale-video",
					video: "clip.mp4",
					model: "no-such-model",
					outputDir: "./test-output",
					saveIntermediates: false,
					json: false,
					verbose: false,
					quiet: true,
				},
				noopProgress,
				stubExecutor,
				signal
			);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/Unknown model/);
		});

		it("rejects upscale factor outside 1-4", async () => {
			const result = await handleUpscaleVideo(
				{
					command: "upscale-video",
					video: "clip.mp4",
					upscale: "8",
					outputDir: "./test-output",
					saveIntermediates: false,
					json: false,
					verbose: false,
					quiet: true,
				},
				noopProgress,
				stubExecutor,
				signal
			);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/Invalid --upscale/);
		});

		it("rejects non-positive target-fps", async () => {
			const result = await handleUpscaleVideo(
				{
					command: "upscale-video",
					video: "clip.mp4",
					targetFps: -1,
					outputDir: "./test-output",
					saveIntermediates: false,
					json: false,
					verbose: false,
					quiet: true,
				},
				noopProgress,
				stubExecutor,
				signal
			);
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/Invalid --target-fps/);
		});
	});
});
