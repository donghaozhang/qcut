/**
 * FFmpeg Argument Builder
 *
 * Pure function that constructs FFmpeg command-line argument arrays.
 * No IPC or Electron dependencies — takes a config, returns string[].
 *
 * Location: electron/ffmpeg-args-builder.ts
 */

import path from "path";
import fs from "fs";

import type {
	AudioFile,
	VideoSource,
	ImageSource,
	StickerSource,
	QualitySettings,
} from "./ffmpeg/types";

import { QUALITY_SETTINGS, debugLog, debugWarn } from "./ffmpeg/utils";

/**
 * Object options for FFmpeg arg generation.
 */
export interface BuildFFmpegArgsOptions {
	inputDir: string;
	outputFile: string;
	width: number;
	height: number;
	fps: number;
	quality: "high" | "medium" | "low";
	duration: number;
	audioFiles?: AudioFile[];
	filterChain?: string;
	textFilterChain?: string;
	textAssPath?: string;
	textAssLayers?: Array<{
		path: string;
		blendMode:
			| "normal"
			| "multiply"
			| "screen"
			| "overlay"
			| "darken"
			| "lighten";
	}>;
	useDirectCopy?: boolean;
	videoSources?: VideoSource[];
	stickerFilterChain?: string;
	stickerSources?: StickerSource[];
	imageFilterChain?: string;
	imageSources?: ImageSource[];
	useVideoInput?: boolean;
	videoInputPath?: string;
	trimStart?: number;
	trimEnd?: number;
}

interface AudioFilterBuildResult {
	mapAudio: string | null;
	filterSteps: string[];
}

function resolveQuality(quality: "high" | "medium" | "low"): QualitySettings {
	return QUALITY_SETTINGS[quality] || QUALITY_SETTINGS.medium;
}

function normalizeConcatPath(filePath: string): string {
	return filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function escapeFilterPath(filePath: string): string {
	return filePath
		.replace(/\\/g, "/")
		.replace(/'/g, "\\'")
		.replace(/:/g, "\\:")
		.replace(/([,;[\]])/g, "\\$1");
}

function buildAudioFilters(
	audioFiles: AudioFile[],
	audioStartIndex: number
): AudioFilterBuildResult {
	if (audioFiles.length === 0) {
		return { mapAudio: null, filterSteps: [] };
	}

	const singleAudio = audioFiles.length === 1 ? audioFiles[0] : null;
	if (
		singleAudio &&
		(singleAudio.startTime ?? 0) <= 0 &&
		(singleAudio.volume ?? 1) === 1
	) {
		return {
			mapAudio: `${audioStartIndex}:a`,
			filterSteps: [],
		};
	}

	const filterSteps: string[] = [];
	const mixedLabels: string[] = [];

	for (const [index, audioFile] of audioFiles.entries()) {
		const delayMs = Math.round((audioFile.startTime ?? 0) * 1000);
		const volume = audioFile.volume ?? 1;
		const outputLabel = `a_${index}`;
		const transforms: string[] = [];

		if (delayMs > 0) {
			transforms.push(`adelay=${delayMs}|${delayMs}`);
		}

		if (volume !== 1) {
			transforms.push(`volume=${volume}`);
		}

		const transformChain =
			transforms.length > 0 ? transforms.join(",") : "anull";
		const inputIndex = audioStartIndex + index;
		filterSteps.push(`[${inputIndex}:a]${transformChain}[${outputLabel}]`);
		mixedLabels.push(`[${outputLabel}]`);
	}

	if (mixedLabels.length === 1) {
		return {
			mapAudio: mixedLabels[0],
			filterSteps,
		};
	}

	filterSteps.push(
		`${mixedLabels.join("")}amix=inputs=${mixedLabels.length}:duration=longest[a_mix]`
	);
	return {
		mapAudio: "[a_mix]",
		filterSteps,
	};
}

function buildCompositeEncodeArgs(
	options: BuildFFmpegArgsOptions,
	qualitySettings: QualitySettings
): string[] {
	const {
		inputDir,
		outputFile,
		width,
		height,
		fps,
		duration,
		audioFiles = [],
		filterChain,
		textFilterChain,
		textAssPath,
		textAssLayers = [],
		stickerSources = [],
		imageSources = [],
		useVideoInput = false,
		videoInputPath,
		videoSources = [],
		trimStart,
	} = options;
	const { crf, preset } = qualitySettings;
	const args: string[] = ["-y"];

	let hasBaseVideoInput = false;

	if (useVideoInput && videoInputPath) {
		debugLog("[FFmpeg] MODE 2: Using direct video input with filters");
		if (!fs.existsSync(videoInputPath)) {
			throw new Error(`Video source not found: ${videoInputPath}`);
		}

		if ((trimStart ?? 0) > 0) {
			args.push("-ss", String(trimStart));
		}
		args.push("-i", videoInputPath);
		hasBaseVideoInput = true;
	} else if (videoSources.length > 0) {
		debugLog("[FFmpeg] MODE 2: Using videoSources as base video input");
		if (videoSources.length === 1) {
			const videoSource = videoSources[0];
			if (!fs.existsSync(videoSource.path)) {
				throw new Error(`Video source not found: ${videoSource.path}`);
			}
			if ((videoSource.trimStart ?? 0) > 0) {
				args.push("-ss", String(videoSource.trimStart));
			}
			args.push("-i", videoSource.path);
		} else {
			const hasTrimmedSources = videoSources.some(
				(video) => (video.trimStart ?? 0) > 0 || (video.trimEnd ?? 0) > 0
			);
			if (hasTrimmedSources) {
				throw new Error(
					"Image/video composite with multiple trimmed videos is not supported. Use a single base video for now."
				);
			}

			const concatFileContent = videoSources
				.map((video) => {
					if (!fs.existsSync(video.path)) {
						throw new Error(`Video source not found: ${video.path}`);
					}
					return `file '${normalizeConcatPath(video.path)}'`;
				})
				.join("\n");

			const concatFilePath = path.join(inputDir, "concat-composite-list.txt");
			fs.writeFileSync(concatFilePath, concatFileContent);
			args.push("-f", "concat", "-safe", "0", "-i", concatFilePath);
		}
		hasBaseVideoInput = true;
	} else if (imageSources.length > 0) {
		debugLog("[FFmpeg] IMAGE-ONLY: Using generated black background");
		args.push(
			"-f",
			"lavfi",
			"-i",
			`color=c=black:s=${width}x${height}:d=${duration}:r=${fps}`
		);
	} else {
		throw new Error("Composite mode requires a video input or image sources.");
	}

	if (duration > 0) {
		args.push("-t", String(duration));
	}

	const validImages: ImageSource[] = [];
	for (const imageSource of imageSources) {
		if (!fs.existsSync(imageSource.path)) {
			debugWarn(`[FFmpeg] Image file not found: ${imageSource.path}`);
			continue;
		}

		validImages.push(imageSource);
		args.push(
			"-loop",
			"1",
			"-t",
			String(imageSource.duration),
			"-i",
			imageSource.path
		);
	}

	const validStickers: StickerSource[] = [];
	if (stickerSources.length > 0) {
		console.log(
			`🎨 [FFMPEG] Adding ${stickerSources.length} sticker input(s) to FFmpeg command...`
		);
	}
	for (const stickerSource of stickerSources) {
		if (!fs.existsSync(stickerSource.path)) {
			console.warn(
				`⚠️ [FFMPEG] Sticker file not found, skipping: ${stickerSource.path}`
			);
			debugWarn(`[FFmpeg] Sticker file not found: ${stickerSource.path}`);
			continue;
		}

		validStickers.push(stickerSource);
		// Limit loop duration to sticker's endTime to prevent infinite input streams
		args.push(
			"-loop",
			"1",
			"-t",
			String(stickerSource.endTime),
			"-i",
			stickerSource.path
		);
	}
	if (validStickers.length > 0) {
		console.log(
			`🎨 [FFMPEG] ${validStickers.length} sticker(s) validated and added as inputs`
		);
	}

	for (const audioFile of audioFiles) {
		if (!fs.existsSync(audioFile.path)) {
			throw new Error(`Audio file not found: ${audioFile.path}`);
		}
		args.push("-i", audioFile.path);
	}

	const filterSteps: string[] = [];
	let currentVideoLabel = "0:v";
	let filterLabelIndex = 0;

	if (filterChain) {
		const outputLabel = `v_fx_${filterLabelIndex++}`;
		filterSteps.push(`[${currentVideoLabel}]${filterChain}[${outputLabel}]`);
		currentVideoLabel = outputLabel;
	}

	for (const [index, image] of validImages.entries()) {
		const imageInputIndex = 1 + index;
		const scaledLabel = `img_scaled_${index}`;
		const paddedLabel = `img_padded_${index}`;
		const timedLabel = `img_timed_${index}`;
		const outputLabel = `v_img_${filterLabelIndex++}`;
		const endTime = image.startTime + image.duration;

		filterSteps.push(
			`[${imageInputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease[${scaledLabel}]`
		);
		filterSteps.push(
			`[${scaledLabel}]pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black[${paddedLabel}]`
		);
		filterSteps.push(
			`[${paddedLabel}]setpts=PTS+${image.startTime}/TB[${timedLabel}]`
		);
		filterSteps.push(
			`[${currentVideoLabel}][${timedLabel}]overlay=x=0:y=0:enable='between(t,${image.startTime},${endTime})'[${outputLabel}]`
		);
		currentVideoLabel = outputLabel;
	}

	const stickerInputStartIndex = 1 + validImages.length;
	for (const [index, sticker] of validStickers.entries()) {
		const stickerInputIndex = stickerInputStartIndex + index;
		const scaledLabel = `sticker_scaled_${index}`;
		let preparedLabel = scaledLabel;

		if (sticker.maintainAspectRatio) {
			// Preserve aspect ratio: scale to fit within target box, then pad with transparent pixels
			const padLabel = `sticker_pad_${index}`;
			filterSteps.push(
				`[${stickerInputIndex}:v]scale=${sticker.width}:${sticker.height}:force_original_aspect_ratio=decrease[${scaledLabel}]`
			);
			filterSteps.push(
				`[${scaledLabel}]pad=${sticker.width}:${sticker.height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000[${padLabel}]`
			);
			preparedLabel = padLabel;
		} else {
			filterSteps.push(
				`[${stickerInputIndex}:v]scale=${sticker.width}:${sticker.height}[${scaledLabel}]`
			);
		}

		if ((sticker.rotation ?? 0) !== 0) {
			const rotatedLabel = `sticker_rotated_${index}`;
			filterSteps.push(
				`[${preparedLabel}]rotate=${sticker.rotation}*PI/180:c=none[${rotatedLabel}]`
			);
			preparedLabel = rotatedLabel;
		}

		let stickerOverlayInputLabel = preparedLabel;
		if ((sticker.opacity ?? 1) < 1) {
			const alphaLabel = `sticker_alpha_${index}`;
			filterSteps.push(
				`[${preparedLabel}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${sticker.opacity}*alpha(X,Y)'[${alphaLabel}]`
			);
			stickerOverlayInputLabel = alphaLabel;
		}

		const outputLabel = `v_sticker_${filterLabelIndex++}`;
		const overlayParams = [
			`x=${sticker.x}`,
			`y=${sticker.y}`,
			`enable='between(t,${sticker.startTime},${sticker.endTime})'`,
		];
		filterSteps.push(
			`[${currentVideoLabel}][${stickerOverlayInputLabel}]overlay=${overlayParams.join(":")}[${outputLabel}]`
		);
		currentVideoLabel = outputLabel;
	}

	if (textFilterChain) {
		const outputLabel = `v_text_${filterLabelIndex++}`;
		filterSteps.push(
			`[${currentVideoLabel}]${textFilterChain}[${outputLabel}]`
		);
		currentVideoLabel = outputLabel;
	}

	const resolvedTextAssLayers = [
		...(textAssPath
			? [{ path: textAssPath, blendMode: "normal" as const }]
			: []),
		...textAssLayers,
	];
	for (const [index, layer] of resolvedTextAssLayers.entries()) {
		if (!fs.existsSync(layer.path)) {
			throw new Error(`ASS text overlay file not found: ${layer.path}`);
		}
		const overlayLabel = `text_ass_overlay_${index}`;
		filterSteps.push(
			`color=c=black@0.0:s=${width}x${height}:d=${duration}:r=${fps},format=rgba,ass=filename='${escapeFilterPath(layer.path)}':alpha=1[${overlayLabel}]`
		);
		const outputLabel = `v_text_ass_${filterLabelIndex++}`;
		if (layer.blendMode === "normal") {
			filterSteps.push(
				`[${currentVideoLabel}][${overlayLabel}]overlay=shortest=1:format=auto[${outputLabel}]`
			);
		} else {
			const baseOriginal = `text_base_original_${index}`;
			const baseBlendInput = `text_base_blend_input_${index}`;
			const baseBlend = `text_base_blend_${index}`;
			const textBlend = `text_blend_input_${index}`;
			const textAlpha = `text_alpha_input_${index}`;
			const blended = `text_blended_${index}`;
			const mask = `text_mask_${index}`;
			const blendedWithAlpha = `text_blended_alpha_${index}`;
			filterSteps.push(
				`[${currentVideoLabel}]split=2[${baseOriginal}][${baseBlendInput}]`
			);
			filterSteps.push(`[${baseBlendInput}]format=rgba[${baseBlend}]`);
			filterSteps.push(`[${overlayLabel}]split=2[${textBlend}][${textAlpha}]`);
			filterSteps.push(
				`[${baseBlend}][${textBlend}]blend=all_mode=${layer.blendMode}[${blended}]`
			);
			filterSteps.push(`[${textAlpha}]alphaextract[${mask}]`);
			filterSteps.push(`[${blended}][${mask}]alphamerge[${blendedWithAlpha}]`);
			filterSteps.push(
				`[${baseOriginal}][${blendedWithAlpha}]overlay=shortest=1:format=auto[${outputLabel}]`
			);
		}
		currentVideoLabel = outputLabel;
	}

	const audioInputStartIndex = 1 + validImages.length + validStickers.length;
	const audioResult = buildAudioFilters(audioFiles, audioInputStartIndex);
	for (const step of audioResult.filterSteps) {
		filterSteps.push(step);
	}

	if (filterSteps.length > 0) {
		args.push("-filter_complex", filterSteps.join(";"));
	}

	const videoMap = filterSteps.length > 0 ? `[${currentVideoLabel}]` : "0:v";
	args.push("-map", videoMap);

	let audioMap = audioResult.mapAudio;
	if (!audioMap && hasBaseVideoInput && audioFiles.length === 0) {
		audioMap = "0:a?";
	}

	if (audioMap) {
		args.push("-map", audioMap);
	}

	args.push("-c:v", "libx264");
	args.push("-preset", preset);
	args.push("-crf", crf);
	args.push("-pix_fmt", "yuv420p");

	if (audioMap) {
		args.push("-c:a", "aac", "-b:a", "128k");
	}

	args.push("-movflags", "+faststart", outputFile);
	return args;
}

/**
 * Constructs FFmpeg command-line arguments for video export.
 *
 * Supports:
 * - Direct copy mode for sequential videos without visual compositing
 * - Composite encode mode for video/text/image/sticker timelines
 */
export function buildFFmpegArgs(options: BuildFFmpegArgsOptions): string[] {
	const {
		inputDir,
		outputFile,
		quality,
		audioFiles = [],
		useDirectCopy = false,
		videoSources,
	} = options;
	const qualitySettings = resolveQuality(quality);

	if (
		options.useVideoInput ||
		(options.imageSources && options.imageSources.length > 0) ||
		(videoSources && videoSources.length > 0 && !useDirectCopy)
	) {
		return buildCompositeEncodeArgs(options, qualitySettings);
	}

	// =============================================================================
	// MODE 1: Direct copy for single/multiple videos
	// =============================================================================
	if (useDirectCopy && videoSources && videoSources.length > 0) {
		const args: string[] = ["-y"];

		if (videoSources.length === 1) {
			const video = videoSources[0];
			if (!fs.existsSync(video.path)) {
				throw new Error(`Video source not found: ${video.path}`);
			}

			const effectiveDuration =
				video.duration - (video.trimStart || 0) - (video.trimEnd || 0);

			if (video.trimStart && video.trimStart > 0) {
				args.push("-ss", String(video.trimStart));
			}
			args.push("-i", video.path);
			if (video.duration) {
				args.push("-t", String(effectiveDuration));
			}
		} else {
			// Multiple videos: concat demuxer (all sources must already be compatible)
			const concatFileContent = videoSources
				.map((video) => {
					if (!fs.existsSync(video.path)) {
						throw new Error(`Video source not found: ${video.path}`);
					}

					if (
						(video.trimStart && video.trimStart > 0) ||
						(video.trimEnd && video.trimEnd > 0)
					) {
						throw new Error(
							`Video '${path.basename(video.path)}' has trim values. Use Mode 1.5 for trimmed multi-video exports.`
						);
					}
					return `file '${normalizeConcatPath(video.path)}'`;
				})
				.join("\n");

			const concatFilePath = path.join(inputDir, "concat-list.txt");
			fs.writeFileSync(concatFilePath, concatFileContent);

			args.push("-f", "concat", "-safe", "0", "-i", concatFilePath);
		}

		if (audioFiles.length > 0) {
			for (const audioFile of audioFiles) {
				if (!fs.existsSync(audioFile.path)) {
					throw new Error(`Audio file not found: ${audioFile.path}`);
				}
				args.push("-i", audioFile.path);
			}

			if (audioFiles.length === 1) {
				const audioFile = audioFiles[0];
				if (audioFile.startTime > 0) {
					args.push(
						"-filter_complex",
						`[1:a]adelay=${Math.round(audioFile.startTime * 1000)}|${Math.round(audioFile.startTime * 1000)}[audio]`,
						"-map",
						"0:v",
						"-map",
						"[audio]"
					);
				} else {
					args.push("-map", "0:v", "-map", "1:a");
				}
			} else {
				const audioInputOffset = 1;
				const inputMaps: string[] = audioFiles.map((_, i) => {
					return `[${i + audioInputOffset}:a]`;
				});
				const mixFilter = `${inputMaps.join("")}amix=inputs=${audioFiles.length}:duration=longest[audio]`;

				args.push(
					"-filter_complex",
					mixFilter,
					"-map",
					"0:v",
					"-map",
					"[audio]"
				);
			}
			args.push("-c:a", "aac", "-b:a", "128k");
		}

		args.push("-c:v", "copy");
		args.push("-movflags", "+faststart", outputFile);
		return args;
	}

	throw new Error(
		"Invalid export configuration. Expected Mode 1, Mode 1.5, or Mode 2."
	);
}
