/**
 * CLI Speech Generation Handlers
 *
 * Handles generate-speech (TTS), convert-speech (S2S), and clone-voice commands
 * using Chatterbox, ElevenLabs v3, Qwen3, and Seed Audio via FAL.ai.
 *
 * @module electron/native-pipeline/cli/cli-handlers-speech
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";
import { getKey } from "../infra/key-manager.js";
import { callModelApi, uploadToFalStorage } from "../infra/api-caller.js";

const FAL_API_BASE = "https://queue.fal.run";

const SPEECH_ENDPOINTS = {
	chatterbox_tts: "fal-ai/chatterbox/text-to-speech",
	chatterbox_tts_turbo: "fal-ai/chatterbox/text-to-speech/turbo",
	chatterbox_s2s: "fal-ai/chatterbox/speech-to-speech",
	elevenlabs_v3: "fal-ai/elevenlabs/tts/eleven-v3",
	qwen3_tts: "fal-ai/qwen-3-tts/text-to-speech/1.7b",
	qwen3_clone_voice: "fal-ai/qwen-3-tts/clone-voice/1.7b",
	seed_audio: "bytedance/seed-audio-1.0",
} as const;

const TTS_MODELS = [
	"chatterbox_tts",
	"chatterbox_tts_turbo",
	"elevenlabs_v3",
	"qwen3_tts",
	"seed_audio",
] as const;

/** Maps --provider shorthand to default model key for TTS. */
const TTS_PROVIDER_DEFAULTS: Record<string, string> = {
	chatterbox: "chatterbox_tts",
	elevenlabs: "elevenlabs_v3",
	qwen: "qwen3_tts",
	qwen3: "qwen3_tts",
	seed: "seed_audio",
	seedaudio: "seed_audio",
	bytedance: "seed_audio",
};

/** Maps --provider shorthand to default model key for S2S (voice convert). */
const S2S_PROVIDER_DEFAULTS: Record<string, string> = {
	chatterbox: "chatterbox_s2s",
};

/** Maps --provider shorthand to default model key for voice cloning. */
const CLONE_PROVIDER_DEFAULTS: Record<string, string> = {
	qwen: "qwen3_clone_voice",
	qwen3: "qwen3_clone_voice",
};

/** Resolve model from --provider if --model not set. */
function resolveModelFromProvider({
	model,
	provider,
	defaults,
}: {
	model: string | undefined;
	provider: string | undefined;
	defaults: Record<string, string>;
}): string | undefined {
	if (model) return model;
	if (!provider) return undefined;
	return defaults[provider.toLowerCase()];
}

export function buildSpeechPayload({
	model,
	text,
	options,
}: {
	model: string;
	text: string;
	options: CLIRunOptions;
}): Record<string, unknown> {
	if (model === "seed_audio") {
		const payload: Record<string, unknown> = {
			prompt: text,
			output_format: options.audioFormat || "mp3",
			sample_rate: options.sampleRate || 48_000,
		};
		if (options.voice) payload.voice = options.voice;
		if (options.audioUrl) payload.audio_urls = [options.audioUrl];
		if (options.speed !== undefined) payload.speed = options.speed;
		if (options.volume !== undefined) payload.volume = options.volume;
		if (options.pitch !== undefined) payload.pitch = options.pitch;
		if (options.multilingual !== undefined) {
			payload.multilingual = options.multilingual;
		}
		return payload;
	}

	const payload: Record<string, unknown> = { text };
	if (model.startsWith("chatterbox")) {
		if (options.audioUrl) payload.audio_url = options.audioUrl;
		if (options.exaggeration !== undefined) {
			payload.exaggeration = options.exaggeration;
		}
		if (options.temperature !== undefined) {
			payload.temperature = options.temperature;
		}
		if (options.cfg !== undefined) payload.cfg = options.cfg;
		if (options.seed !== undefined) payload.seed = options.seed;
		return payload;
	}

	if (model === "elevenlabs_v3") {
		if (options.voice) payload.voice = options.voice;
		if (options.stability !== undefined) payload.stability = options.stability;
		if (options.languageCode) payload.language_code = options.languageCode;
		return payload;
	}

	if (model === "qwen3_tts") {
		if (options.voice) payload.voice = options.voice;
		if (options.language) payload.language = options.language;
		if (options.text && options.prompt) payload.prompt = options.prompt;
		if (options.audioUrl) {
			payload.speaker_voice_embedding_file_url = options.audioUrl;
		}
		if (options.temperature !== undefined) {
			payload.temperature = options.temperature;
		}
	}
	return payload;
}

function validateSeedAudioOptions({
	options,
}: {
	options: CLIRunOptions;
}): string | undefined {
	if (
		options.speed !== undefined &&
		(options.speed < 0.5 || options.speed > 2)
	) {
		return "--speed must be between 0.5 and 2 for Seed Audio";
	}
	if (options.volume !== undefined && options.volume <= 0) {
		return "--volume must be greater than 0 for Seed Audio";
	}
	if (
		options.pitch !== undefined &&
		(options.pitch < -12 || options.pitch > 12)
	) {
		return "--pitch must be between -12 and 12 for Seed Audio";
	}
	return undefined;
}

interface SpeechApiResponse {
	audio?: SpeechAudioFile;
	url?: string;
	file_name?: string;
	content_type?: string;
}

interface SpeechAudioFile {
	url?: string;
	file_name?: string;
	content_type?: string;
}

/**
 * Generate speech or cinematic audio from text.
 */
export async function handleGenerateSpeech(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const text = options.text || options.prompt;
	if (!text?.trim()) {
		return { success: false, error: "Missing --text/-t (text to speak)" };
	}

	const model =
		resolveModelFromProvider({
			model: options.model,
			provider: options.provider,
			defaults: TTS_PROVIDER_DEFAULTS,
		}) || "chatterbox_tts";
	const endpoint = SPEECH_ENDPOINTS[model as keyof typeof SPEECH_ENDPOINTS];
	if (!endpoint || !(TTS_MODELS as readonly string[]).includes(model)) {
		return {
			success: false,
			error: `Unknown TTS model '${model}'. Use: ${TTS_MODELS.join(", ")}`,
		};
	}

	if (model === "seed_audio") {
		const validationError = validateSeedAudioOptions({ options });
		if (validationError) return { success: false, error: validationError };
	}

	const startTime = Date.now();
	onProgress({
		stage: "generating",
		percent: 0,
		message: "Generating speech...",
		model,
	});

	const payload = buildSpeechPayload({
		model,
		text: text.trim(),
		options,
	});

	try {
		const apiResult = await callModelApi({
			endpoint,
			payload,
			provider: "fal",
			signal,
			modelKey: model,
		});

		if (!apiResult.success) {
			return {
				success: false,
				error: apiResult.error || "Speech generation failed",
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const data = apiResult.data as SpeechApiResponse | undefined;
		const audio = data?.audio ?? data;
		const audioUrl =
			(typeof audio?.url === "string" ? audio.url : undefined) ||
			apiResult.outputUrl;

		if (!audioUrl) {
			return {
				success: false,
				error: "No audio URL in FAL response",
				duration: (Date.now() - startTime) / 1000,
			};
		}

		onProgress({
			stage: "downloading",
			percent: 80,
			message: "Downloading audio...",
			model,
		});

		// Download the WAV file
		const audioResponse = await fetch(audioUrl, { signal });
		if (!audioResponse.ok) {
			return {
				success: false,
				error: `Failed to download audio: ${audioResponse.status}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
		const outputDir = options.outputDir || process.cwd();
		mkdirSync(outputDir, { recursive: true });

		const extension =
			options.audioFormat || (model === "seed_audio" ? "mp3" : "wav");
		const fileName = basename(
			typeof audio?.file_name === "string"
				? audio.file_name
				: `speech_output.${extension}`
		);
		const outputPath = join(outputDir, fileName);
		writeFileSync(outputPath, audioBuffer);

		onProgress({ stage: "complete", percent: 100, message: "Done", model });

		return {
			success: true,
			outputPath,
			data: {
				model,
				audioUrl,
				fileName,
				fileSize: audioBuffer.length,
				contentType:
					(typeof audio?.content_type === "string"
						? audio.content_type
						: undefined) || `audio/${extension}`,
			},
			duration: (Date.now() - startTime) / 1000,
		};
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			return {
				success: false,
				error: "Speech generation cancelled",
				duration: (Date.now() - startTime) / 1000,
			};
		}
		return {
			success: false,
			error: `Speech generation failed: ${err instanceof Error ? err.message : String(err)}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}
}

/**
 * Convert speech to a different voice using Chatterbox S2S.
 */
export async function handleConvertSpeech(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const sourceInput = options.input;
	if (!sourceInput?.trim()) {
		return {
			success: false,
			error: "Missing --input/-i (source audio path or URL)",
		};
	}

	const falKey = getKey("FAL_KEY");
	if (!falKey) {
		return {
			success: false,
			error:
				"FAL_KEY not configured. Run: qcut-pipeline set-key --name FAL_KEY --value <key>",
		};
	}

	const startTime = Date.now();
	onProgress({
		stage: "converting",
		percent: 0,
		message: "Converting speech...",
		model: "chatterbox_s2s",
	});

	// Resolve source: upload local files to FAL storage
	let sourceUrl: string;
	if (/^https?:\/\//i.test(sourceInput)) {
		sourceUrl = sourceInput;
	} else {
		onProgress({
			stage: "uploading",
			percent: 10,
			message: "Uploading source audio to FAL storage...",
			model: "chatterbox_s2s",
		});
		const upload = await uploadToFalStorage(resolve(sourceInput));
		if (!upload.success || !upload.url) {
			return {
				success: false,
				error: `Failed to upload source audio: ${upload.error || "unknown error"}`,
			};
		}
		sourceUrl = upload.url;
	}

	const payload: Record<string, unknown> = {
		source_audio_url: sourceUrl,
	};
	if (options.audioUrl) {
		payload.target_voice_audio_url = options.audioUrl;
	}

	try {
		const response = await fetch(
			`${FAL_API_BASE}/${SPEECH_ENDPOINTS.chatterbox_s2s}`,
			{
				method: "POST",
				headers: {
					Authorization: `Key ${falKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
				signal,
			}
		);

		if (!response.ok) {
			const errorText = await response.text().catch(() => "");
			return {
				success: false,
				error: `FAL API error (${response.status}): ${errorText}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const data = (await response.json()) as Record<string, any>;
		const audio = data?.audio ?? data;
		const audioUrl: string = audio?.url;

		if (!audioUrl) {
			return {
				success: false,
				error: "No audio URL in FAL response",
				duration: (Date.now() - startTime) / 1000,
			};
		}

		onProgress({
			stage: "downloading",
			percent: 80,
			message: "Downloading converted audio...",
			model: "chatterbox_s2s",
		});

		const audioResponse = await fetch(audioUrl, { signal });
		if (!audioResponse.ok) {
			return {
				success: false,
				error: `Failed to download audio: ${audioResponse.status}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
		const outputDir = options.outputDir || process.cwd();
		mkdirSync(outputDir, { recursive: true });

		const fileName = audio?.file_name || "converted_speech.wav";
		const outputPath = join(outputDir, fileName);
		writeFileSync(outputPath, audioBuffer);

		onProgress({
			stage: "complete",
			percent: 100,
			message: "Done",
			model: "chatterbox_s2s",
		});

		return {
			success: true,
			outputPath,
			data: {
				model: "chatterbox_s2s",
				audioUrl,
				fileName,
				fileSize: audioBuffer.length,
				contentType: audio?.content_type || "audio/wav",
			},
			duration: (Date.now() - startTime) / 1000,
		};
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			return {
				success: false,
				error: "Speech conversion cancelled",
				duration: (Date.now() - startTime) / 1000,
			};
		}
		return {
			success: false,
			error: `Speech conversion failed: ${err instanceof Error ? err.message : String(err)}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}
}

/**
 * Clone a voice using Qwen3 voice cloning.
 * Returns a speaker embedding URL for use with generate-speech --model qwen3_tts.
 */
export async function handleCloneVoice(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const audioInput = options.input || options.audioUrl;
	if (!audioInput?.trim()) {
		return {
			success: false,
			error: "Missing --input/-i (reference audio path or URL)",
		};
	}

	const falKey = getKey("FAL_KEY");
	if (!falKey) {
		return {
			success: false,
			error:
				"FAL_KEY not configured. Run: qcut-pipeline set-key --name FAL_KEY --value <key>",
		};
	}

	const startTime = Date.now();
	onProgress({
		stage: "cloning",
		percent: 0,
		message: "Cloning voice...",
		model: "qwen3_clone_voice",
	});

	let audioUrl: string;
	if (/^https?:\/\//i.test(audioInput)) {
		audioUrl = audioInput;
	} else {
		onProgress({
			stage: "uploading",
			percent: 10,
			message: "Uploading audio to FAL storage...",
			model: "qwen3_clone_voice",
		});
		const upload = await uploadToFalStorage(resolve(audioInput));
		if (!upload.success || !upload.url) {
			return {
				success: false,
				error: `Failed to upload audio: ${upload.error || "unknown error"}`,
			};
		}
		audioUrl = upload.url;
	}

	const payload: Record<string, unknown> = {
		audio_url: audioUrl,
	};
	if (options.text) payload.reference_text = options.text;

	try {
		const response = await fetch(
			`${FAL_API_BASE}/${SPEECH_ENDPOINTS.qwen3_clone_voice}`,
			{
				method: "POST",
				headers: {
					Authorization: `Key ${falKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
				signal,
			}
		);

		if (!response.ok) {
			const errorText = await response.text().catch(() => "");
			return {
				success: false,
				error: `FAL API error (${response.status}): ${errorText}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const data = (await response.json()) as Record<string, any>;
		const embedding = data?.speaker_embedding ?? data;
		const embeddingUrl: string = embedding?.url;

		if (!embeddingUrl) {
			return {
				success: false,
				error: "No embedding URL in FAL response",
				duration: (Date.now() - startTime) / 1000,
			};
		}

		onProgress({
			stage: "complete",
			percent: 100,
			message: "Done",
			model: "qwen3_clone_voice",
		});

		return {
			success: true,
			data: {
				model: "qwen3_clone_voice",
				embeddingUrl,
				fileName: embedding?.file_name || "clone.safetensors",
				fileSize: embedding?.file_size,
			},
			duration: (Date.now() - startTime) / 1000,
		};
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			return {
				success: false,
				error: "Voice cloning cancelled",
				duration: (Date.now() - startTime) / 1000,
			};
		}
		return {
			success: false,
			error: `Voice cloning failed: ${err instanceof Error ? err.message : String(err)}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}
}
