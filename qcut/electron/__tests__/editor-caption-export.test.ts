import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeTimelineCaptions } from "../native-pipeline/editor/editor-caption-export.js";

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true }))
	);
});

describe("writeTimelineCaptions", () => {
	it("writes sorted caption elements as SRT", async () => {
		const dir = await mkdtemp(join(tmpdir(), "qcut-caption-test-"));
		tempDirs.push(dir);
		const outputPath = join(dir, "captions.srt");
		const result = await writeTimelineCaptions({
			format: "srt",
			outputPath,
			timeline: {
				tracks: [
					{
						type: "captions",
						elements: [
							{
								type: "captions",
								startTime: 2,
								endTime: 3,
								content: "Second",
							},
							{
								type: "captions",
								startTime: 0,
								duration: 1.5,
								text: "First",
							},
						],
					},
				],
			},
		});

		expect(result.captionCount).toBe(2);
		const content = await readFile(outputPath, "utf8");
		expect(content).toContain("00:00:00,000 --> 00:00:01,500\nFirst");
		expect(content.indexOf("First")).toBeLessThan(content.indexOf("Second"));
	});

	it("fails instead of creating an empty subtitle file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "qcut-caption-test-"));
		tempDirs.push(dir);
		await expect(
			writeTimelineCaptions({
				format: "vtt",
				outputPath: join(dir, "captions.vtt"),
				timeline: { tracks: [] },
			})
		).rejects.toThrow("No caption elements");
	});
});
