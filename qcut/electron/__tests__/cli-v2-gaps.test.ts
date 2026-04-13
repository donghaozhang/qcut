/**
 * Tests for v2 Python→TypeScript parity gaps.
 *
 * Tests new CLI options: transcribe (language, diarize, SRT, keyterms),
 * transfer-motion (orientation, no-sound, prompt), generate-avatar
 * (reference-images), analyze-video (type, format), upscale-image
 * (target, format), generate-grid (style, upscale), vimax:idea2video
 * (no-references), stdin pipe, adapter utility methods, and SRT generation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelRegistry } from "../native-pipeline/infra/registry.js";
import { initRegistry, resetInitState } from "../native-pipeline/init.js";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";
import type { CLIRunOptions } from "../native-pipeline/cli/cli-runner.js";
import {
	generateSrt,
	extractWordTimestamps,
	type WordTimestamp,
} from "../native-pipeline/output/srt-generator.js";
import { ImageGeneratorAdapter } from "../native-pipeline/vimax/adapters/image-adapter.js";
import { VideoGeneratorAdapter } from "../native-pipeline/vimax/adapters/video-adapter.js";

function defaultOptions(overrides: Partial<CLIRunOptions> = {}): CLIRunOptions {
	return {
		command: "list-models",
		outputDir: "./test-output",
		saveIntermediates: false,
		json: false,
		verbose: false,
		quiet: false,
		...overrides,
	};
}

describe("CLI v2 gaps — new options parsing", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		ModelRegistry.clear();
		resetInitState();
		initRegistry();
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		exitSpy.mockRestore();
		consoleSpy.mockRestore();
	});

	describe("transcribe options", () => {
		it("parses --language option", () => {
			const opts = parseCliArgs([
				"transcribe",
				"--input",
				"audio.mp3",
				"--language",
				"eng",
			]);
			expect(opts.language).toBe("eng");
		});

		it("parses --no-diarize flag", () => {
			const opts = parseCliArgs([
				"transcribe",
				"--input",
				"audio.mp3",
				"--no-diarize",
			]);
			expect(opts.noDiarize).toBe(true);
		});

		it("parses --no-tag-events flag", () => {
			const opts = parseCliArgs([
				"transcribe",
				"--input",
				"audio.mp3",
				"--no-tag-events",
			]);
			expect(opts.noTagEvents).toBe(true);
		});

		it("parses --srt flag with max words and duration", () => {
			const opts = parseCliArgs([
				"transcribe",
				"--input",
				"audio.mp3",
				"--srt",
				"--srt-max-words",
				"6",
				"--srt-max-duration",
				"3.5",
			]);
			expect(opts.srt).toBe(true);
			expect(opts.srtMaxWords).toBe(6);
			expect(opts.srtMaxDuration).toBe(3.5);
		});

		it("parses --raw-json flag", () => {
			const opts = parseCliArgs([
				"transcribe",
				"--input",
				"audio.mp3",
				"--raw-json",
			]);
			expect(opts.rawJson).toBe(true);
		});

		it("parses --keyterms as multiple values", () => {
			const opts = parseCliArgs([
				"transcribe",
				"--input",
				"audio.mp3",
				"--keyterms",
				"AI",
				"--keyterms",
				"TypeScript",
			]);
			expect(opts.keyterms).toEqual(["AI", "TypeScript"]);
		});
	});

	describe("transfer-motion options", () => {
		it("parses --orientation option", () => {
			const opts = parseCliArgs([
				"transfer-motion",
				"--image-url",
				"img.png",
				"--video-url",
				"vid.mp4",
				"--orientation",
				"image",
			]);
			expect(opts.orientation).toBe("image");
		});

		it("parses --no-sound flag", () => {
			const opts = parseCliArgs([
				"transfer-motion",
				"--image-url",
				"img.png",
				"--video-url",
				"vid.mp4",
				"--no-sound",
			]);
			expect(opts.noSound).toBe(true);
		});

		it("parses --prompt option", () => {
			const opts = parseCliArgs([
				"transfer-motion",
				"--image-url",
				"img.png",
				"--video-url",
				"vid.mp4",
				"--prompt",
				"dancing character",
			]);
			expect(opts.prompt).toBe("dancing character");
		});
	});

	describe("generate-avatar options", () => {
		it("parses --reference-images as multiple values", () => {
			const opts = parseCliArgs([
				"generate-avatar",
				"--model",
				"heygen_avatar",
				"--reference-images",
				"ref1.png",
				"--reference-images",
				"ref2.png",
			]);
			expect(opts.referenceImages).toEqual(["ref1.png", "ref2.png"]);
		});
	});

	describe("analyze-video options", () => {
		it("parses --analysis-type option", () => {
			const opts = parseCliArgs([
				"analyze-video",
				"--input",
				"video.mp4",
				"--analysis-type",
				"summary",
			]);
			expect(opts.analysisType).toBe("summary");
		});

		it("parses --output-format / -f option", () => {
			const opts = parseCliArgs([
				"analyze-video",
				"--input",
				"video.mp4",
				"-f",
				"json",
			]);
			expect(opts.outputFormat).toBe("json");
		});
	});

	describe("upscale-image options", () => {
		it("parses --target option", () => {
			const opts = parseCliArgs([
				"upscale-image",
				"--image",
				"img.png",
				"--target",
				"1080p",
			]);
			expect(opts.target).toBe("1080p");
		});

		it("parses --output-format for image format", () => {
			const opts = parseCliArgs([
				"upscale-image",
				"--image",
				"img.png",
				"--output-format",
				"webp",
			]);
			expect(opts.outputFormat).toBe("webp");
		});
	});

	describe("generate-grid options", () => {
		it("parses --grid-upscale option", () => {
			const opts = parseCliArgs([
				"generate-grid",
				"--text",
				"A cat",
				"--model",
				"flux_dev",
				"--grid-upscale",
				"2",
			]);
			expect(opts.gridUpscale).toBe(2);
		});
	});

	describe("vimax:idea2video options", () => {
		it("parses --no-references flag", () => {
			const opts = parseCliArgs([
				"vimax:idea2video",
				"--idea",
				"A hero story",
				"--no-references",
			]);
			expect(opts.noReferences).toBe(true);
		});
	});
});

describe("SRT Generator", () => {
	const sampleWords: WordTimestamp[] = [
		{ word: "Hello", start: 0.0, end: 0.5 },
		{ word: "world", start: 0.6, end: 1.0 },
		{ word: "this", start: 1.1, end: 1.3 },
		{ word: "is", start: 1.4, end: 1.5 },
		{ word: "a", start: 1.6, end: 1.7 },
		{ word: "test", start: 1.8, end: 2.0 },
		{ word: "of", start: 2.1, end: 2.3 },
		{ word: "the", start: 2.4, end: 2.5 },
		{ word: "subtitle", start: 2.6, end: 3.0 },
		{ word: "generation", start: 3.1, end: 3.5 },
	];

	it("generates valid SRT format", () => {
		const srt = generateSrt(sampleWords, { maxWords: 5, maxDuration: 4.0 });
		expect(srt).toContain("1\n");
		expect(srt).toContain("-->");
		expect(srt).toContain("Hello world this is a");
	});

	it("respects maxWords limit", () => {
		const srt = generateSrt(sampleWords, { maxWords: 3, maxDuration: 10.0 });
		const entries = srt.split("\n\n").filter((e) => e.trim());
		// With 10 words and max 3 per line, should get 4 entries (3+3+3+1)
		expect(entries.length).toBe(4);
	});

	it("respects maxDuration limit", () => {
		const longWords: WordTimestamp[] = [
			{ word: "A", start: 0.0, end: 0.5 },
			{ word: "B", start: 1.0, end: 1.5 },
			{ word: "C", start: 2.0, end: 2.5 },
			{ word: "D", start: 5.0, end: 5.5 },
			{ word: "E", start: 6.0, end: 6.5 },
		];
		const srt = generateSrt(longWords, { maxWords: 100, maxDuration: 2.0 });
		const entries = srt.split("\n\n").filter((e) => e.trim());
		// Words A,B,C span 0-2.5s (>2.0), should split at C
		// D,E span 5.0-6.5s (<2.0), should stay together
		expect(entries.length).toBeGreaterThanOrEqual(2);
	});

	it("uses default maxWords=8 and maxDuration=4.0", () => {
		const srt = generateSrt(sampleWords);
		expect(srt).toContain("Hello world this is a test of the");
		// 8 words in first entry, 2 in second
		const entries = srt.split("\n\n").filter((e) => e.trim());
		expect(entries.length).toBe(2);
	});

	it("formats timecodes correctly", () => {
		const srt = generateSrt([{ word: "test", start: 3661.123, end: 3662.456 }]);
		// 3661.123s = 01:01:01,123
		expect(srt).toContain("01:01:01,123");
	});

	describe("extractWordTimestamps", () => {
		it("extracts from { words: [...] } format", () => {
			const data = {
				words: [
					{ word: "hello", start: 0, end: 0.5 },
					{ word: "world", start: 0.6, end: 1.0 },
				],
			};
			const result = extractWordTimestamps(data);
			expect(result).toHaveLength(2);
			expect(result![0].word).toBe("hello");
		});

		it("extracts from { segments: [{ words: [...] }] } format", () => {
			const data = {
				segments: [
					{
						words: [
							{ word: "hello", start: 0, end: 0.5 },
							{ word: "world", start: 0.6, end: 1.0 },
						],
					},
					{
						words: [{ word: "test", start: 1.5, end: 2.0 }],
					},
				],
			};
			const result = extractWordTimestamps(data);
			expect(result).toHaveLength(3);
		});

		it("returns undefined for invalid data", () => {
			expect(extractWordTimestamps(null)).toBeUndefined();
			expect(extractWordTimestamps("text")).toBeUndefined();
			expect(extractWordTimestamps({})).toBeUndefined();
		});
	});
});

describe("Adapter utility methods", () => {
	beforeEach(() => {
		ModelRegistry.clear();
		resetInitState();
		initRegistry();
	});

	describe("ImageGeneratorAdapter", () => {
		it("getAvailableModels returns model keys", () => {
			const models = ImageGeneratorAdapter.getAvailableModels();
			expect(models.length).toBeGreaterThan(0);
			expect(models).toContain("flux_dev");
			expect(models).toContain("flux_schnell");
		});

		it("getModelInfo returns metadata for known model", () => {
			const info = ImageGeneratorAdapter.getModelInfo("flux_dev");
			expect(info).toBeDefined();
			expect(info!.key).toBe("flux_dev");
			expect(info!.endpoint).toContain("fal-ai");
			expect(typeof info!.costPerImage).toBe("number");
			expect(typeof info!.maxSteps).toBe("number");
			expect(typeof info!.supportsReference).toBe("boolean");
		});

		it("getModelInfo returns undefined for unknown model", () => {
			const info = ImageGeneratorAdapter.getModelInfo("nonexistent");
			expect(info).toBeUndefined();
		});

		it("supportsReferenceImages returns true for reference models", () => {
			expect(
				ImageGeneratorAdapter.supportsReferenceImages("nano_banana_pro")
			).toBe(true);
			expect(
				ImageGeneratorAdapter.supportsReferenceImages("flux_kontext")
			).toBe(true);
		});

		it("supportsReferenceImages returns false for non-reference models", () => {
			expect(ImageGeneratorAdapter.supportsReferenceImages("nonexistent")).toBe(
				false
			);
		});
	});

	describe("VideoGeneratorAdapter", () => {
		it("getAvailableModels returns video model keys", () => {
			const models = VideoGeneratorAdapter.getAvailableModels();
			expect(models.length).toBeGreaterThan(0);
			// `kling` is still advertised as a legacy alias that resolves to
			// the current kling_2_1 entry; use another real image_to_video
			// registry key (hailuo) instead of the old text_to_video-only
			// `veo3` assertion which predated the ModelRegistry migration.
			expect(models).toContain("kling");
			expect(models).toContain("hailuo");
		});
	});
});
