import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CLIRunOptions } from "../../cli-runner/types";

const storyboardMock = {
	processedScripts: [] as Array<{
		title?: string;
		scenes?: unknown[];
		_portrait_registry?: unknown;
	}>,
	configs: [] as Array<Record<string, unknown>>,
};

vi.mock("../../../vimax/agents/storyboard-artist.js", () => ({
	StoryboardArtist: class {
		constructor(config: Record<string, unknown>) {
			storyboardMock.configs.push(config);
		}

		async process(script: {
			title?: string;
			scenes?: unknown[];
			_portrait_registry?: unknown;
		}) {
			storyboardMock.processedScripts.push(script);
			return {
				success: true,
				result: {
					title: script.title,
					scenes: script.scenes ?? [],
					images: [{ path: "scene_001.png", cost: 0.01 }],
					total_cost: 0.01,
				},
			};
		}
	},
}));

vi.mock("../../../vimax/types/character.js", () => ({
	CharacterPortraitRegistry: {
		fromJSON(value: unknown) {
			return { portraits: new Map([["Ava", value]]) };
		},
	},
}));

import { handleVimaxGenerateStoryboard } from "../script-handlers";

const noopProgress = () => {};

function makeOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return {
		outputDir: "/tmp/qcut-test-storyboard",
		saveIntermediates: false,
		json: false,
		verbose: false,
		quiet: true,
		command: "vimax:generate-storyboard",
		...overrides,
	} as CLIRunOptions;
}

function writeScenesFile({
	root,
	name = "scenes.json",
}: {
	root: string;
	name?: string;
}): string {
	const filePath = path.join(root, name);
	fs.writeFileSync(
		filePath,
		JSON.stringify({
			title: "Scene Source",
			logline: "Scenes extracted from a novel",
			total_duration: 5,
			scenes: [
				{
					scene_id: "scene_1",
					title: "Opening",
					location: "Studio",
					time: "Day",
					shots: [
						{
							shot_id: "shot_1",
							shot_type: "medium",
							description: "Ava turns toward the camera.",
							camera_movement: "static",
							characters: ["Ava"],
							duration_seconds: 5,
						},
					],
				},
			],
		}),
		"utf-8"
	);
	return filePath;
}

describe("handleVimaxGenerateStoryboard", () => {
	let tmpRoot: string;
	let savedProjectsDir: string | undefined;

	beforeEach(() => {
		storyboardMock.processedScripts.length = 0;
		storyboardMock.configs.length = 0;
		savedProjectsDir = process.env.QCUT_PROJECTS_DIR;
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-storyboard-"));
		process.env.QCUT_PROJECTS_DIR = path.join(tmpRoot, "projects");
	});

	afterEach(() => {
		if (savedProjectsDir === undefined) delete process.env.QCUT_PROJECTS_DIR;
		else process.env.QCUT_PROJECTS_DIR = savedProjectsDir;
		fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns an error when no storyboard source is provided", async () => {
		const result = await handleVimaxGenerateStoryboard(
			makeOptions(),
			noopProgress
		);

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/--scenes|--script|--project/);
	});

	it("uses flow scenes JSON when --scenes is provided", async () => {
		const scenesPath = writeScenesFile({ root: tmpRoot });
		const outputDir = path.join(tmpRoot, "storyboard");

		const result = await handleVimaxGenerateStoryboard(
			makeOptions({ scenes: scenesPath, outputDir }),
			noopProgress
		);

		expect(result.success).toBe(true);
		expect(result.data?.input).toBe(scenesPath);
		expect(result.data?.input_kind).toBe("scenes");
		expect(storyboardMock.processedScripts[0]?.title).toBe("Scene Source");
		expect(storyboardMock.processedScripts[0]?.scenes).toHaveLength(1);
	});

	it("reads project scenes.json when --project is provided", async () => {
		const projectRoot = path.join(
			process.env.QCUT_PROJECTS_DIR as string,
			"scene-story"
		);
		fs.mkdirSync(projectRoot, { recursive: true });
		const scenesPath = writeScenesFile({ root: projectRoot });

		const result = await handleVimaxGenerateStoryboard(
			makeOptions({ projectId: "scene-story" }),
			noopProgress
		);

		expect(result.success).toBe(true);
		expect(result.data?.input).toBe(scenesPath);
		expect(result.data?.input_kind).toBe("scenes");
		expect(result.outputPath).toBe(path.join(projectRoot, "storyboard"));
		expect(storyboardMock.processedScripts[0]?.title).toBe("Scene Source");
	});

	it("still accepts legacy --script input", async () => {
		const scriptPath = writeScenesFile({ root: tmpRoot, name: "script.json" });

		const result = await handleVimaxGenerateStoryboard(
			makeOptions({ script: scriptPath }),
			noopProgress
		);

		expect(result.success).toBe(true);
		expect(result.data?.input_kind).toBe("script");
	});
});
