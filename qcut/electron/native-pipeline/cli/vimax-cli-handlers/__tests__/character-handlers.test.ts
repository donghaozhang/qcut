import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CLIRunOptions } from "../../cli-runner/types";

// Stub the character-extractor agent so we don't hit any LLM.
vi.mock("../../../vimax/agents/character-extractor.js", () => ({
	CharacterExtractor: class {
		async process(_text: string) {
			return {
				success: true,
				result: [
					{
						name: "Alice",
						description: "A detective",
						role: "protagonist",
						portrait_prompt: "a detective in 1920s paris",
					},
				],
				metadata: { cost: 0 },
			};
		}
	},
}));

// Stub the pipeline-handlers module so we don't pull in its network code.
vi.mock("../pipeline-handlers.js", () => ({
	extractNovelStyleHeader: (text: string) => {
		const m = text.match(/\*\*Visual Style:\*\*\s*([^\n]+)/);
		return m ? m[1].trim() : undefined;
	},
}));

import { handleVimaxExtractCharacters } from "../character-handlers";

const noopProgress = () => {};

function makeOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return {
		outputDir: "/tmp/qcut-test-chars",
		saveIntermediates: false,
		json: false,
		verbose: false,
		quiet: true,
		command: "vimax:extract-characters",
		...overrides,
	} as CLIRunOptions;
}

describe("handleVimaxExtractCharacters", () => {
	let tmpRoot: string;
	let savedEnv: string | undefined;
	let novelPath: string;

	beforeEach(() => {
		savedEnv = process.env.QCUT_PROJECTS_DIR;
		tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-char-handler-"));
		process.env.QCUT_PROJECTS_DIR = path.join(tmpRoot, "projects");

		novelPath = path.join(tmpRoot, "story.md");
		fs.writeFileSync(
			novelPath,
			"# Title\n\n**Visual Style:** noir 1920s paris\n\nAlice walks into the bar.",
			"utf-8"
		);
	});

	afterEach(() => {
		if (savedEnv === undefined) delete process.env.QCUT_PROJECTS_DIR;
		else process.env.QCUT_PROJECTS_DIR = savedEnv;
		fs.rmSync(tmpRoot, { recursive: true, force: true });
	});

	it("returns an error when no source is provided", async () => {
		const result = await handleVimaxExtractCharacters(
			makeOptions(),
			noopProgress
		);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/--novel|--input|--text/);
	});

	it("writes characters.json and project.json under the project dir with --novel + --project", async () => {
		const result = await handleVimaxExtractCharacters(
			makeOptions({ novel: novelPath, projectId: "test-story" }),
			noopProgress
		);
		expect(result.success).toBe(true);

		const projectRoot = path.join(
			process.env.QCUT_PROJECTS_DIR as string,
			"test-story"
		);
		expect(fs.existsSync(path.join(projectRoot, "characters.json"))).toBe(true);
		expect(fs.existsSync(path.join(projectRoot, "project.json"))).toBe(true);
		expect(fs.existsSync(path.join(projectRoot, "novel.md"))).toBe(true);

		const meta = JSON.parse(
			fs.readFileSync(path.join(projectRoot, "project.json"), "utf-8")
		);
		expect(meta.slug).toBe("test-story");
		expect(meta.stages_completed).toContain("characters");
		expect(meta.style).toBe("noir 1920s paris");
		expect(meta.novel_path).toBe(path.resolve(novelPath));

		const chars = JSON.parse(
			fs.readFileSync(path.join(projectRoot, "characters.json"), "utf-8")
		);
		expect(Array.isArray(chars)).toBe(true);
		expect(chars[0].name).toBe("Alice");
	});

	it("falls back to timestamped output dir when --project is not given", async () => {
		const outputDir = path.join(tmpRoot, "adhoc-output");
		const result = await handleVimaxExtractCharacters(
			makeOptions({ novel: novelPath, outputDir }),
			noopProgress
		);
		expect(result.success).toBe(true);
		expect(result.outputPath).toBe(path.join(outputDir, "characters.json"));
		// No project.json should have been created in project root
		expect(
			fs.existsSync(path.join(tmpRoot, "projects", "story", "project.json"))
		).toBe(false);
	});
});
