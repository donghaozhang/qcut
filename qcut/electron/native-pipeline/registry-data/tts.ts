/**
 * Text-to-speech model definitions
 * @module electron/native-pipeline/registry-data/tts
 */

import { ModelRegistry } from "../infra/registry.js";

export function registerTTSModels(): void {
	ModelRegistry.register({
		key: "elevenlabs",
		name: "ElevenLabs TTS",
		provider: "ElevenLabs",
		endpoint: "elevenlabs/tts",
		categories: ["text_to_speech"],
		description: "High quality text-to-speech",
		pricing: { per_character: 0.000_03 },
		defaults: {},
		features: ["high_quality", "professional"],
		costEstimate: 0.05,
		processingTime: 15,
	});

	ModelRegistry.register({
		key: "elevenlabs_turbo",
		name: "ElevenLabs Turbo",
		provider: "ElevenLabs",
		endpoint: "elevenlabs/tts/turbo",
		categories: ["text_to_speech"],
		description: "Fast text-to-speech",
		pricing: { per_character: 0.000_02 },
		defaults: {},
		features: ["fast_processing"],
		costEstimate: 0.03,
		processingTime: 8,
	});

	ModelRegistry.register({
		key: "elevenlabs_v3",
		name: "ElevenLabs v3",
		provider: "ElevenLabs",
		endpoint: "elevenlabs/tts/v3",
		categories: ["text_to_speech"],
		description: "Latest ElevenLabs text-to-speech model",
		pricing: { per_character: 0.000_05 },
		defaults: {},
		features: ["latest_generation", "high_quality"],
		costEstimate: 0.08,
		processingTime: 20,
	});

	ModelRegistry.register({
		key: "seed_audio",
		name: "Seed Audio 1.0",
		provider: "ByteDance",
		providerBackend: "fal",
		endpoint: "bytedance/seed-audio-1.0",
		categories: ["text_to_speech"],
		description:
			"Multilingual speech, dialogue, sound effects, and music in one pass",
		pricing: { per_minute: 0.1875 },
		defaults: {
			output_format: "mp3",
			sample_rate: 24_000,
			speed: 1,
			volume: 1,
		},
		features: [
			"multilingual",
			"reference_voice",
			"sound_effects",
			"background_music",
		],
		maxDuration: 120,
		inputRequirements: {
			required: ["prompt"],
			optional: [
				"voice",
				"audio_urls",
				"image_url",
				"output_format",
				"sample_rate",
				"speed",
				"volume",
				"pitch",
				"multilingual",
			],
		},
		costEstimate: 0.1875,
		processingTime: 45,
	});
}
