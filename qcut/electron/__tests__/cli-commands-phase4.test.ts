import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("CLI new commands — Phase 4", () => {
	beforeEach(() => {
		ModelRegistry.clear();
		resetInitState();
		initRegistry();
	});

	it("parses analyze-video command", () => {
		const opts = parseCliArgs([
			"analyze-video",
			"-i",
			"video.mp4",
			"--prompt",
			"What is happening?",
		]);
		expect(opts.command).toBe("analyze-video");
		expect(opts.input).toBe("video.mp4");
		expect(opts.prompt).toBe("What is happening?");
	});

	it("parses transcribe command", () => {
		const opts = parseCliArgs([
			"transcribe",
			"-i",
			"audio.wav",
			"-m",
			"scribe_v2",
		]);
		expect(opts.command).toBe("transcribe");
		expect(opts.input).toBe("audio.wav");
		expect(opts.model).toBe("scribe_v2");
	});

	it("parses generate-grid command", () => {
		const opts = parseCliArgs([
			"generate-grid",
			"-t",
			"A beautiful landscape",
			"--layout",
			"3x3",
			"-m",
			"flux_dev",
		]);
		expect(opts.command).toBe("generate-grid");
		expect(opts.text).toBe("A beautiful landscape");
		expect(opts.layout).toBe("3x3");
	});

	it("parses upscale-image command", () => {
		const opts = parseCliArgs([
			"upscale-image",
			"--image",
			"photo.png",
			"--upscale",
			"4",
		]);
		expect(opts.command).toBe("upscale-image");
		expect(opts.image).toBe("photo.png");
		expect(opts.upscale).toBe("4");
	});

	it("parses setup command", () => {
		const opts = parseCliArgs(["setup"]);
		expect(opts.command).toBe("setup");
	});

	it("parses set-key command", () => {
		const opts = parseCliArgs([
			"set-key",
			"--name",
			"FAL_KEY",
			"--value",
			"test-key-123",
		]);
		expect(opts.command).toBe("set-key");
		expect(opts.keyName).toBe("FAL_KEY");
		expect(opts.keyValue).toBe("test-key-123");
	});

	it("parses check-keys command", () => {
		const opts = parseCliArgs(["check-keys"]);
		expect(opts.command).toBe("check-keys");
	});

	it("parses create-examples command", () => {
		const opts = parseCliArgs(["create-examples", "-o", "./my-examples"]);
		expect(opts.command).toBe("create-examples");
		expect(opts.outputDir).toBe("./my-examples");
	});

	it("parses vimax:idea2video command", () => {
		const opts = parseCliArgs([
			"vimax:idea2video",
			"--idea",
			"A spaceship landing on Mars",
			"--video-model",
			"kling_2_6_pro",
		]);
		expect(opts.command).toBe("vimax:idea2video");
		expect(opts.idea).toBe("A spaceship landing on Mars");
		expect(opts.videoModel).toBe("kling_2_6_pro");
	});

	it("parses vimax:novel2movie command", () => {
		const opts = parseCliArgs([
			"vimax:novel2movie",
			"--novel",
			"novel.txt",
			"--title",
			"My Novel",
			"--max-scenes",
			"5",
			"--scripts-only",
		]);
		expect(opts.command).toBe("vimax:novel2movie");
		expect(opts.novel).toBe("novel.txt");
		expect(opts.title).toBe("My Novel");
		expect(opts.maxScenes).toBe(5);
		expect(opts.scriptsOnly).toBe(true);
	});

	it("parses --parallel and --max-workers flags", () => {
		const opts = parseCliArgs([
			"run-pipeline",
			"-c",
			"pipeline.yaml",
			"--parallel",
			"--max-workers",
			"4",
		]);
		expect(opts.parallel).toBe(true);
		expect(opts.maxWorkers).toBe(4);
	});

	it("list-avatar-models routes correctly", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "list-avatar-models" }),
			noop
		);
		expect(result.success).toBe(true);
		const data = result.data as {
			models: { categories: string[] }[];
			count: number;
		};
		expect(data.count).toBeGreaterThan(0);
		for (const m of data.models) {
			expect(m.categories).toContain("avatar");
		}
	});

	it("list-video-models routes correctly", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "list-video-models" }),
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

	it("list-speech-models routes correctly", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "list-speech-models" }),
			noop
		);
		expect(result.success).toBe(true);
		const data = result.data as {
			models: { categories: string[] }[];
			count: number;
		};
		expect(data.count).toBeGreaterThan(0);
		for (const m of data.models) {
			expect(m.categories).toContain("text_to_speech");
		}
	});

	it("check-keys returns key status", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "check-keys" }),
			noop
		);
		expect(result.success).toBe(true);
		const data = result.data as {
			keys: { name: string; configured: boolean }[];
		};
		expect(data.keys.length).toBeGreaterThan(0);
		const falKey = data.keys.find((k) => k.name === "FAL_KEY");
		expect(falKey).toBeDefined();
	});

	it("create-examples creates files", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const tmpDir = `/tmp/qcut-test-examples-${Date.now()}`;
		const result = await runner.run(
			defaultOptions({ command: "create-examples", outputDir: tmpDir }),
			noop
		);
		expect(result.success).toBe(true);
		const data = result.data as { created: string[]; count: number };
		expect(data.count).toBeGreaterThan(0);
		// Clean up
		const fs = await import("fs");
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it("analyze-video errors on missing input", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "analyze-video" }),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--input");
	});

	it("transcribe errors on missing input", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "transcribe" }),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--input");
	});

	it("generate-grid errors on missing text", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "generate-grid" }),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--text");
	});

	it("upscale-image errors on missing input", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "upscale-image" }),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--image");
	});

	it("set-key errors on missing name", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "set-key" }),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--name");
	});

	it("get-key errors on missing name", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "get-key" }),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--name");
	});

	it("vimax:idea2video errors on missing idea", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "vimax:idea2video" }),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--idea");
	});

	it("vimax:script2video errors on missing script", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "vimax:script2video" }),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--script");
	});

	it("vimax:novel2movie errors on missing novel file", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({
				command: "vimax:novel2movie",
				novel: "/nonexistent/path/novel.txt",
			}),
			noop
		);
		expect(result.success).toBe(false);
	});

	it("new service providers are registered", () => {
		expect(ModelRegistry.has("runway_gen4")).toBe(true);
		expect(ModelRegistry.has("heygen_avatar")).toBe(true);
		expect(ModelRegistry.has("did_studio")).toBe(true);
		expect(ModelRegistry.has("synthesia_avatar")).toBe(true);
	});

	it("GMI Cloud models are registered", () => {
		expect(ModelRegistry.has("gmi_veo31_lite_t2v")).toBe(true);
		expect(ModelRegistry.has("gmi_veo31_lite_i2v")).toBe(true);
		expect(ModelRegistry.has("gmi_skyreels_v4_t2v")).toBe(true);
		expect(ModelRegistry.has("gmi_skyreels_v4_i2v")).toBe(true);
		const veo = ModelRegistry.get("gmi_veo31_lite_t2v");
		expect(veo.providerBackend).toBe("gmi");
		expect(veo.provider).toContain("GMI");
	});

	// transfer-motion tests
	it("transfer-motion errors on missing image-url", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({
				command: "transfer-motion",
				videoUrl: "https://example.com/video.mp4",
			}),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--image-url");
	});

	it("transfer-motion errors on missing video-url", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({
				command: "transfer-motion",
				imageUrl: "https://example.com/image.png",
			}),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--video-url");
	});

	it("transfer-motion errors on unknown model", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({
				command: "transfer-motion",
				imageUrl: "https://example.com/image.png",
				videoUrl: "https://example.com/video.mp4",
				model: "nonexistent_model_xyz",
			}),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown model");
	});

	// delete-key tests
	it("delete-key errors on missing name", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "delete-key" }),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--name");
	});

	it("delete-key errors on unknown key name", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "delete-key", keyName: "INVALID_KEY_NAME" }),
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown key");
	});

	// init-project test
	it("init-project returns created directories", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({
				command: "init-project",
				directory: `/tmp/test-qcut-init-${Date.now()}`,
				dryRun: true,
			}),
			noop
		);
		expect(result.success).toBe(true);
		const data = result.data as { created: string[] };
		expect(data.created.length).toBeGreaterThan(0);
	});

	// structure-info test
	it("structure-info returns project info", async () => {
		const runner = new CLIPipelineRunner();
		const noop = vi.fn();
		const result = await runner.run(
			defaultOptions({ command: "structure-info", directory: "." }),
			noop
		);
		expect(result.success).toBe(true);
		const data = result.data as {
			projectDir: string;
			directories: { path: string; fileCount: number; exists: boolean }[];
			totalFiles: number;
		};
		expect(Array.isArray(data.directories)).toBe(true);
		expect(data.directories.length).toBeGreaterThan(0);
		expect(typeof data.totalFiles).toBe("number");
		expect(typeof data.projectDir).toBe("string");
	});
});
