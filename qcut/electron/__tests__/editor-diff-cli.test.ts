import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import { handleEditorCommand } from "../native-pipeline/cli/cli-handlers-editor.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";

function makeOpts(overrides: Partial<CLIRunOptions>): CLIRunOptions {
	return {
		command: "editor:diff:snapshot",
		outputDir: "./output",
		json: false,
		verbose: false,
		quiet: false,
		saveIntermediates: false,
		host: "127.0.0.1",
		port: "19880",
		...overrides,
	} as CLIRunOptions;
}

function writeJsonFile({
	dir,
	name,
	value,
}: {
	dir: string;
	name: string;
	value: unknown;
}): string {
	const filePath = path.join(dir, name);
	fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
	return filePath;
}

const noopProgress = () => {};

describe("editor diff CLI", () => {
	const tempDirs = new Set<string>();

	afterEach(() => {
		for (const dir of tempDirs) {
			fs.rmSync(dir, { recursive: true, force: true });
		}
		tempDirs.clear();
	});

	it("parses editor:diff:snapshot args", () => {
		const opts = parseCliArgs([
			"editor:diff:snapshot",
			"--before",
			"/tmp/before.json",
			"--after",
			"/tmp/after.json",
		]);

		expect(opts.command).toBe("editor:diff:snapshot");
		expect(opts.before).toBe("/tmp/before.json");
		expect(opts.after).toBe("/tmp/after.json");
	});

	it("diffs snapshot files without requiring editor health", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-diff-"));
		tempDirs.add(dir);
		const beforePath = writeJsonFile({
			dir,
			name: "before.json",
			value: {
				version: 1,
				timestamp: 1,
				interactiveOnly: false,
				maxDepth: 8,
				elements: [
					{
						ref: "@e1",
						parentRef: null,
						depth: 0,
						actionable: true,
						role: "button",
						tagName: "button",
						name: "Export",
						textPreview: "Export",
						testId: "export-btn",
						placeholder: null,
						value: null,
						disabled: false,
						checked: null,
						selected: null,
						expanded: null,
						bounds: { x: 10, y: 20, width: 100, height: 30 },
					},
					{
						ref: "@e2",
						parentRef: null,
						depth: 0,
						actionable: true,
						role: "textbox",
						tagName: "input",
						name: "Title",
						textPreview: null,
						testId: "title-input",
						placeholder: "Title",
						value: "Draft",
						disabled: false,
						checked: null,
						selected: null,
						expanded: null,
						bounds: { x: 10, y: 60, width: 200, height: 30 },
					},
				],
				summary: { total: 2, actionable: 2 },
			},
		});
		const afterPath = writeJsonFile({
			dir,
			name: "after.json",
			value: {
				success: true,
				data: {
					version: 1,
					timestamp: 2,
					interactiveOnly: false,
					maxDepth: 8,
					elements: [
						{
							ref: "@e9",
							parentRef: null,
							depth: 0,
							actionable: true,
							role: "button",
							tagName: "button",
							name: "Export",
							textPreview: "Export",
							testId: "export-btn",
							placeholder: null,
							value: null,
							disabled: false,
							checked: null,
							selected: null,
							expanded: null,
							bounds: { x: 10, y: 20, width: 100, height: 30 },
						},
						{
							ref: "@e8",
							parentRef: null,
							depth: 0,
							actionable: true,
							role: "textbox",
							tagName: "input",
							name: "Title",
							textPreview: null,
							testId: "title-input",
							placeholder: "Title",
							value: "Published",
							disabled: false,
							checked: null,
							selected: null,
							expanded: null,
							bounds: { x: 10, y: 60, width: 200, height: 30 },
						},
						{
							ref: "@e10",
							parentRef: null,
							depth: 0,
							actionable: true,
							role: "link",
							tagName: "a",
							name: "Preview",
							textPreview: "Preview",
							testId: "preview-link",
							placeholder: null,
							value: null,
							disabled: false,
							checked: null,
							selected: null,
							expanded: null,
							bounds: { x: 10, y: 100, width: 80, height: 30 },
						},
					],
					summary: { total: 3, actionable: 3 },
				},
			},
		});

		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:diff:snapshot",
				before: beforePath,
				after: afterPath,
			}),
			noopProgress
		);

		expect(result.success).toBe(true);
		const data = result.data as {
			mode: string;
			same: boolean;
			summary: { added: number; removed: number; changed: number };
			changed: Array<{ fields: string[] }>;
		};
		expect(data.mode).toBe("snapshot");
		expect(data.same).toBe(false);
		expect(data.summary).toEqual({
			beforeTotal: 2,
			afterTotal: 3,
			added: 1,
			removed: 0,
			changed: 1,
		});
		expect(data.changed[0]?.fields).toContain("value");
	});

	it("requires before and after snapshot paths", async () => {
		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:diff:snapshot",
				after: "/tmp/after.json",
			}),
			noopProgress
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("--before");
	});
});
