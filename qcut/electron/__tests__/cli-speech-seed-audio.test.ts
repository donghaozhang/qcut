import { describe, expect, it } from "vitest";
import { buildSpeechPayload } from "../native-pipeline/cli/cli-handlers-speech";

describe("Seed Audio speech payload", () => {
	it("maps cinematic audio controls to the fal schema", () => {
		const payload = buildSpeechPayload({
			model: "seed_audio",
			text: "清晰自然的中文产品旁白，配轻微电子音乐。",
			options: {
				command: "generate-speech",
				audioUrl: "https://example.com/reference.mp3",
				voice: "narrator",
				audioFormat: "mp3",
				sampleRate: 48_000,
				speed: 1.05,
				volume: 0.9,
				pitch: -1,
				multilingual: true,
			},
		});

		expect(payload).toEqual({
			prompt: "清晰自然的中文产品旁白，配轻微电子音乐。",
			voice: "narrator",
			audio_urls: ["https://example.com/reference.mp3"],
			output_format: "mp3",
			sample_rate: 48_000,
			speed: 1.05,
			volume: 0.9,
			pitch: -1,
			multilingual: true,
		});
	});

	it("keeps legacy TTS payloads text-based", () => {
		const payload = buildSpeechPayload({
			model: "qwen3_tts",
			text: "Hello from QCut",
			options: {
				command: "generate-speech",
				voice: "Vivian",
				language: "English",
			},
		});

		expect(payload).toEqual({
			text: "Hello from QCut",
			voice: "Vivian",
			language: "English",
		});
	});
});
