import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	completeFFmpegPassOutput,
	restoreFFmpegPassInput,
} from "../ffmpeg/pass-input-restore";

describe("FFmpeg pass input restore", () => {
	let temporaryRoot: string;
	let temporaryInput: string;
	let outputFile: string;

	beforeEach(() => {
		temporaryRoot = fs.mkdtempSync(
			path.join(os.tmpdir(), "qcut-pass-restore-test-")
		);
		temporaryInput = path.join(temporaryRoot, "before-pass.mp4");
		outputFile = path.join(temporaryRoot, "output.mp4");
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(temporaryRoot, { recursive: true, force: true });
	});

	it("replaces a partial output with the original pass input", () => {
		fs.writeFileSync(temporaryInput, "original");
		fs.writeFileSync(outputFile, "partial");

		restoreFFmpegPassInput({ temporaryInput, outputFile });

		expect(fs.readFileSync(outputFile, "utf8")).toBe("original");
		expect(fs.existsSync(temporaryInput)).toBe(false);
	});

	it("commits a non-empty pass output before removing its input", () => {
		fs.writeFileSync(temporaryInput, "original");
		fs.writeFileSync(outputFile, "rendered");

		completeFFmpegPassOutput({ temporaryInput, outputFile });

		expect(fs.readFileSync(outputFile, "utf8")).toBe("rendered");
		expect(fs.existsSync(temporaryInput)).toBe(false);
	});

	it.each([
		["missing", false],
		["empty", true],
	] as const)("preserves the pass input when its output is %s", (_description, createOutput) => {
		fs.writeFileSync(temporaryInput, "original");
		if (createOutput) {
			fs.writeFileSync(outputFile, "");
		}

		expect(() =>
			completeFFmpegPassOutput({ temporaryInput, outputFile })
		).toThrowError(/FFmpeg pass output/);
		expect(fs.readFileSync(temporaryInput, "utf8")).toBe("original");
	});

	it("rejects a fallback when the original pass input is missing", () => {
		fs.writeFileSync(outputFile, "partial");

		expect(() =>
			restoreFFmpegPassInput({ temporaryInput, outputFile })
		).toThrowError(`FFmpeg pass input is missing: ${temporaryInput}`);
		expect(fs.readFileSync(outputFile, "utf8")).toBe("partial");
	});

	it("preserves both files when the atomic rename fails", () => {
		fs.writeFileSync(temporaryInput, "original");
		fs.writeFileSync(outputFile, "partial");
		vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
			throw new Error("locked");
		});

		expect(() =>
			restoreFFmpegPassInput({ temporaryInput, outputFile })
		).toThrowError("locked");
		expect(fs.readFileSync(temporaryInput, "utf8")).toBe("original");
		expect(fs.readFileSync(outputFile, "utf8")).toBe("partial");
	});
});
