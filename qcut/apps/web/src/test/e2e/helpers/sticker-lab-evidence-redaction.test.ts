import { describe, expect, it } from "vitest";
import { redactStickerLabEvidence } from "./sticker-lab-evidence-redaction";

describe("Sticker Lab evidence redaction", () => {
	it("ignores empty replacement sources", () => {
		expect(
			redactStickerLabEvidence({
				cacheRootPath: "",
				inputVideoPath: "",
				value: "evidence stays intact",
			})
		).toBe("evidence stays intact");
	});

	it("redacts configured cache and video paths recursively", () => {
		expect(
			redactStickerLabEvidence({
				cacheRootPath: "/private/cache",
				inputVideoPath: "/private/video.mov",
				value: {
					cache: "/private/cache/batch-1",
					inputs: ["/private/video.mov"],
				},
			})
		).toEqual({
			cache: "<private-sticker-cache>/batch-1",
			inputs: ["<real-test-video>"],
		});
	});

	it.each([
		{ platform: "macOS", privatePath: "/Users/alice/cache/report.json" },
		{ platform: "Linux", privatePath: "/home/alice/cache/report.json" },
		{
			platform: "Windows",
			privatePath: "C:\\Users\\alice\\cache\\report.json",
		},
		{
			platform: "Windows with forward slashes",
			privatePath: "C:/Users/alice/cache/report.json",
		},
	])("rejects $platform user paths", ({ privatePath }) => {
		expect(() =>
			redactStickerLabEvidence({
				cacheRootPath: "",
				inputVideoPath: "",
				value: { leakedPath: privatePath },
			})
		).toThrow("Sticker Lab evidence contains a private user path");
	});
});
