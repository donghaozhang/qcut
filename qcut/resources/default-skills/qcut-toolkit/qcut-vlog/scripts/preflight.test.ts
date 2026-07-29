import { describe, expect, test } from "bun:test";
import { assertFfmpegMajor, parseFfmpegMajor } from "./preflight";

describe("qcut-vlog-publish preflight", () => {
	test("parses release and nightly FFmpeg version strings", () => {
		expect(
			parseFfmpegMajor({
				versionOutput: "ffmpeg version 8.1.2 Copyright (c) FFmpeg developers",
			})
		).toBe(8);
		expect(
			parseFfmpegMajor({
				versionOutput: "ffmpeg version n8.0-12-gabc123 Copyright",
			})
		).toBe(8);
	});

	test("rejects FFmpeg versions too old for the B-roll workflow", () => {
		expect(() =>
			assertFfmpegMajor({
				versionOutput: "ffmpeg version 6.1.1 Copyright",
			})
		).toThrow("FFmpeg 8+ is required");
		expect(
			assertFfmpegMajor({
				versionOutput: "ffmpeg version 8.1.2 Copyright",
			})
		).toBe(8);
	});

	test("rejects unrecognized version output", () => {
		expect(() =>
			parseFfmpegMajor({ versionOutput: "not ffmpeg" })
		).toThrow("Could not parse");
	});
});
