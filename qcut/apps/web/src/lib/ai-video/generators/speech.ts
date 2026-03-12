/**
 * Speech Generators
 *
 * Functions for text-to-speech and speech-to-speech generation via FAL.ai Chatterbox.
 */

import {
	getFalApiKeyAsync,
	generateJobId,
	makeFalRequest,
	handleFalResponse,
} from "../core/fal-request";

export interface SpeechGenerationRequest {
	/** Text to convert to speech (TTS only). */
	text: string;
	/** FAL endpoint path. */
	endpoint: string;
	/** Optional reference audio URL for voice cloning. */
	audioUrl?: string;
	/** Expressiveness control (0-1, default 0.25). */
	exaggeration?: number;
	/** Creativity control (0.05-2.0, default 0.7). */
	temperature?: number;
	/** Classifier-free guidance (0.1-1.0, default 0.5). */
	cfg?: number;
	/** Seed for reproducibility. */
	seed?: number;
}

export interface SpeechConversionRequest {
	/** FAL endpoint path. */
	endpoint: string;
	/** URL of the source audio to convert. */
	sourceAudioUrl: string;
	/** Optional target voice reference audio URL. */
	targetVoiceAudioUrl?: string;
}

export interface SpeechGenerationResult {
	jobId: string;
	audioUrl: string;
	contentType: string;
	fileName: string;
	fileSize?: number;
}

/**
 * Generate speech from text using Chatterbox TTS.
 */
export async function generateSpeech(
	request: SpeechGenerationRequest
): Promise<SpeechGenerationResult> {
	const falApiKey = await getFalApiKeyAsync();
	if (!falApiKey) {
		throw new Error(
			"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable."
		);
	}

	const jobId = generateJobId();
	const payload: Record<string, unknown> = {
		text: request.text,
	};

	if (request.audioUrl) payload.audio_url = request.audioUrl;
	if (request.exaggeration !== undefined)
		payload.exaggeration = request.exaggeration;
	if (request.temperature !== undefined)
		payload.temperature = request.temperature;
	if (request.cfg !== undefined) payload.cfg = request.cfg;
	if (request.seed !== undefined) payload.seed = request.seed;

	const response = await makeFalRequest({
		endpoint: request.endpoint,
		payload,
		apiKey: falApiKey,
	});

	const data = await handleFalResponse(response);
	const audio = data?.audio ?? data;

	return {
		jobId,
		audioUrl: audio.url,
		contentType: audio.content_type ?? "audio/wav",
		fileName: audio.file_name ?? "output.wav",
		fileSize: audio.file_size,
	};
}

/**
 * Convert speech to a different voice using Chatterbox S2S.
 */
export async function convertSpeech(
	request: SpeechConversionRequest
): Promise<SpeechGenerationResult> {
	const falApiKey = await getFalApiKeyAsync();
	if (!falApiKey) {
		throw new Error(
			"FAL API key not configured. Please set VITE_FAL_API_KEY environment variable."
		);
	}

	const jobId = generateJobId();
	const payload: Record<string, unknown> = {
		source_audio_url: request.sourceAudioUrl,
	};

	if (request.targetVoiceAudioUrl) {
		payload.target_voice_audio_url = request.targetVoiceAudioUrl;
	}

	const response = await makeFalRequest({
		endpoint: request.endpoint,
		payload,
		apiKey: falApiKey,
	});

	const data = await handleFalResponse(response);
	const audio = data?.audio ?? data;

	return {
		jobId,
		audioUrl: audio.url,
		contentType: audio.content_type ?? "audio/wav",
		fileName: audio.file_name ?? "output.wav",
		fileSize: audio.file_size,
	};
}
