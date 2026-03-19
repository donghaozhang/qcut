/**
 * Speech-to-text model definitions
 * @module electron/native-pipeline/registry-data/speech-to-text
 */

import { ModelRegistry } from "../infra/registry.js";

export function registerSpeechToTextModels(): void {
	ModelRegistry.register({
		key: "scribe_v2",
		name: "ElevenLabs Scribe v2",
		provider: "ElevenLabs (via FAL)",
		endpoint: "fal-ai/elevenlabs/speech-to-text/scribe-v2",
		categories: ["speech_to_text"],
		description: "Fast, accurate transcription with speaker diarization",
		pricing: { per_minute: 0.008 },
		defaults: {},
		features: ["transcription", "speaker_diarization", "multilingual"],
		costEstimate: 0.08,
		processingTime: 15,
	});
}
