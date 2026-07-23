import { describe, expect, it } from "vitest";
import { buildScreenRecordingTranscodeArgs } from "../screen-recording-handler/transcode-settings.js";

describe("screen recording transcode settings", () => {
	it("uses visually lossless constant-quality MP4 settings", () => {
		const args = buildScreenRecordingTranscodeArgs({
			inputPath: "/tmp/capture.webm",
			outputPath: "/tmp/capture.mp4",
		});

		expect(args).toEqual(
			expect.arrayContaining([
				"-c:v",
				"libx264",
				"-preset",
				"fast",
				"-crf",
				"17",
			])
		);
		expect(args).not.toContain("-b:v");
		expect(args.at(-1)).toBe("/tmp/capture.mp4");
	});
});
