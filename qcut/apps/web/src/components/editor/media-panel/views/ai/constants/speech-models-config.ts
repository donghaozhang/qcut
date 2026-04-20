/**
 * Speech Model Configuration
 * Defines text-to-speech, speech-to-speech, and voice cloning models via FAL.ai.
 */

import type { AIModel } from "../types/ai-types";
import { validateModelOrderInvariant } from "./model-config-validation";

/**
 * Speech generation model definitions.
 *
 * Includes models for:
 * - Chatterbox: TTS with voice cloning and emotive tags, S2S voice conversion
 * - ElevenLabs v3: Premium multilingual TTS with named voices
 * - Qwen3: Open-source multilingual TTS with style prompts, voice cloning
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
		price: "$0.020/1k chars",
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
		description: "Convert speech to a different voice while preserving content",
		price: "$0.015/min",
		resolution: "N/A",
		max_duration: 0,
		category: "speech",
		endpoints: {
			speech_to_speech: "fal-ai/chatterbox/speech-to-speech",
		},
	},
	elevenlabs_v3: {
		id: "elevenlabs_v3",
		name: "ElevenLabs v3",
		badge: "Premium",
		description:
			"Premium multilingual TTS with named voices and stability control",
		price: "$0.10/1k chars",
		resolution: "N/A",
		max_duration: 0,
		category: "speech",
		endpoints: {
			text_to_speech: "fal-ai/elevenlabs/tts/eleven-v3",
		},
		default_params: {
			stability: 0.5,
		},
	},
	qwen3_tts: {
		id: "qwen3_tts",
		name: "Qwen3 TTS",
		description:
			"Multilingual TTS with 9 voices, style prompts, and 10 languages",
		price: "$0.09/1k chars",
		resolution: "N/A",
		max_duration: 0,
		category: "speech",
		endpoints: {
			text_to_speech: "fal-ai/qwen-3-tts/text-to-speech/1.7b",
		},
		default_params: {
			temperature: 0.9,
			top_k: 50,
			top_p: 1,
			repetition_penalty: 1.05,
		},
	},
	qwen3_clone_voice: {
		id: "qwen3_clone_voice",
		name: "Qwen3 Voice Clone",
		description:
			"Clone any voice from a reference audio for use with Qwen3 TTS",
		price: "$0.0008/min",
		resolution: "N/A",
		max_duration: 0,
		category: "speech",
		endpoints: {
			clone_voice: "fal-ai/qwen-3-tts/clone-voice/1.7b",
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
	"elevenlabs_v3",
	"qwen3_tts",
	"qwen3_clone_voice",
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
