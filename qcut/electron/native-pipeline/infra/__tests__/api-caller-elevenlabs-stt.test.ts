import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

vi.mock("../../api-key-handler.js", () => ({
	getDecryptedApiKeys: vi.fn().mockResolvedValue({ elevenLabsApiKey: "" }),
}));

import {
	callElevenLabsSpeechToText,
	envApiKeyProvider,
	setApiKeyProvider,
} from "../api-caller.js";

describe("callElevenLabsSpeechToText", () => {
	beforeEach(() => {
		globalThis.fetch = mockFetch as unknown as typeof fetch;
		vi.clearAllMocks();
		process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
		setApiKeyProvider(envApiKeyProvider);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		process.env.ELEVENLABS_API_KEY = "";
	});

	it("posts multipart form-data to the official ElevenLabs STT endpoint", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: () =>
				Promise.resolve({
					text: "hello from qcut",
				}),
		});

		const result = await callElevenLabsSpeechToText({
			endpoint: "speech-to-text",
			audioInput:
				"/Users/peter/Desktop/code/qcut/qcut/apps/web/src/test/e2e/fixtures/media/sample-audio.mp3",
			payload: {
				model_id: "scribe_v2",
				language: "en",
				diarize: false,
				tag_audio_events: false,
			},
		});

		expect(result.success).toBe(true);
		expect(mockFetch).toHaveBeenCalledTimes(1);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
		expect(init.method).toBe("POST");
		expect(init.headers).toEqual({ "xi-api-key": "test-elevenlabs-key" });
		expect(init.body).toBeInstanceOf(FormData);

		const form = init.body as FormData;
		expect(form.get("model_id")).toBe("scribe_v2");
		expect(form.get("language_code")).toBe("en");
		expect(form.get("diarize")).toBe("false");
		expect(form.get("tag_audio_events")).toBe("false");
		expect(form.get("file")).toBeInstanceOf(Blob);
	});

	it("returns a clear error when the direct ElevenLabs key is missing", async () => {
		process.env.ELEVENLABS_API_KEY = "";

		const result = await callElevenLabsSpeechToText({
			endpoint: "speech-to-text",
			audioInput:
				"/Users/peter/Desktop/code/qcut/qcut/apps/web/src/test/e2e/fixtures/media/sample-audio.mp3",
			payload: { model_id: "scribe_v2" },
		});

		expect(result.success).toBe(false);
		expect(result.error).toBe("No API key configured for provider: elevenlabs");
		expect(mockFetch).not.toHaveBeenCalled();
	});
});
