import { describe, it, expect } from "vitest";
import { buildConcatFile } from "../replicate-assembler";
import type { GeneratedShot } from "../replicate-types";

function makeShot(overrides: Partial<GeneratedShot> = {}): GeneratedShot {
	return {
		index: 0,
		startTime: 0,
		endTime: 5,
		duration: 5,
		type: "wide",
		camera: "static",
		description: "Test shot",
		prompt: "A test shot",
		transition: "cut",
		hasText: false,
		hasSubtitle: false,
		strategy: "ai-video",
		...overrides,
	};
}

describe("buildConcatFile", () => {
	it("builds concat file for valid shots", () => {
		const shots: GeneratedShot[] = [
			makeShot({ outputPath: "/tmp/shot0.mp4", duration: 3.5 }),
			makeShot({
				index: 1,
				outputPath: "/tmp/shot1.mp4",
				duration: 4.2,
			}),
		];
		const result = buildConcatFile(shots);
		expect(result).toContain("file '/tmp/shot0.mp4'");
		expect(result).toContain("duration 3.500");
		expect(result).toContain("file '/tmp/shot1.mp4'");
		expect(result).toContain("duration 4.200");
	});

	it("skips shots without outputPath", () => {
		const shots: GeneratedShot[] = [
			makeShot({ outputPath: "/tmp/shot0.mp4" }),
			makeShot({ index: 1, outputPath: undefined, error: "failed" }),
			makeShot({ index: 2, outputPath: "/tmp/shot2.mp4" }),
		];
		const result = buildConcatFile(shots);
		expect(result).toContain("shot0.mp4");
		expect(result).toContain("shot2.mp4");
		expect(result).not.toContain("shot1");
	});

	it("converts backslashes to forward slashes", () => {
		const shots: GeneratedShot[] = [
			makeShot({ outputPath: "C:\\Users\\test\\shot0.mp4" }),
		];
		const result = buildConcatFile(shots);
		expect(result).toContain("C:/Users/test/shot0.mp4");
		expect(result).not.toContain("\\");
	});

	it("escapes single quotes in paths", () => {
		const shots: GeneratedShot[] = [
			makeShot({ outputPath: "/tmp/shot's file.mp4" }),
		];
		const result = buildConcatFile(shots);
		expect(result).toContain("shot'\\''s file.mp4");
	});

	it("returns empty concat for no valid shots", () => {
		const shots: GeneratedShot[] = [
			makeShot({ outputPath: undefined, error: "failed" }),
		];
		const result = buildConcatFile(shots);
		expect(result.trim()).toBe("");
	});

	it("omits duration line when duration is 0", () => {
		const shots: GeneratedShot[] = [
			makeShot({ outputPath: "/tmp/shot0.mp4", duration: 0 }),
		];
		const result = buildConcatFile(shots);
		expect(result).toContain("file '/tmp/shot0.mp4'");
		expect(result).not.toContain("duration");
	});
});
