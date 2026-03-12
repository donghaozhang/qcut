/**
 * Speech Model Configuration
 * Defines text-to-speech and speech-to-speech models (Chatterbox via FAL.ai).
 */

import type { AIModel } from "../types/ai-types";
import { validateModelOrderInvariant } from "./model-config-validation";

/**
 * Speech generation model definitions.
 *
 * Includes models for:
 * - Text-to-speech with voice cloning and emotive tags
 * - Fast TTS via Turbo variant
 * - Speech-to-speech voice conversion
 *
 * Single source of truth for all speech model configurations.
 */
export const SPEECH_MODELS = {
	chatterbox_tts: {
		id: "chatterbox_tts",
		name: "Chatterbox TTS",
		badge: "⭐ Recommended",
		description:
			"High-quality text-to-speech with voice cloning and emotive expressions",
		price: "0.025/1k chars",
		resolution: "N/A",
		max_duration: 0,
		category: "speech",
		endpoints: {
			text_to_speech: "fal-ai/chatterbox/text-to-speech",
		},
		default_params: {
			exaggeration: 0.25,
			temperature: 0.7,
			cfg: 0.5,
		},
	},
	chatterbox_tts_turbo: {
		id: "chatterbox_tts_turbo",
		name: "Chatterbox TTS Turbo",
		badge: "⚡ Fast",
		description: "Faster TTS generation with slightly reduced quality",
		price: "TBD",
		resolution: "N/A",
		max_duration: 0,
		category: "speech",
		endpoints: {
			text_to_speech: "fal-ai/chatterbox/text-to-speech/turbo",
		},
		default_params: {
			exaggeration: 0.25,
			temperature: 0.7,
			cfg: 0.5,
		},
	},
	chatterbox_s2s: {
		id: "chatterbox_s2s",
		name: "Chatterbox Voice Convert",
		description:
			"Convert speech to a different voice while preserving content",
		price: "TBD",
		resolution: "N/A",
		max_duration: 0,
		category: "speech",
		endpoints: {
			speech_to_speech: "fal-ai/chatterbox/speech-to-speech",
		},
	},
} as const satisfies Record<string, AIModel>;

/**
 * Speech model identifier type derived from SPEECH_MODELS keys.
 */
export type SpeechModelId = keyof typeof SPEECH_MODELS;

/**
 * Priority order for displaying speech models in the UI.
 */
export const SPEECH_MODEL_ORDER: readonly SpeechModelId[] = [
	"chatterbox_tts",
	"chatterbox_tts_turbo",
	"chatterbox_s2s",
] as const;

validateModelOrderInvariant({
	category: "SPEECH",
	models: SPEECH_MODELS,
	order: SPEECH_MODEL_ORDER,
});

/**
 * Get Speech models in priority order for UI rendering.
 */
export function getSpeechModelsInOrder(): Array<[SpeechModelId, AIModel]> {
	return SPEECH_MODEL_ORDER.map((id) => [id, SPEECH_MODELS[id]]);
}
