import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../native-pipeline/cli/cli.js";

describe("CLI speech args", () => {
	describe("generate-speech", () => {
		it("parses basic --text flag", () => {
			const opts = parseCliArgs([
				"generate-speech",
				"-t",
				"Hello world",
			]);
			expect(opts.command).toBe("generate-speech");
			expect(opts.text).toBe("Hello world");
		});

		it("parses all TTS-specific flags", () => {
			const opts = parseCliArgs([
				"generate-speech",
				"-t",
				"Test speech",
				"--model",
				"chatterbox_tts_turbo",
				"--audio-url",
				"https://example.com/voice.mp3",
				"--exaggeration",
				"0.5",
				"--temperature",
				"1.2",
				"--cfg",
				"0.8",
				"--seed",
				"42",
			]);
			expect(opts.command).toBe("generate-speech");
			expect(opts.model).toBe("chatterbox_tts_turbo");
			expect(opts.audioUrl).toBe("https://example.com/voice.mp3");
			expect(opts.exaggeration).toBe(0.5);
			expect(opts.temperature).toBe(1.2);
			expect(opts.cfg).toBe(0.8);
			expect(opts.seed).toBe(42);
		});

		it("defaults model to undefined when not specified", () => {
			const opts = parseCliArgs(["generate-speech", "-t", "Hello"]);
			expect(opts.model).toBeUndefined();
		});
	});

	describe("convert-speech", () => {
		it("parses --input flag", () => {
			const opts = parseCliArgs([
				"convert-speech",
				"-i",
				"source.wav",
			]);
			expect(opts.command).toBe("convert-speech");
			expect(opts.input).toBe("source.wav");
		});

		it("parses --audio-url for target voice", () => {
			const opts = parseCliArgs([
				"convert-speech",
				"-i",
				"source.wav",
				"--audio-url",
				"https://example.com/target.mp3",
			]);
			expect(opts.command).toBe("convert-speech");
			expect(opts.input).toBe("source.wav");
			expect(opts.audioUrl).toBe("https://example.com/target.mp3");
		});
	});
});
