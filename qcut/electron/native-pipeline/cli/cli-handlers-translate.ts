/**
 * CLI Translate Handler
 *
 * Handles translate-video command using HeyGen Translate (Speed).
 * Supports local file upload via FAL CDN and URL passthrough.
 * Supports audio input (wraps in dummy video) and audio-only output.
 *
 * @module electron/native-pipeline/cli/cli-handlers-translate
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";
import { ModelRegistry } from "../infra/registry.js";
import {
	callModelApi,
	uploadToFalStorage,
	downloadOutput,
} from "../infra/api-caller.js";
import { resolveOutputDir } from "../output/output-utils.js";

const execFileAsync = promisify(execFile);

const AUDIO_EXTENSIONS = new Set([
	".mp3",
	".wav",
	".flac",
	".aac",
	".ogg",
	".m4a",
	".wma",
	".opus",
]);

function isUrl(input: string): boolean {
	return /^https?:\/\//i.test(input);
}

function isAudioFile(filePath: string): boolean {
	return AUDIO_EXTENSIONS.has(extname(filePath).toLowerCase());
}

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
	model?: string;
}) => void;

async function resolveFFmpegPath(): Promise<string> {
	try {
		const { getFFmpegPath } = await import("../../ffmpeg/paths.js");
		return getFFmpegPath();
	} catch {
		const staged = path.join(
			__dirname,
			"..",
			"..",
			"resources",
			"ffmpeg",
			`${process.platform}-${process.arch}`,
			process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
		);
		if (fs.existsSync(staged)) return staged;
		return "ffmpeg";
	}
}

/** Wrap an audio file in a minimal black video for the HeyGen API. */
async function wrapAudioInVideo(
	audioPath: string,
	outputDir: string
): Promise<string> {
	const ffmpeg = await resolveFFmpegPath();
	const outputPath = join(outputDir, `_wrapped_${Date.now()}.mp4`);

	await execFileAsync(ffmpeg, [
		"-f",
		"lavfi",
		"-i",
		"color=c=black:s=640x360:r=1",
		"-i",
		audioPath,
		"-shortest",
		"-c:v",
		"libx264",
		"-tune",
		"stillimage",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-pix_fmt",
		"yuv420p",
		"-y",
		outputPath,
	]);

	return outputPath;
}

/** Extract audio from a video file. */
async function extractAudio(
	videoPath: string,
	outputPath: string
): Promise<string> {
	const ffmpeg = await resolveFFmpegPath();

	await execFileAsync(ffmpeg, [
		"-i",
		videoPath,
		"-vn",
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-y",
		outputPath,
	]);

	return outputPath;
}

export async function handleTranslateVideo(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal
): Promise<CLIResult> {
	const mediaInput = options.input || options.videoUrl;
	if (!mediaInput) {
		return {
			success: false,
			error: "Missing --input/-i (video or audio path/URL)",
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
	const sessionId = `translate-${Date.now()}`;
	const outputDir = resolveOutputDir(options.outputDir, sessionId);
	mkdirSync(outputDir, { recursive: true });

	const inputIsAudio = !isUrl(mediaInput) && isAudioFile(mediaInput);
	const wantAudioOutput = inputIsAudio || options.outputAudio;
	let videoInput = mediaInput;
	let wrappedVideoPath: string | undefined;

	// If input is audio, wrap it in a dummy video
	if (inputIsAudio) {
		if (!existsSync(mediaInput)) {
			return { success: false, error: `Audio file not found: ${mediaInput}` };
		}

		onProgress({
			stage: "preparing",
			percent: 2,
			message: "Wrapping audio in video for translation...",
			model,
		});

		try {
			wrappedVideoPath = await wrapAudioInVideo(mediaInput, outputDir);
			videoInput = wrappedVideoPath;
		} catch (err) {
			return {
				success: false,
				error: `Failed to wrap audio in video: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}

	let videoUrl = videoInput;

	// Upload local file to FAL CDN if not a URL
	if (!isUrl(videoInput)) {
		if (!existsSync(videoInput)) {
			return {
				success: false,
				error: `File not found: ${videoInput}`,
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
		message: `Translating ${inputIsAudio ? "audio" : "video"} to ${language}...`,
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
		stage: "downloading",
		percent: 92,
		message: "Downloading translated output...",
		model,
	});

	// Extract video URL from result
	const outputVideoUrl = result.outputUrl;

	if (!outputVideoUrl) {
		return {
			success: false,
			error: "Translation completed but no output URL returned",
			duration: (Date.now() - startTime) / 1000,
		};
	}

	// Download translated video
	const inputBasename = basename(mediaInput).replace(/\.[^.]+$/, "");
	const safeLang = basename(language).toLowerCase();
	const videoFilename = `${inputBasename}_translated_${safeLang}.mp4`;
	const videoPath = join(outputDir, videoFilename);

	let downloadedPath: string | undefined;
	try {
		downloadedPath = await downloadOutput(outputVideoUrl, videoPath);
	} catch (err) {
		return {
			success: false,
			error: `Failed to download translated output: ${err instanceof Error ? err.message : String(err)}`,
			duration: (Date.now() - startTime) / 1000,
		};
	}

	// If audio output wanted, extract audio from the downloaded video
	let audioOutputPath: string | undefined;
	if (wantAudioOutput && downloadedPath) {
		onProgress({
			stage: "extracting",
			percent: 96,
			message: "Extracting translated audio...",
			model,
		});

		const audioFilename = `${inputBasename}_translated_${safeLang}.m4a`;
		const audioPath = join(outputDir, audioFilename);

		try {
			audioOutputPath = await extractAudio(downloadedPath, audioPath);
		} catch (err) {
			// Non-fatal: return the video if audio extraction fails
			onProgress({
				stage: "extracting",
				percent: 98,
				message: `Warning: Audio extraction failed (${err instanceof Error ? err.message : String(err)}), returning video`,
				model,
			});
		}
	}

	// Clean up wrapped video
	if (wrappedVideoPath && existsSync(wrappedVideoPath)) {
		try {
			fs.unlinkSync(wrappedVideoPath);
		} catch {
			// ignore cleanup errors
		}
	}

	onProgress({
		stage: "complete",
		percent: 100,
		message: "Translation complete",
		model,
	});

	const primaryOutput =
		wantAudioOutput && audioOutputPath
			? audioOutputPath
			: (downloadedPath ?? undefined);

	const outputData = {
		source: mediaInput,
		language,
		video_url: outputVideoUrl,
		video_path: downloadedPath ?? null,
		audio_path: audioOutputPath ?? null,
		model,
		audio_only: options.audioOnly || false,
		input_was_audio: inputIsAudio,
		duration: (Date.now() - startTime) / 1000,
	};

	const jsonPath = join(
		outputDir,
		`${inputBasename}_translated_${safeLang}.json`
	);
	writeFileSync(jsonPath, JSON.stringify(outputData, null, 2));

	return {
		success: true,
		outputPath: primaryOutput ?? jsonPath,
		outputPaths: [downloadedPath, audioOutputPath].filter(
			(p): p is string => !!p
		),
		data: outputData,
		duration: (Date.now() - startTime) / 1000,
	};
}
