import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CLIRunOptions } from "../../cli-runner/types";

vi.mock("../../../vimax/agents/novel-segmenter.js", () => ({
	NovelSegmenter: class {
		async process(text: string) {
			return {
				success: true,
				result: {
					title: text.includes("raw") ? "Raw Story" : "File Story",
					logline: "A compact scene extraction",
					total_duration: 9,
					scenes: [
						{
							scene_id: "scene_1",
							title: "Opening",
							description: "",
							location: "Station",
							time: "Night",
							shots: [
								{
									shot_id: "shot_1",
									shot_type: "wide",
									description: "Alice enters the station.",
									camera_movement: "static",
									characters: ["Alice"],
									duration_seconds: 4,
								},
							],
						},
						{
							scene_id: "scene_2",
							title: "Signal",
							description: "",
							location: "Platform",
							time: "Night",
							shots: [
								{
									shot_id: "shot_2",
									shot_type: "close_up",
									description: "The signal turns red.",
									camera_movement: "push_in",
									characters: [],
									duration_seconds: 5,
								},
							],
						},
					],
				},
				metadata: { cost: 0.01 },
			};
		}
	},
}));

import { handleVimaxExtractScenes } from "../scene-handlers";

const noopProgress = () => {};

function makeOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return {
		outputDir: "/tmp/qcut-test-scenes",
		saveIntermediates: false,
		json: false,
		verbose: false,
		quiet: true,
		command: "vimax:extract-scenes",
		...overrides,
	} as CLIRunOptions;
}

describe("handleVimaxExtractScenes", () => {
	let tmpRoot: string;
	let savedEnv: string | undefined;
	let novelPath: string;

	beforeEach(() => {
		savedEnv = process.env.QCUT_PROJECTS_DIR;
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-scene-handler-"));
		process.env.QCUT_PROJECTS_DIR = path.join(tmpRoot, "projects");

		novelPath = path.join(tmpRoot, "story.md");
		fs.writeFileSync(novelPath, "Alice enters the station.", "utf-8");
	});

	afterEach(() => {
		if (savedEnv === undefined) delete process.env.QCUT_PROJECTS_DIR;
		else process.env.QCUT_PROJECTS_DIR = savedEnv;
		fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns an error when no source is provided", async () => {
		const result = await handleVimaxExtractScenes(makeOptions(), noopProgress);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/--novel|--input|--text/);
	});

	it("writes scenes.json to the output dir from --novel", async () => {
		const outputDir = path.join(tmpRoot, "out");

		const result = await handleVimaxExtractScenes(
			makeOptions({ novel: novelPath, outputDir }),
			noopProgress
		);

		expect(result.success).toBe(true);
		expect(result.outputPath).toBe(path.join(outputDir, "scenes.json"));

		const scenes = JSON.parse(
			fs.readFileSync(path.join(outputDir, "scenes.json"), "utf-8")
		);
		expect(scenes.title).toBe("File Story");
		expect(scenes.scenes).toHaveLength(2);
		expect(scenes.total_duration).toBe(9);
	});

	it("accepts raw --input text and applies --max-scenes", async () => {
		const outputDir = path.join(tmpRoot, "raw-out");

		const result = await handleVimaxExtractScenes(
			makeOptions({
				input: "raw scene text",
				outputDir,
				maxScenes: 1,
			}),
			noopProgress
		);

		expect(result.success).toBe(true);
		const scenes = JSON.parse(
			fs.readFileSync(path.join(outputDir, "scenes.json"), "utf-8")
		);
		expect(scenes.title).toBe("Raw Story");
		expect(scenes.scenes).toHaveLength(1);
		expect(scenes.total_duration).toBe(4);
	});

	it("writes scenes.json and project.json under the project dir", async () => {
		const result = await handleVimaxExtractScenes(
			makeOptions({ novel: novelPath, projectId: "scene-story" }),
			noopProgress
		);

		expect(result.success).toBe(true);
		const projectRoot = path.join(
			process.env.QCUT_PROJECTS_DIR as string,
			"scene-story"
		);
		expect(result.outputPath).toBe(path.join(projectRoot, "scenes.json"));
		expect(fs.existsSync(path.join(projectRoot, "project.json"))).toBe(true);
		expect(fs.existsSync(path.join(projectRoot, "novel.md"))).toBe(true);
	});
});
