/**
 * CLI Translate Handler
 *
 * Handles translate-video command using HeyGen Translate (Speed).
 * Supports local file upload via FAL CDN and URL passthrough.
 *
 * @module electron/native-pipeline/cli/cli-handlers-translate
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";
import { ModelRegistry } from "../infra/registry.js";
import { callModelApi, uploadToFalStorage } from "../infra/api-caller.js";
import { resolveOutputDir } from "../output/output-utils.js";

function isUrl(input: string): boolean {
	return /^https?:\/\//i.test(input);
}

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

export async function handleTranslateVideo(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const videoInput = options.input || options.videoUrl;
	if (!videoInput) {
		return {
			success: false,
			error: "Missing --input/-i (video path or URL)",
		};
	}

	const language = options.language;
	if (!language) {
		return {
			success: false,
			error: "Missing --language/-l (target language, e.g. Spanish)",
		};
	}

	const model = "heygen_translate_speed";
	if (!ModelRegistry.has(model)) {
		return {
			success: false,
			error: `Model '${model}' not registered. Ensure platform-models are loaded.`,
		};
	}

	const startTime = Date.now();
	let videoUrl = videoInput;

	// Upload local file to FAL CDN if not a URL
	if (!isUrl(videoInput)) {
		if (!existsSync(videoInput)) {
			return {
				success: false,
				error: `Video file not found: ${videoInput}`,
			};
		}

		onProgress({
			stage: "uploading",
			percent: 5,
			message: `Uploading ${basename(videoInput)} to FAL CDN...`,
			model,
		});

		const uploadResult = await uploadToFalStorage(videoInput);
		if (!uploadResult.success || !uploadResult.url) {
			return {
				success: false,
				error: `Upload failed: ${uploadResult.error || "Unknown error"}`,
			};
		}
		videoUrl = uploadResult.url;
	}

	onProgress({
		stage: "translating",
		percent: 15,
		message: `Translating video to ${language}...`,
		model,
	});

	// Build API payload
	const payload: Record<string, unknown> = {
		video_url: videoUrl,
		output_language: language,
		enable_dynamic_duration: !options.noDynamicDuration,
	};

	if (options.audioOnly) {
		payload.translate_audio_only = true;
	}
	if (options.speakers !== undefined) {
		payload.speaker_num = options.speakers;
	}

	const endpoint = "fal-ai/heygen/v2/translate/speed";
	const result = await callModelApi({
		endpoint,
		payload,
		provider: "fal",
		signal,
		onProgress: (percent, message) => {
			onProgress({
				stage: "translating",
				percent: Math.min(90, 15 + percent * 0.75),
				message: message || "Processing translation...",
				model,
			});
		},
	});

	if (!result.success) {
		return {
			success: false,
			error: `Translation failed: ${result.error}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	onProgress({
		stage: "complete",
		percent: 100,
		message: "Translation complete",
		model,
	});

	// Extract video URL from result
	const outputVideoUrl = result.outputUrl;

	if (!outputVideoUrl) {
		return {
			success: false,
			error: "Translation completed but no output video URL returned",
			duration: (Date.now() - startTime) / 1000,
		};
	}

	// Save output info
	const outputDir = resolveOutputDir(options.outputDir, `translate-${Date.now()}`);
	mkdirSync(outputDir, { recursive: true });

	const inputBasename = basename(videoInput).replace(/\.[^.]+$/, "");
	const jsonPath = join(
		outputDir,
		`${inputBasename}_translated_${language.toLowerCase()}.json`
	);

	const outputData = {
		source: videoInput,
		language,
		video_url: outputVideoUrl,
		model,
		audio_only: options.audioOnly || false,
		duration: (Date.now() - startTime) / 1000,
	};

	writeFileSync(jsonPath, JSON.stringify(outputData, null, 2));

	return {
		success: true,
		outputPath: jsonPath,
		data: outputData,
		duration: (Date.now() - startTime) / 1000,
	};
}
