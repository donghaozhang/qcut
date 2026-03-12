import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { crc32, deflateSync } from "node:zlib";
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

/**
 * Create a minimal valid PNG file with a solid color.
 * Generates a raw uncompressed PNG to avoid needing sharp in the test env.
 */
function createTestPng({
	dir,
	name,
	width,
	height,
	color,
}: {
	dir: string;
	name: string;
	width: number;
	height: number;
	color: { r: number; g: number; b: number };
}): string {
	const filePath = path.join(dir, name);

	// Build a minimal valid PNG manually
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

	// IHDR chunk
	const ihdrData = Buffer.alloc(13);
	ihdrData.writeUInt32BE(width, 0);
	ihdrData.writeUInt32BE(height, 4);
	ihdrData[8] = 8; // bit depth
	ihdrData[9] = 2; // color type: RGB
	ihdrData[10] = 0; // compression
	ihdrData[11] = 0; // filter
	ihdrData[12] = 0; // interlace
	const ihdr = buildPngChunk("IHDR", ihdrData);

	// IDAT chunk - raw image data with zlib
	const rawRow = Buffer.alloc(1 + width * 3); // filter byte + RGB
	rawRow[0] = 0; // no filter
	for (let x = 0; x < width; x++) {
		rawRow[1 + x * 3] = color.r;
		rawRow[1 + x * 3 + 1] = color.g;
		rawRow[1 + x * 3 + 2] = color.b;
	}
	const rawData = Buffer.alloc(rawRow.length * height);
	for (let y = 0; y < height; y++) {
		rawRow.copy(rawData, y * rawRow.length);
	}
	const compressed = deflateSync(rawData);
	const idat = buildPngChunk("IDAT", compressed);

	// IEND chunk
	const iend = buildPngChunk("IEND", Buffer.alloc(0));

	fs.writeFileSync(filePath, Buffer.concat([signature, ihdr, idat, iend]));
	return filePath;
}

function buildPngChunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length, 0);
	const typeBuffer = Buffer.from(type, "ascii");
	const crcInput = Buffer.concat([typeBuffer, data]);
	const crcValue = Buffer.alloc(4);
	crcValue.writeUInt32BE(crc32(crcInput) >>> 0, 0);
	return Buffer.concat([length, typeBuffer, data, crcValue]);
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

	it("parses editor:diff:screenshot args", () => {
		const opts = parseCliArgs([
			"editor:diff:screenshot",
			"--before",
			"/tmp/before.png",
			"--after",
			"/tmp/after.png",
			"--threshold",
			"20",
		]);

		expect(opts.command).toBe("editor:diff:screenshot");
		expect(opts.before).toBe("/tmp/before.png");
		expect(opts.after).toBe("/tmp/after.png");
		expect(opts.threshold).toBe(20);
	});

	it("requires before and after for screenshot diff", async () => {
		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:diff:screenshot",
				before: "/tmp/before.png",
			}),
			noopProgress
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("--after");
	});

	it("fails for missing screenshot file", async () => {
		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:diff:screenshot",
				before: "/tmp/nonexistent-before.png",
				after: "/tmp/nonexistent-after.png",
			}),
			noopProgress
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("not found");
	});

	it("reports sharp unavailable gracefully when sharp cannot load", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-ssdiff-"));
		tempDirs.add(dir);
		const beforePath = createTestPng({
			dir,
			name: "before.png",
			width: 4,
			height: 4,
			color: { r: 255, g: 0, b: 0 },
		});
		const afterPath = createTestPng({
			dir,
			name: "after.png",
			width: 4,
			height: 4,
			color: { r: 0, g: 0, b: 255 },
		});

		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:diff:screenshot",
				before: beforePath,
				after: afterPath,
			}),
			noopProgress
		);

		// In vitest (node env), sharp won't load — handler should fail gracefully
		// In production (bun env), this would succeed
		if (result.success) {
			// If sharp IS available (e.g. future vitest config change), validate output
			const data = result.data as {
				mode: string;
				same: boolean;
				summary: { changedPixels: number };
			};
			expect(data.mode).toBe("screenshot");
			expect(data.same).toBe(false);
			expect(data.summary.changedPixels).toBeGreaterThan(0);
		} else {
			expect(result.error).toContain("sharp");
		}
	});

	it("rejects unknown diff action", async () => {
		const result = await handleEditorCommand(
			makeOpts({
				command: "editor:diff:unknown",
				before: "/tmp/a",
				after: "/tmp/b",
			}),
			noopProgress
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("screenshot");
		expect(result.error).toContain("snapshot");
	});
});
