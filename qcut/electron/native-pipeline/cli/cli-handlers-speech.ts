/**
 * CLI Speech Generation Handlers
 *
 * Handles generate-speech (TTS) and convert-speech (S2S) commands
 * using Chatterbox via FAL.ai.
 *
 * @module electron/native-pipeline/cli/cli-handlers-speech
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { CLIRunOptions, CLIResult, ProgressFn } from "./cli-runner/types.js";
import { getApiKey } from "../infra/key-manager.js";

const FAL_API_BASE = "https://queue.fal.run";

const CHATTERBOX_ENDPOINTS = {
	tts: "fal-ai/chatterbox/text-to-speech",
	turbo: "fal-ai/chatterbox/text-to-speech/turbo",
	s2s: "fal-ai/chatterbox/speech-to-speech",
} as const;

/**
 * Generate speech from text using Chatterbox TTS.
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

	const falKey = getApiKey("FAL_KEY");
	if (!falKey) {
		return {
			success: false,
			error: "FAL_KEY not configured. Run: qcut-pipeline set-key --name FAL_KEY --value <key>",
		};
	}

	const model = options.model || "chatterbox_tts";
	const endpointMap: Record<string, string> = {
		chatterbox_tts: CHATTERBOX_ENDPOINTS.tts,
		chatterbox_tts_turbo: CHATTERBOX_ENDPOINTS.turbo,
	};
	const endpoint = endpointMap[model];
	if (!endpoint) {
		return {
			success: false,
			error: `Unknown TTS model '${model}'. Use: chatterbox_tts, chatterbox_tts_turbo`,
		};
	}

	const startTime = Date.now();
	onProgress({
		stage: "generating",
		percent: 0,
		message: "Generating speech...",
		model,
	});

	const payload: Record<string, unknown> = { text: text.trim() };
	if (options.audioUrl) payload.audio_url = options.audioUrl;
	if (options.exaggeration !== undefined)
		payload.exaggeration = options.exaggeration;
	if (options.temperature !== undefined)
		payload.temperature = options.temperature;
	if (options.cfg !== undefined) payload.cfg = options.cfg;
	if (options.seed !== undefined) payload.seed = options.seed;

	try {
		const response = await fetch(`${FAL_API_BASE}/${endpoint}`, {
			method: "POST",
			headers: {
				Authorization: `Key ${falKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
			signal,
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => "");
			return {
				success: false,
				error: `FAL API error (${response.status}): ${errorText}`,
				duration: (Date.now() - startTime) / 1000,
			};
		}

		const data = await response.json();
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

		const fileName = audio?.file_name || "speech_output.wav";
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
				contentType: audio?.content_type || "audio/wav",
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

	const falKey = getApiKey("FAL_KEY");
	if (!falKey) {
		return {
			success: false,
			error: "FAL_KEY not configured. Run: qcut-pipeline set-key --name FAL_KEY --value <key>",
		};
	}

	const startTime = Date.now();
	onProgress({
		stage: "converting",
		percent: 0,
		message: "Converting speech...",
		model: "chatterbox_s2s",
	});

	// Resolve source: if it's a local path, it needs to be a URL
	const sourceUrl = /^https?:\/\//i.test(sourceInput)
		? sourceInput
		: `file://${resolve(sourceInput)}`;

	const payload: Record<string, unknown> = {
		source_audio_url: sourceUrl,
	};
	if (options.audioUrl) {
		payload.target_voice_audio_url = options.audioUrl;
	}

	try {
		const response = await fetch(
			`${FAL_API_BASE}/${CHATTERBOX_ENDPOINTS.s2s}`,
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

		const data = await response.json();
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
