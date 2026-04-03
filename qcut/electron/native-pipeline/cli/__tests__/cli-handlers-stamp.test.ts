import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { handleStampImage } from "../cli-handlers-stamp.js";
import type { CLIRunOptions, ProgressFn } from "../cli-types.js";

const TMP_DIR = path.join(import.meta.dirname, "__stamp_test_tmp__");
const noop: ProgressFn = () => {};

/** Create a minimal 100x100 PNG using @napi-rs/canvas */
async function createTestImage(filePath: string): Promise<void> {
	const moduleName = "@napi-rs/canvas";
	const { createCanvas } = (await import(moduleName)) as {
		createCanvas: (
			w: number,
			h: number
		) => {
			getContext: (t: string) => {
				fillStyle: string;
				fillRect: (x: number, y: number, w: number, h: number) => void;
			};
			toBuffer: (mime: string) => Buffer;
		};
	};
	const canvas = createCanvas(200, 100);
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#336699";
	ctx.fillRect(0, 0, 200, 100);
	fs.writeFileSync(filePath, canvas.toBuffer("image/png"));
}

describe("stamp-image handler", () => {
	const testImage = path.join(TMP_DIR, "test_input.png");

	beforeAll(async () => {
		fs.mkdirSync(TMP_DIR, { recursive: true });
		await createTestImage(testImage);
	});

	afterAll(() => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
	});

	it("fails without --input", async () => {
		const result = await handleStampImage(
			{ command: "stamp-image" } as CLIRunOptions,
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--input");
	});

	it("stamps logo and text onto image", async () => {
		const result = await handleStampImage(
			{
				command: "stamp-image",
				input: testImage,
				text: "Test Model",
			} as CLIRunOptions,
			noop
		);
		expect(result.success).toBe(true);
		expect(result.outputPath).toContain("_stamped.png");
		expect(fs.existsSync(result.outputPath!)).toBe(true);
		// Stamped file should be larger than input (has logo + text)
		const inputSize = fs.statSync(testImage).size;
		const outputSize = fs.statSync(result.outputPath!).size;
		expect(outputSize).toBeGreaterThan(inputSize);
	});

	it("stamps text only when logo is none", async () => {
		const result = await handleStampImage(
			{
				command: "stamp-image",
				input: testImage,
				text: "Text Only",
				imageUrl: "none",
			} as CLIRunOptions,
			noop
		);
		expect(result.success).toBe(true);
		expect(fs.existsSync(result.outputPath!)).toBe(true);
	});

	it("respects position flag", async () => {
		const result = await handleStampImage(
			{
				command: "stamp-image",
				input: testImage,
				text: "Top Left",
				data: "top-left",
			} as CLIRunOptions,
			noop
		);
		expect(result.success).toBe(true);
	});

	it("rejects invalid position", async () => {
		const result = await handleStampImage(
			{
				command: "stamp-image",
				input: testImage,
				data: "center",
			} as CLIRunOptions,
			noop
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Invalid --position");
	});
});
