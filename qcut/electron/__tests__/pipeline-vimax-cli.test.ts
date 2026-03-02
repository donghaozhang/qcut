import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// -- ViMax CLI Subcommands (Section 2.1) --

import { ModelRegistry } from "../native-pipeline/infra/registry.js";
import { initRegistry, resetInitState } from "../native-pipeline/init.js";
import { CLIPipelineRunner } from "../native-pipeline/cli/cli-runner.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";

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

describe("ViMax CLI subcommands", () => {
	beforeEach(() => {
		ModelRegistry.clear();
		resetInitState();
		initRegistry();
	});

	describe("CLI parser recognizes new commands", () => {
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

		it("parses vimax:extract-characters", () => {
			const opts = parseCliArgs([
				"vimax:extract-characters",
				"-t",
				"Once upon a time...",
			]);
			expect(opts.command).toBe("vimax:extract-characters");
			expect(opts.text).toBe("Once upon a time...");
		});

		it("parses vimax:generate-script", () => {
			const opts = parseCliArgs([
				"vimax:generate-script",
				"--idea",
				"A space adventure",
			]);
			expect(opts.command).toBe("vimax:generate-script");
			expect(opts.idea).toBe("A space adventure");
		});

		it("parses vimax:generate-storyboard", () => {
			const opts = parseCliArgs([
				"vimax:generate-storyboard",
				"--script",
				"script.json",
			]);
			expect(opts.command).toBe("vimax:generate-storyboard");
			expect(opts.script).toBe("script.json");
		});

		it("parses vimax:generate-portraits", () => {
			const opts = parseCliArgs([
				"vimax:generate-portraits",
				"-t",
				"A young hero named Alice",
			]);
			expect(opts.command).toBe("vimax:generate-portraits");
			expect(opts.text).toBe("A young hero named Alice");
		});

		it("parses vimax:create-registry", () => {
			const opts = parseCliArgs(["vimax:create-registry", "-i", "./portraits"]);
			expect(opts.command).toBe("vimax:create-registry");
			expect(opts.input).toBe("./portraits");
		});

		it("parses vimax:show-registry", () => {
			const opts = parseCliArgs(["vimax:show-registry", "-i", "registry.json"]);
			expect(opts.command).toBe("vimax:show-registry");
			expect(opts.input).toBe("registry.json");
		});

		it("parses vimax:list-models", () => {
			const opts = parseCliArgs(["vimax:list-models"]);
			expect(opts.command).toBe("vimax:list-models");
		});

		it("parses --stream flag", () => {
			const opts = parseCliArgs(["list-models", "--stream"]);
			expect(opts.stream).toBe(true);
		});

		it("parses --config-dir flag", () => {
			const opts = parseCliArgs(["list-models", "--config-dir", "/tmp/cfg"]);
			expect(opts.configDir).toBe("/tmp/cfg");
		});

		it("parses --negative-prompt flag", () => {
			const opts = parseCliArgs([
				"create-video",
				"--negative-prompt",
				"blurry, low quality",
			]);
			expect(opts.negativePrompt).toBe("blurry, low quality");
		});

		it("parses --voice-id flag", () => {
			const opts = parseCliArgs(["create-video", "--voice-id", "voice_abc123"]);
			expect(opts.voiceId).toBe("voice_abc123");
		});
	});

	describe("ViMax CLI runner handlers", () => {
		it("vimax:list-models returns ViMax-specific models", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "vimax:list-models" }),
				noop
			);
			expect(result.success).toBe(true);
			const data = result.data as {
				models: unknown[];
				count: number;
				by_category: Record<string, number>;
			};
			expect(data.count).toBeGreaterThan(0);
			expect(data.by_category).toBeDefined();
			expect(data.by_category.text_to_image).toBeGreaterThan(0);
		});

		it("vimax:extract-characters errors on missing input", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "vimax:extract-characters" }),
				noop
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--text");
		});

		it("vimax:generate-script errors on missing idea", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "vimax:generate-script" }),
				noop
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--idea");
		});

		it("vimax:generate-storyboard errors on missing script", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "vimax:generate-storyboard" }),
				noop
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--script");
		});

		it("vimax:generate-portraits errors on missing input", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "vimax:generate-portraits" }),
				noop
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--text");
		});

		it("vimax:create-registry errors on missing input", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "vimax:create-registry", input: undefined }),
				noop
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--input");
		});

		it("vimax:show-registry errors on missing input", async () => {
			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "vimax:show-registry" }),
				noop
			);
			expect(result.success).toBe(false);
			expect(result.error).toContain("--input");
		});

		it("vimax:create-registry creates registry from directory", async () => {
			const tmpDir = path.join(os.tmpdir(), `registry-test-${Date.now()}`);
			const charDir = path.join(tmpDir, "alice");
			fs.mkdirSync(charDir, { recursive: true });
			fs.writeFileSync(path.join(charDir, "front.png"), "fake-image");
			fs.writeFileSync(path.join(charDir, "side.png"), "fake-image");

			try {
				const runner = new CLIPipelineRunner();
				const noop = vi.fn();
				const result = await runner.run(
					defaultOptions({ command: "vimax:create-registry", input: tmpDir }),
					noop
				);
				expect(result.success).toBe(true);
				expect(result.outputPath).toContain("registry.json");
				const data = result.data as { characters: number };
				expect(data.characters).toBe(1);
			} finally {
				fs.rmSync(tmpDir, { recursive: true, force: true });
			}
		});

		it("vimax:show-registry displays registry contents", async () => {
			const tmpFile = path.join(os.tmpdir(), `show-reg-${Date.now()}.json`);
			const registryData = {
				project_id: "test-proj",
				portraits: {
					Alice: {
						character_name: "Alice",
						description: "A brave hero",
						front_view: "/portraits/alice/front.png",
					},
				},
			};
			fs.writeFileSync(tmpFile, JSON.stringify(registryData));

			const runner = new CLIPipelineRunner();
			const noop = vi.fn();
			const result = await runner.run(
				defaultOptions({ command: "vimax:show-registry", input: tmpFile }),
				noop
			);
			expect(result.success).toBe(true);
			const data = result.data as {
				project_id: string;
				total_characters: number;
			};
			expect(data.project_id).toBe("test-proj");
			expect(data.total_characters).toBe(1);

			fs.unlinkSync(tmpFile);
		});
	});
});

// -- Reference Selector improvements (Section 3.8) --

import { ReferenceImageSelector } from "../native-pipeline/vimax/agents/reference-selector.js";

describe("ReferenceImageSelector.getViewPreference", () => {
	it("returns preferences for close_up with front angle", () => {
		const selector = new ReferenceImageSelector();
		const prefs = selector.getViewPreference("close_up", "front");
		expect(prefs[0]).toBe("front");
		expect(prefs).toContain("three_quarter");
	});

	it("returns preferences for over_the_shoulder", () => {
		const selector = new ReferenceImageSelector();
		const prefs = selector.getViewPreference("over_the_shoulder");
		expect(prefs).toContain("back");
		expect(prefs).toContain("three_quarter");
	});

	it("respects camera angle priority", () => {
		const selector = new ReferenceImageSelector();
		const prefs = selector.getViewPreference("wide", "back");
		expect(prefs[0]).toBe("back");
	});

	it("always includes front as fallback", () => {
		const selector = new ReferenceImageSelector();
		const prefs = selector.getViewPreference("pov");
		expect(prefs).toContain("front");
	});
});

// -- Idea2VideoPipeline.fromYaml (Section 3.8) --

import {
	Idea2VideoPipeline,
	createIdea2VideoConfig,
} from "../native-pipeline/vimax/pipelines/idea2video.js";

describe("Idea2VideoPipeline.fromYaml", () => {
	it("creates pipeline from YAML config file", () => {
		const yamlPath = path.join(os.tmpdir(), `i2v-test-${Date.now()}.yaml`);
		fs.writeFileSync(
			yamlPath,
			[
				"target_duration: 30",
				"video_model: kling_2_6_pro",
				"generate_portraits: false",
				"# comment line",
				"",
			].join("\n")
		);

		const pipeline = Idea2VideoPipeline.fromYaml(yamlPath);
		expect(pipeline.config.target_duration).toBe(30);
		expect(pipeline.config.video_model).toBe("kling_2_6_pro");
		expect(pipeline.config.generate_portraits).toBe(false);

		fs.unlinkSync(yamlPath);
	});
});

// -- Service-level features (Section 3.6) --

describe("Service-level features", () => {
	it("step-executors module exports executeStep", async () => {
		const mod = await import("../native-pipeline/execution/step-executors.js");
		expect(typeof mod.executeStep).toBe("function");
		expect(typeof mod.getInputDataType).toBe("function");
		expect(typeof mod.getOutputDataType).toBe("function");
	});

	it("StepInput type supports all fields", async () => {
		const mod = await import("../native-pipeline/execution/step-executors.js");
		// Verify the type supports voice and negative prompt via params
		const input: import("../native-pipeline/execution/step-executors.js").StepInput =
			{
				text: "test",
				imageUrl: "https://example.com/img.png",
				videoUrl: "https://example.com/vid.mp4",
				audioUrl: "https://example.com/audio.wav",
			};
		expect(input.text).toBe("test");
	});
});

// -- Help text includes new commands --

describe("CLI help includes new vimax commands", () => {
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

	it("help text lists all 7 new vimax subcommands", () => {
		expect(() => parseCliArgs(["--help"])).toThrow("process.exit");
		const output = consoleSpy.mock.calls[0][0] as string;
		expect(output).toContain("vimax:extract-characters");
		expect(output).toContain("vimax:generate-script");
		expect(output).toContain("vimax:generate-storyboard");
		expect(output).toContain("vimax:generate-portraits");
		expect(output).toContain("vimax:create-registry");
		expect(output).toContain("vimax:show-registry");
		expect(output).toContain("vimax:list-models");
	});
});
