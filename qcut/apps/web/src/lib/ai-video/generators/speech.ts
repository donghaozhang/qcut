/**
 * Speech Generators
 *
 * Functions for text-to-speech, speech-to-speech, and voice cloning via FAL.ai.
 * Supports Chatterbox, ElevenLabs v3, and Qwen3 TTS providers.
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

export interface ElevenLabsSpeechRequest {
	/** Text to convert to speech. */
	text: string;
	/** FAL endpoint path. */
	endpoint: string;
	/** Voice name (default: "Rachel"). */
	voice?: string;
	/** Voice stability 0-1 (default: 0.5). */
	stability?: number;
	/** ISO 639-1 language code. */
	languageCode?: string;
	/** Return word-level timestamps. */
	timestamps?: boolean;
	/** Text normalization: "auto" | "on" | "off". */
	applyTextNormalization?: string;
}

export interface Qwen3SpeechRequest {
	/** Text to convert to speech. */
	text: string;
	/** FAL endpoint path. */
	endpoint: string;
	/** Voice preset name. */
	voice?: string;
	/** Language for generation. */
	language?: string;
	/** Style prompt to guide speech. */
	prompt?: string;
	/** URL to cloned voice embedding (.safetensors). */
	speakerEmbeddingUrl?: string;
	/** Reference text used when creating the embedding. */
	referenceText?: string;
	/** Sampling temperature (default: 0.9). */
	temperature?: number;
	/** Top-k sampling (default: 50). */
	topK?: number;
	/** Top-p sampling (default: 1). */
	topP?: number;
	/** Repetition penalty (default: 1.05). */
	repetitionPenalty?: number;
	/** Max codec tokens to generate (default: 200, max: 8192). */
	maxNewTokens?: number;
}

export interface Qwen3CloneVoiceRequest {
	/** FAL endpoint path. */
	endpoint: string;
	/** URL to the reference audio file for cloning. */
	audioUrl: string;
	/** Optional reference text from the audio. */
	referenceText?: string;
}

export interface SpeechGenerationResult {
	jobId: string;
	audioUrl: string;
	contentType: string;
	fileName: string;
	fileSize?: number;
	/** Audio duration in seconds (Qwen3 only). */
	duration?: number;
	/** Sample rate in Hz (Qwen3 only). */
	sampleRate?: number;
}

export interface CloneVoiceResult {
	jobId: string;
	embeddingUrl: string;
	fileName: string;
	fileSize?: number;
}

/**
 * Generate speech from text using Chatterbox TTS.
 */
export async function generateSpeech(
	request: SpeechGenerationRequest
): Promise<SpeechGenerationResult> {
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

	const response = await makeFalRequest(request.endpoint, payload);

	if (!response.ok) {
		await handleFalResponse(response, "Generate speech (Chatterbox)");
	}

	const data = await response.json();
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
	const jobId = generateJobId();
	const payload: Record<string, unknown> = {
		source_audio_url: request.sourceAudioUrl,
	};

	if (request.targetVoiceAudioUrl) {
		payload.target_voice_audio_url = request.targetVoiceAudioUrl;
	}

	const response = await makeFalRequest(request.endpoint, payload);

	if (!response.ok) {
		await handleFalResponse(response, "Convert speech (Chatterbox S2S)");
	}

	const data = await response.json();
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
 * Generate speech using ElevenLabs v3 TTS.
 */
export async function generateElevenLabsSpeech(
	request: ElevenLabsSpeechRequest
): Promise<SpeechGenerationResult> {
	const jobId = generateJobId();
	const payload: Record<string, unknown> = {
		text: request.text,
	};

	if (request.voice) payload.voice = request.voice;
	if (request.stability !== undefined) payload.stability = request.stability;
	if (request.languageCode) payload.language_code = request.languageCode;
	if (request.timestamps !== undefined) payload.timestamps = request.timestamps;
	if (request.applyTextNormalization) {
		payload.apply_text_normalization = request.applyTextNormalization;
	}

	const response = await makeFalRequest(request.endpoint, payload);

	if (!response.ok) {
		await handleFalResponse(response, "Generate speech (ElevenLabs v3)");
	}

	const data = await response.json();
	const audio = data?.audio ?? data;

	return {
		jobId,
		audioUrl: audio.url,
		contentType: audio.content_type ?? "audio/mpeg",
		fileName: audio.file_name ?? "output.mp3",
		fileSize: audio.file_size,
	};
}

/**
 * Generate speech using Qwen3 TTS.
 */
export async function generateQwen3Speech(
	request: Qwen3SpeechRequest
): Promise<SpeechGenerationResult> {
	const jobId = generateJobId();
	const payload: Record<string, unknown> = {
		text: request.text,
	};

	if (request.voice) payload.voice = request.voice;
	if (request.language) payload.language = request.language;
	if (request.prompt) payload.prompt = request.prompt;
	if (request.speakerEmbeddingUrl) {
		payload.speaker_voice_embedding_file_url = request.speakerEmbeddingUrl;
	}
	if (request.referenceText) payload.reference_text = request.referenceText;
	if (request.temperature !== undefined)
		payload.temperature = request.temperature;
	if (request.topK !== undefined) payload.top_k = request.topK;
	if (request.topP !== undefined) payload.top_p = request.topP;
	if (request.repetitionPenalty !== undefined)
		payload.repetition_penalty = request.repetitionPenalty;
	if (request.maxNewTokens !== undefined)
		payload.max_new_tokens = request.maxNewTokens;

	const response = await makeFalRequest(request.endpoint, payload);

	if (!response.ok) {
		await handleFalResponse(response, "Generate speech (Qwen3 TTS)");
	}

	const data = await response.json();
	const audio = data?.audio ?? data;

	return {
		jobId,
		audioUrl: audio.url,
		contentType: audio.content_type ?? "audio/wav",
		fileName: audio.file_name ?? "output.wav",
		fileSize: audio.file_size,
		duration: audio.duration,
		sampleRate: audio.sample_rate,
	};
}

/**
 * Clone a voice using Qwen3 voice cloning.
 * Returns a speaker embedding URL for use with generateQwen3Speech().
 */
export async function cloneQwen3Voice(
	request: Qwen3CloneVoiceRequest
): Promise<CloneVoiceResult> {
	const jobId = generateJobId();
	const payload: Record<string, unknown> = {
		audio_url: request.audioUrl,
	};

	if (request.referenceText) payload.reference_text = request.referenceText;

	const response = await makeFalRequest(request.endpoint, payload);

	if (!response.ok) {
		await handleFalResponse(response, "Clone voice (Qwen3)");
	}

	const data = await response.json();
	const embedding = data?.speaker_embedding ?? data;

	return {
		jobId,
		embeddingUrl: embedding.url,
		fileName: embedding.file_name ?? "clone.safetensors",
		fileSize: embedding.file_size,
	};
}
