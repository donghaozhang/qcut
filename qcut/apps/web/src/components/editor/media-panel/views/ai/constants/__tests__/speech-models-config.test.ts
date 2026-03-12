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
				"text_to_speech" in endpoints ||
				"speech_to_speech" in endpoints ||
				"clone_voice" in endpoints;
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

	it("Chatterbox TTS models have correct endpoints", () => {
		expect(SPEECH_MODELS.chatterbox_tts.endpoints.text_to_speech).toBe(
			"fal-ai/chatterbox/text-to-speech"
		);
		expect(SPEECH_MODELS.chatterbox_tts_turbo.endpoints.text_to_speech).toBe(
			"fal-ai/chatterbox/text-to-speech/turbo"
		);
	});

	it("Chatterbox S2S model has correct endpoint", () => {
		expect(SPEECH_MODELS.chatterbox_s2s.endpoints.speech_to_speech).toBe(
			"fal-ai/chatterbox/speech-to-speech"
		);
	});

	it("Chatterbox TTS models have default params", () => {
		const tts = SPEECH_MODELS.chatterbox_tts;
		expect(tts.default_params).toBeDefined();
		expect(tts.default_params?.exaggeration).toBe(0.25);
		expect(tts.default_params?.temperature).toBe(0.7);
		expect(tts.default_params?.cfg).toBe(0.5);
	});

	it("ElevenLabs v3 has correct endpoint", () => {
		expect(SPEECH_MODELS.elevenlabs_v3.endpoints.text_to_speech).toBe(
			"fal-ai/elevenlabs/tts/eleven-v3"
		);
	});

	it("ElevenLabs v3 has stability default param", () => {
		expect(SPEECH_MODELS.elevenlabs_v3.default_params?.stability).toBe(0.5);
	});

	it("Qwen3 TTS has correct endpoint", () => {
		expect(SPEECH_MODELS.qwen3_tts.endpoints.text_to_speech).toBe(
			"fal-ai/qwen-3-tts/text-to-speech/1.7b"
		);
	});

	it("Qwen3 TTS has default params", () => {
		const qw = SPEECH_MODELS.qwen3_tts;
		expect(qw.default_params?.temperature).toBe(0.9);
		expect(qw.default_params?.top_k).toBe(50);
		expect(qw.default_params?.top_p).toBe(1);
		expect(qw.default_params?.repetition_penalty).toBe(1.05);
	});

	it("Qwen3 Clone Voice has correct endpoint", () => {
		expect(SPEECH_MODELS.qwen3_clone_voice.endpoints.clone_voice).toBe(
			"fal-ai/qwen-3-tts/clone-voice/1.7b"
		);
	});

	it("has exactly 6 models", () => {
		expect(Object.keys(SPEECH_MODELS)).toHaveLength(6);
		expect(SPEECH_MODEL_ORDER).toHaveLength(6);
	});
});
