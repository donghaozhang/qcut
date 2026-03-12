import { describe, it, expect } from "vitest";
import {
	SPEECH_MODELS,
	SPEECH_MODEL_ORDER,
	getSpeechModelsInOrder,
} from "../speech-models-config";

describe("Speech Model Configurations", () => {
	it("all models have category 'speech'", () => {
		for (const [id, model] of Object.entries(SPEECH_MODELS)) {
			expect(model.category).toBe("speech");
			expect(model.id).toBe(id);
		}
	});

	it("all models have at least one endpoint", () => {
		for (const model of Object.values(SPEECH_MODELS)) {
			const endpoints = model.endpoints;
			const hasEndpoint =
				"text_to_speech" in endpoints || "speech_to_speech" in endpoints;
			expect(hasEndpoint).toBe(true);
		}
	});

	it("SPEECH_MODEL_ORDER matches SPEECH_MODELS keys", () => {
		const modelKeys = Object.keys(SPEECH_MODELS).sort();
		const orderKeys = [...SPEECH_MODEL_ORDER].sort();
		expect(orderKeys).toEqual(modelKeys);
	});

	it("model IDs are unique", () => {
		const ids = Object.values(SPEECH_MODELS).map((m) => m.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("getSpeechModelsInOrder returns all models in order", () => {
		const ordered = getSpeechModelsInOrder();
		expect(ordered).toHaveLength(SPEECH_MODEL_ORDER.length);
		for (const [i, [id]] of ordered.entries()) {
			expect(id).toBe(SPEECH_MODEL_ORDER[i]);
		}
	});

	it("TTS models have correct endpoints", () => {
		expect(SPEECH_MODELS.chatterbox_tts.endpoints.text_to_speech).toBe(
			"fal-ai/chatterbox/text-to-speech"
		);
		expect(SPEECH_MODELS.chatterbox_tts_turbo.endpoints.text_to_speech).toBe(
			"fal-ai/chatterbox/text-to-speech/turbo"
		);
	});

	it("S2S model has correct endpoint", () => {
		expect(SPEECH_MODELS.chatterbox_s2s.endpoints.speech_to_speech).toBe(
			"fal-ai/chatterbox/speech-to-speech"
		);
	});

	it("TTS models have default params", () => {
		const tts = SPEECH_MODELS.chatterbox_tts;
		expect(tts.default_params).toBeDefined();
		expect(tts.default_params?.exaggeration).toBe(0.25);
		expect(tts.default_params?.temperature).toBe(0.7);
		expect(tts.default_params?.cfg).toBe(0.5);
	});
});
