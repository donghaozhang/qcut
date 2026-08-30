import { describe, expect, it } from "vitest";
import { resolveLocalFinalVideoExportOutput } from "../local-final-video-output";

describe("local final video output", () => {
	it.each([
		"/tmp/final.mp4",
		"C:\\Exports\\final.MP4",
		"D:/Exports/final.mp4",
	])("recognizes an absolute Electron MP4 path: %s", (outputPath) => {
		expect(
			resolveLocalFinalVideoExportOutput({
				format: "mp4",
				isElectron: true,
				outputPath,
			})
		).toMatchObject({ container: "mp4", destination: "local-file" });
	});

	it.each([
		{ format: "mp4" as const, outputPath: "relative.mp4" },
		{ format: "mp4" as const, outputPath: "file:///tmp/final.mp4" },
		{ format: "mp4" as const, outputPath: "//server/share/final.mp4" },
		{ format: "mp4" as const, outputPath: "\\\\server\\share\\final.mp4" },
		{ format: "mp4" as const, outputPath: "/tmp/final.webm" },
		{ format: "webm" as const, outputPath: "/tmp/final.mp4" },
	])("does not grant local MP4 status to $format at $outputPath", (input) => {
		expect(
			resolveLocalFinalVideoExportOutput({
				...input,
				isElectron: true,
			})
		).toMatchObject({ destination: "external" });
	});
});
