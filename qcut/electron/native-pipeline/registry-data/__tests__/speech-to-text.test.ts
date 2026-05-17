import { beforeAll, describe, expect, it } from "vitest";
import { ModelRegistry } from "../../infra/registry.js";
import { registerSpeechToTextModels } from "../speech-to-text.js";

describe("speech-to-text registry", () => {
	beforeAll(() => {
		ModelRegistry.clear();
		registerSpeechToTextModels();
	});

	it("keeps the legacy FAL-backed Scribe v2 model", () => {
		const model = ModelRegistry.get("scribe_v2");

		expect(model.provider).toBe("ElevenLabs (via FAL)");
		expect(model.providerBackend).toBe("fal");
		expect(model.endpoint).toBe("fal-ai/elevenlabs/speech-to-text/scribe-v2");
	});

	it("registers direct ElevenLabs Scribe v2 for official speech-to-text API", () => {
		const model = ModelRegistry.get("elevenlabs_scribe_v2");

		expect(model.provider).toBe("ElevenLabs");
		expect(model.providerBackend).toBe("elevenlabs");
		expect(model.endpoint).toBe("speech-to-text");
		expect(model.defaults.model_id).toBe("scribe_v2");
		expect(model.categories).toContain("speech_to_text");
	});
});
