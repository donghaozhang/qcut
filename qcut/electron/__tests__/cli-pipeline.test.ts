import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelRegistry } from "../native-pipeline/infra/registry.js";
import { initRegistry, resetInitState } from "../native-pipeline/init.js";
import {
	CLIPipelineRunner,
	createProgressReporter,
} from "../native-pipeline/cli/cli-runner.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import { PipelineExecutor } from "../native-pipeline/execution/executor.js";
import * as apiCaller from "../native-pipeline/infra/api-caller.js";
function defaultOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return {
		command: "list-models",
		outputDir: "./test-output",
		saveIntermediates: false,
		json: false,
		verbose: false,
		quiet: false,
		...overrides,
	};
}

describe("CLI pipeline", () => {
	beforeEach(() => {
		ModelRegistry.clear();
		resetInitState();
		initRegistry();
	});

	describe("initRegistry", () => {
		it("registers 70+ models", () => {
			expect(ModelRegistry.count()).toBeGreaterThanOrEqual(70);
		});

		it("is idempotent — calling twice does not duplicate models", () => {
			const countBefore = ModelRegistry.count();
			initRegistry();
			expect(ModelRegistry.count()).toBe(countBefore);
		});
	});

	describe("CLI Argument Parser", () => {
		let exitSpy: ReturnType<typeof vi.spyOn>;
		let consoleSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
				throw new Error("process.exit");
			});
			consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		});

		afterEach(() => {
			exitSpy.mockRestore();
			consoleSpy.mockRestore();
		});

		it("parses list-models command", () => {
			const opts = parseCliArgs(["list-models"]);
			expect(opts.command).toBe("list-models");
		});

		it("parses generate-image with all flags", () => {
			const opts = parseCliArgs([
				"generate-image",
				"-m",
				"flux_dev",
				"-t",
				"A cat in space",
				"-o",
				"./my-output",
				"-d",
				"5s",
				"--aspect-ratio",
				"16:9",
				"--resolution",
				"1080p",
				"--json",
				"--quiet",
			]);
			expect(opts.command).toBe("generate-image");
			expect(opts.model).toBe("flux_dev");
			expect(opts.text).toBe("A cat in space");
			expect(opts.outputDir).toBe("./my-output");
			expect(opts.duration).toBe("5s");
			expect(opts.aspectRatio).toBe("16:9");
			expect(opts.resolution).toBe("1080p");
			expect(opts.json).toBe(true);
			expect(opts.quiet).toBe(true);
		});

		it("parses run-pipeline with config path", () => {
			const opts = parseCliArgs([
				"run-pipeline",
				"-c",
				"pipeline.yaml",
				"-i",
				"A sunset",
				"--save-intermediates",
			]);
			expect(opts.command).toBe("run-pipeline");
			expect(opts.config).toBe("pipeline.yaml");
			expect(opts.input).toBe("A sunset");
			expect(opts.saveIntermediates).toBe(true);
		});

		it("errors on unknown command with exit code 2", () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			expect(() => parseCliArgs(["bad-cmd"])).toThrow("process.exit");
			expect(exitSpy).toHaveBeenCalledWith(2);
			errorSpy.mockRestore();
		});

		it("--help prints usage and exits with code 0", () => {
			expect(() => parseCliArgs(["--help"])).toThrow("process.exit");
			expect(exitSpy).toHaveBeenCalledWith(0);
			expect(consoleSpy).toHaveBeenCalled();
			const output = consoleSpy.mock.calls[0][0] as string;
			expect(output).toContain("qcut-pipeline");
			expect(output).toContain("Groups:");
		});

		it("command-level --help prints usage and exits", () => {
			expect(() => parseCliArgs(["generate-image", "--help"])).toThrow(
				"process.exit"
			);
			expect(exitSpy).toHaveBeenCalledWith(0);
		});

		it("--json flag sets json output mode", () => {
			const opts = parseCliArgs(["list-models", "--json"]);
			expect(opts.json).toBe(true);
		});

		it("defaults output-dir to ~/Documents/QCut/exports when not specified", () => {
			const os = require("node:os");
			const path = require("node:path");
			const opts = parseCliArgs(["list-models"]);
			expect(opts.outputDir).toBe(
				path.join(os.homedir(), "Documents", "QCut", "exports")
			);
		});

		it("uses custom --output-dir value", () => {
			const opts = parseCliArgs(["list-models", "-o", "/tmp/my-dir"]);
			expect(opts.outputDir).toBe("/tmp/my-dir");
		});

		it("parses image-url, video-url, audio-url", () => {
			const opts = parseCliArgs([
				"generate-avatar",
				"-m",
				"omnihuman_v1_5",
				"--image-url",
				"https://example.com/face.jpg",
				"--audio-url",
				"https://example.com/speech.wav",
			]);
			expect(opts.imageUrl).toBe("https://example.com/face.jpg");
			expect(opts.audioUrl).toBe("https://example.com/speech.wav");
		});

		it("--version prints version and exits", () => {
			expect(() => parseCliArgs(["--version"])).toThrow("process.exit");
			expect(exitSpy).toHaveBeenCalledWith(0);
		});

		it("parses --category for list-models", () => {
			const opts = parseCliArgs(["list-models", "--category", "text_to_image"]);
			expect(opts.category).toBe("text_to_image");
		});
	});

	describe("CLIPipelineRunner — list-models", () => {
		it("returns all models", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "list-models" }),
				noop
			);

			expect(result.success).toBe(true);
			const data = result.data as { models: unknown[]; count: number };
			expect(data.count).toBeGreaterThanOrEqual(70);
			expect(data.models.length).toBe(data.count);
		});

		it("filters by category", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "list-models", category: "text_to_video" }),
				noop
			);

			expect(result.success).toBe(true);
			const data = result.data as {
				models: { categories: string[] }[];
				count: number;
			};
			expect(data.count).toBeGreaterThan(0);
			for (const m of data.models) {
				expect(m.categories).toContain("text_to_video");
			}
		});

		it("returns models with expected fields", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "list-models" }),
				noop
			);

			const data = result.data as {
				models: {
					key: string;
					name: string;
					provider: string;
					categories: string[];
				}[];
			};
			const first = data.models[0];
			expect(first).toHaveProperty("key");
			expect(first).toHaveProperty("name");
			expect(first).toHaveProperty("provider");
			expect(first).toHaveProperty("categories");
		});
	});

	describe("CLIPipelineRunner — estimate-cost", () => {
		it("returns cost estimate for known model", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "estimate-cost", model: "kling_2_6_pro" }),
				noop
			);

			expect(result.success).toBe(true);
			expect(result.cost).toBeGreaterThan(0);
			expect(result.data).toBeDefined();
			const data = result.data as {
				model: string;
				totalCost: number;
				currency: string;
			};
			expect(data.model).toBe("kling_2_6_pro");
			expect(data.currency).toBe("USD");
		});

		it("errors on missing model", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "estimate-cost" }),
				noop
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("--model");
		});

		it("errors on unknown model", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({
					command: "estimate-cost",
					model: "nonexistent_model",
				}),
				noop
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("nonexistent_model");
		});

		it("accepts duration param for cost estimation", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({
					command: "estimate-cost",
					model: "kling_2_6_pro",
					duration: "10s",
				}),
				noop
			);

			expect(result.success).toBe(true);
			expect(result.cost).toBeGreaterThan(0);
		});
	});

	describe("CLIPipelineRunner — generate validation", () => {
		it("defaults to nano_banana_pro when model is missing for generate-image", async () => {
			const mockExecuteStep = vi
				.spyOn(PipelineExecutor.prototype, "executeStep")
				.mockResolvedValue({
					success: true,
					outputPath: "/tmp/output.png",
					duration: 1.0,
					cost: 0.01,
				});

			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "generate-image", text: "test" }),
				noop
			);

			expect(result.success).toBe(true);
			mockExecuteStep.mockRestore();
		});

		it("errors on unknown model for create-video", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({
					command: "create-video",
					model: "fake_model",
					text: "test",
				}),
				noop
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("fake_model");
		});

		it("errors on missing model for generate-avatar", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "generate-avatar" }),
				noop
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("--model");
		});
	});

	describe("CLIPipelineRunner — generate (mocked executor)", () => {
		it("calls executor and returns output on success", async () => {
			const mockExecuteStep = vi
				.spyOn(PipelineExecutor.prototype, "executeStep")
				.mockResolvedValue({
					success: true,
					outputPath: "/tmp/output.png",
					duration: 2.5,
					cost: 0.04,
				});

			const runner = new CLIPipelineRunner();
			const progress = vi.fn();
			const result = await runner.run(
				defaultOptions({
					command: "generate-image",
					model: "flux_dev",
					text: "A cat",
				}),
				progress
			);

			expect(result.success).toBe(true);
			expect(result.outputPath).toBe("/tmp/output.png");
			expect(result.cost).toBe(0.04);
			expect(progress).toHaveBeenCalled();
			const startCall = progress.mock.calls.find(
				(c: unknown[]) => (c[0] as { stage: string }).stage === "starting"
			);
			expect(startCall).toBeDefined();

			mockExecuteStep.mockRestore();
		});

		it("returns error when executor fails", async () => {
			const mockExecuteStep = vi
				.spyOn(PipelineExecutor.prototype, "executeStep")
				.mockResolvedValue({
					success: false,
					error: "API error 401: Invalid API key",
					duration: 0.5,
				});

			const runner = new CLIPipelineRunner();
			const result = await runner.run(
				defaultOptions({
					command: "generate-image",
					model: "flux_dev",
					text: "A cat",
				}),
				vi.fn()
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("API error 401");

			mockExecuteStep.mockRestore();
		});

		it("downloads output when only URL is returned", async () => {
			const mockExecuteStep = vi
				.spyOn(PipelineExecutor.prototype, "executeStep")
				.mockResolvedValue({
					success: true,
					outputUrl: "https://cdn.example.com/result.mp4",
					duration: 5.0,
					cost: 0.7,
				});

			const mockDownload = vi
				.spyOn(apiCaller, "downloadOutput")
				.mockResolvedValue("/tmp/output_12345.mp4");

			const runner = new CLIPipelineRunner();
			const result = await runner.run(
				defaultOptions({
					command: "create-video",
					model: "kling_2_6_pro",
					text: "Ocean waves",
				}),
				vi.fn()
			);

			expect(result.success).toBe(true);
			expect(mockDownload).toHaveBeenCalled();
			expect(result.outputPath).toBe("/tmp/output_12345.mp4");

			mockExecuteStep.mockRestore();
			mockDownload.mockRestore();
		});
	});

	describe("CLIPipelineRunner — run-pipeline validation", () => {
		it("errors on missing config", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "run-pipeline" }),
				noop
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("--config");
		});

		it("errors on non-existent config file", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({
					command: "run-pipeline",
					config: "/nonexistent/path.yaml",
				}),
				noop
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Cannot read config");
		});
	});

	describe("CLIPipelineRunner — unknown command", () => {
		it("errors on unrecognized command", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "do-magic" }),
				noop
			);

			expect(result.success).toBe(false);
			expect(result.error).toContain("Unknown command");
		});
	});

	describe("CLIPipelineRunner — abort", () => {
		it("abort cancels the abort controller signal", () => {
			const runner = new CLIPipelineRunner();
			expect(runner.signal.aborted).toBe(false);
			runner.abort();
			expect(runner.signal.aborted).toBe(true);
		});
	});

	describe("createProgressReporter", () => {
		it("produces no output in quiet mode", () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const reporter = createProgressReporter({ json: false, quiet: true });
			reporter({
				stage: "processing",
				percent: 50,
				message: "Working...",
				model: "test",
			});
			expect(consoleSpy).not.toHaveBeenCalled();
			consoleSpy.mockRestore();
		});

		it("suppresses progress output in json mode", () => {
			const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
			const reporter = createProgressReporter({ json: true, quiet: false });
			reporter({
				stage: "processing",
				percent: 50,
				message: "Working...",
				model: "test",
			});
			// In --json mode, progress is suppressed so only the final
			// result JSON goes to stdout (use --stream for JSONL events)
			expect(consoleSpy).toHaveBeenCalledTimes(0);
			consoleSpy.mockRestore();
		});

		it("uses stdout.write for TTY inline progress", () => {
			const origIsTTY = process.stdout.isTTY;
			Object.defineProperty(process.stdout, "isTTY", {
				value: true,
				writable: true,
			});
			const writeSpy = vi
				.spyOn(process.stdout, "write")
				.mockImplementation(() => true);

			const reporter = createProgressReporter({ json: false, quiet: false });
			reporter({ stage: "processing", percent: 50, message: "Working..." });

			expect(writeSpy).toHaveBeenCalled();
			const written = writeSpy.mock.calls[0][0] as string;
			expect(written).toContain("50%");
			expect(written).toContain("Working...");

			writeSpy.mockRestore();
			Object.defineProperty(process.stdout, "isTTY", {
				value: origIsTTY,
				writable: true,
			});
		});

		it("writes newline on complete stage in TTY mode", () => {
			const origIsTTY = process.stdout.isTTY;
			Object.defineProperty(process.stdout, "isTTY", {
				value: true,
				writable: true,
			});
			const writeSpy = vi
				.spyOn(process.stdout, "write")
				.mockImplementation(() => true);

			const reporter = createProgressReporter({ json: false, quiet: false });
			reporter({ stage: "complete", percent: 100, message: "Done" });

			// Should have two writes: the progress bar and the newline
			expect(writeSpy).toHaveBeenCalledTimes(2);
			expect(writeSpy.mock.calls[1][0]).toBe("\n");

			writeSpy.mockRestore();
			Object.defineProperty(process.stdout, "isTTY", {
				value: origIsTTY,
				writable: true,
			});
		});
	});
});
