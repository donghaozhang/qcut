/**
 * CLI Music Generation Handler
 *
 * Generates music tracks using MiniMax Music v2.6 via FAL.
 * Supports lyrics, instrumental mode, and audio quality settings.
 * Uses callModelApi for proper FAL queue polling.
 *
 * @module electron/native-pipeline/cli/cli-handlers-music
 */

import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";
import { callModelApi } from "../infra/api-caller.js";
import { ModelRegistry } from "../infra/registry.js";

interface MusicApiResponse {
	audio?: {
		url?: string;
		file_name?: string;
		content_type?: string;
	};
}

const DEFAULT_MODEL = "minimax_music_v2_6";

/**
 * Generate music from a text prompt with optional lyrics.
 *
 * Usage:
 *   qcut gen music -t "Upbeat pop, warm female vocal, 104 BPM"
 *   qcut gen music -t "City Pop, 80s retro" --lyrics "[verse] La da dee"
 *   qcut gen music -t "Cinematic orchestral" --instrumental
 */
export async function handleGenerateMusic(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const prompt = options.text || options.prompt;
	if (!prompt?.trim()) {
		return {
			success: false,
			error: "Missing --text/-t (music style/mood description, 10-300 chars)",
		};
	}

	const trimmedPrompt = prompt.trim();
	if (trimmedPrompt.length < 10 || trimmedPrompt.length > 300) {
		return {
			success: false,
			error: `Prompt must be 10-300 characters (got ${trimmedPrompt.length})`,
		};
	}

	// Resolve endpoint from the single source of truth (model registry) so the
	// handler and registry can't drift out of sync.
	const model = options.model || DEFAULT_MODEL;
	if (!ModelRegistry.has(model)) {
		return {
			success: false,
			error: `Unknown music model '${model}'. Use: ${ModelRegistry.keysForCategory("music").join(", ")}`,
		};
	}
	const modelDef = ModelRegistry.get(model);
	if (!modelDef.categories.includes("music")) {
		return {
			success: false,
			error: `Model '${model}' is not a music model. Use: ${ModelRegistry.keysForCategory("music").join(", ")}`,
		};
	}
	const endpoint = modelDef.endpoint;

	const isInstrumental = options.instrumental ?? false;

	// Fail loudly when the caller combines --instrumental with --lyrics so we
	// never silently drop their lyrics payload.
	if (isInstrumental && options.lyrics) {
		return {
			success: false,
			error: "--lyrics is not allowed when --instrumental is set",
		};
	}

	if (!isInstrumental && options.lyrics && options.lyrics.length > 1000) {
		return {
			success: false,
			error: `Lyrics must be under 1000 characters (got ${options.lyrics.length})`,
		};
	}

	const startTime = Date.now();
	onProgress({
		stage: "generating",
		percent: 0,
		message: isInstrumental
			? "Generating instrumental music..."
			: "Generating music with vocals...",
		model,
	});

	const payload: Record<string, unknown> = {
		prompt: trimmedPrompt,
		is_instrumental: isInstrumental,
	};

	if (!isInstrumental && options.lyrics) {
		payload.lyrics = options.lyrics;
	}

	// Audio quality settings — reject non-positive or non-finite numerics up
	// front rather than letting the provider return a generic 4xx later.
	const audioSetting: Record<string, unknown> = {};
	if (options.sampleRate !== undefined) {
		if (!Number.isFinite(options.sampleRate) || options.sampleRate <= 0) {
			return {
				success: false,
				error: `Invalid --sample-rate: ${options.sampleRate}`,
			};
		}
		audioSetting.sample_rate = options.sampleRate;
	}
	if (options.bitrate !== undefined) {
		if (!Number.isFinite(options.bitrate) || options.bitrate <= 0) {
			return {
				success: false,
				error: `Invalid --bitrate: ${options.bitrate}`,
			};
		}
		audioSetting.bitrate = options.bitrate;
	}
	if (options.audioFormat) audioSetting.format = options.audioFormat;
	if (Object.keys(audioSetting).length > 0) {
		payload.audio_setting = audioSetting;
	}

	let apiResult: Awaited<ReturnType<typeof callModelApi>>;
	try {
		apiResult = await callModelApi({
			endpoint,
			payload,
			provider: "fal",
			signal,
			modelKey: model,
		});
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			return {
				success: false,
				error: "Music generation cancelled",
				duration: (Date.now() - startTime) / 1000,
			};
		}
		return {
			success: false,
			error: `Music generation failed: ${err instanceof Error ? err.message : String(err)}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	if (!apiResult.success) {
		return {
			success: false,
			error: apiResult.error || "Music generation failed",
			duration: (Date.now() - startTime) / 1000,
		};
	}

	// Extract audio URL from response; validate the provider actually returned
	// string-shaped fields before we hand them to fetch()/basename().
	const data = apiResult.data as MusicApiResponse | undefined;
	const audioUrlCandidate =
		typeof data?.audio?.url === "string" ? data.audio.url : undefined;
	const audioUrl: string = audioUrlCandidate || apiResult.outputUrl || "";

	if (!audioUrl) {
		return {
			success: false,
			error: "No audio URL in response",
			duration: (Date.now() - startTime) / 1000,
		};
	}

	onProgress({
		stage: "downloading",
		percent: 80,
		message: "Downloading music...",
		model,
	});

	try {
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
		await mkdir(outputDir, { recursive: true });

		const ext = options.audioFormat || "mp3";
		const rawFileNameCandidate =
			typeof data?.audio?.file_name === "string"
				? data.audio.file_name
				: undefined;
		const rawFileName = rawFileNameCandidate || `music_${Date.now()}.${ext}`;
		const fileName = basename(rawFileName);
		const outputPath = join(outputDir, fileName);
		await writeFile(outputPath, audioBuffer);

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
					typeof data?.audio?.content_type === "string"
						? data.audio.content_type
						: `audio/${ext}`,
				instrumental: isInstrumental,
				prompt: trimmedPrompt,
			},
			duration: (Date.now() - startTime) / 1000,
		};
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			return {
				success: false,
				error: "Music generation cancelled",
				duration: (Date.now() - startTime) / 1000,
			};
		}
		return {
			success: false,
			error: `Music generation failed: ${err instanceof Error ? err.message : String(err)}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}
}
