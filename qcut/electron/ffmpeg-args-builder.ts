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
	AudioCrossfade,
	AudioFile,
	VideoSource,
	VideoTransition,
	ImageSource,
	StickerSource,
	QualitySettings,
} from "./ffmpeg/types";

import { QUALITY_SETTINGS, debugLog, debugWarn } from "./ffmpeg/utils";
import {
	buildVideoTimelineFilters,
	buildVideoTimelineLayers,
} from "./ffmpeg-video-transform";
import { buildTimelineAudioFilters } from "./ffmpeg/audio-filter-graph";
import {
	composePreparedVisualLayers,
	type PreparedVisualLayer,
} from "./ffmpeg/visual-layer-compositor";

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
	audioCrossfades?: AudioCrossfade[];
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
		trackOrder?: number;
		elementOrder?: number;
	}>;
	useDirectCopy?: boolean;
	videoSources?: VideoSource[];
	videoTransitions?: VideoTransition[];
	stickerFilterChain?: string;
	stickerSources?: StickerSource[];
	imageFilterChain?: string;
	imageSources?: ImageSource[];
	useVideoInput?: boolean;
	videoInputPath?: string;
	trimStart?: number;
	trimEnd?: number;
	backgroundColor?: string;
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

interface ResolvedTextAssLayer {
	path: string;
	blendMode:
		| "normal"
		| "multiply"
		| "screen"
		| "overlay"
		| "darken"
		| "lighten";
	trackOrder?: number;
	elementOrder?: number;
	sourceIndex: number;
}

function ffmpegColorValue(color: string): string {
	if (color.trim().toLowerCase() === "#000000") return "black";
	const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
	return match ? `0x${match[1]}` : "black";
}

function buildCanonicalVisualFilters({
	videoSources,
	videoTransitions,
	images,
	stickers,
	textAssLayers,
	baseInputCount,
	width,
	height,
	fps,
	duration,
	backgroundColor,
	filterChain,
	textFilterChain,
}: {
	videoSources: VideoSource[];
	videoTransitions: VideoTransition[];
	images: ImageSource[];
	stickers: StickerSource[];
	textAssLayers: ResolvedTextAssLayer[];
	baseInputCount: number;
	width: number;
	height: number;
	fps: number;
	duration: number;
	backgroundColor: string;
	filterChain?: string;
	textFilterChain?: string;
}): { filterSteps: string[]; outputLabel: string } {
	const filterSteps: string[] = [];
	const layers: PreparedVisualLayer[] = [];
	let baseLabel = "0:v";
	const imageSources: VideoSource[] = images.map((image) => ({
		elementId: image.elementId,
		trackId: image.trackId,
		trackOrder: image.trackOrder,
		elementOrder: image.elementOrder,
		path: image.path,
		startTime: image.startTime,
		duration: image.duration,
		trimStart: image.trimStart,
		trimEnd: image.trimEnd,
		visual: image.visual,
		effectFilter: image.effectFilter,
	}));
	const timelineSources = [...videoSources, ...imageSources];
	const inputIndexes = timelineSources.map((_source, index) =>
		index < videoSources.length
			? index
			: baseInputCount + index - videoSources.length
	);

	if (videoSources.length > 0) {
		baseLabel = "visual_timeline_background";
		filterSteps.push(
			`color=c=${ffmpegColorValue(backgroundColor)}:s=${width}x${height}:d=${duration}:r=${fps},` +
				`format=rgba,settb=AVTB,setpts=PTS-STARTPTS[${baseLabel}]`
		);
	}

	if (timelineSources.length > 0) {
		const builtTimeline = buildVideoTimelineLayers({
			videoSources: timelineSources,
			videoTransitions,
			inputIndexes,
			width,
			height,
			fps,
			totalDuration: duration,
			backgroundColor,
		});
		filterSteps.push(...builtTimeline.filterSteps);
		for (const layer of builtTimeline.layers) {
			layers.push({
				inputLabel: layer.outputLabel,
				kind: "video",
				trackOrder: layer.trackOrder,
				elementOrder: layer.elementOrder,
				sourceOrder: layer.sourceIndex,
				legacyOrder: 0,
				blendMode: layer.blendMode,
				startTime: layer.startTime,
				endTime: layer.endTime,
			});
		}
	}

	const stickerInputStartIndex = baseInputCount + images.length;
	for (const [index, sticker] of stickers.entries()) {
		const stickerInputIndex = stickerInputStartIndex + index;
		const scaledLabel = `visual_sticker_scaled_${index}`;
		let preparedLabel = scaledLabel;
		if (sticker.maintainAspectRatio) {
			const paddedLabel = `visual_sticker_padded_${index}`;
			filterSteps.push(
				`[${stickerInputIndex}:v]scale=${sticker.width}:${sticker.height}:force_original_aspect_ratio=decrease[${scaledLabel}]`
			);
			filterSteps.push(
				`[${scaledLabel}]pad=${sticker.width}:${sticker.height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000[${paddedLabel}]`
			);
			preparedLabel = paddedLabel;
		} else {
			filterSteps.push(
				`[${stickerInputIndex}:v]scale=${sticker.width}:${sticker.height}[${scaledLabel}]`
			);
		}
		if ((sticker.rotation ?? 0) !== 0) {
			const rotatedLabel = `visual_sticker_rotated_${index}`;
			filterSteps.push(
				`[${preparedLabel}]rotate=${sticker.rotation}*PI/180:c=none[${rotatedLabel}]`
			);
			preparedLabel = rotatedLabel;
		}
		if ((sticker.opacity ?? 1) < 1) {
			const alphaLabel = `visual_sticker_alpha_${index}`;
			filterSteps.push(
				`[${preparedLabel}]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${sticker.opacity}*alpha(X,Y)'[${alphaLabel}]`
			);
			preparedLabel = alphaLabel;
		}
		layers.push({
			inputLabel: preparedLabel,
			kind: "sticker",
			trackOrder: sticker.trackOrder,
			elementOrder: sticker.elementOrder,
			sourceOrder: stickerInputIndex,
			legacyOrder: 2,
			blendMode: "normal",
			startTime: sticker.startTime,
			endTime: sticker.endTime,
			x: sticker.x,
			y: sticker.y,
		});
	}

	for (const [index, layer] of textAssLayers.entries()) {
		if (!fs.existsSync(layer.path)) {
			throw new Error(`ASS text overlay file not found: ${layer.path}`);
		}
		const overlayLabel = `visual_text_ass_${index}`;
		filterSteps.push(
			`color=c=black@0.0:s=${width}x${height}:d=${duration}:r=${fps},format=rgba,` +
				`ass=filename='${escapeFilterPath(layer.path)}':alpha=1[${overlayLabel}]`
		);
		layers.push({
			inputLabel: overlayLabel,
			kind: "text",
			trackOrder: layer.trackOrder,
			elementOrder: layer.elementOrder,
			sourceOrder: layer.sourceIndex,
			legacyOrder: 4,
			blendMode: layer.blendMode,
		});
	}

	const composed = composePreparedVisualLayers({ baseLabel, layers });
	filterSteps.push(...composed.filterSteps);
	let outputLabel = composed.outputLabel;
	let postFilterIndex = 0;
	for (const postFilter of [filterChain, textFilterChain]) {
		if (!postFilter) continue;
		const nextLabel = `visual_post_filter_${postFilterIndex++}`;
		filterSteps.push(`[${outputLabel}]${postFilter}[${nextLabel}]`);
		outputLabel = nextLabel;
	}

	return { filterSteps, outputLabel };
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
		audioCrossfades = [],
		filterChain,
		textFilterChain,
		textAssPath,
		textAssLayers = [],
		stickerSources = [],
		imageSources = [],
		useVideoInput = false,
		videoInputPath,
		videoSources = [],
		videoTransitions = [],
		trimStart,
		backgroundColor = "#000000",
	} = options;
	const { crf, preset } = qualitySettings;
	const args: string[] = ["-y"];

	let hasBaseVideoInput = false;
	let baseInputCount = 1;

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
		baseInputCount = videoSources.length;
		for (const videoSource of videoSources) {
			if (!fs.existsSync(videoSource.path)) {
				throw new Error(`Video source not found: ${videoSource.path}`);
			}
			args.push("-i", videoSource.path);
		}
		hasBaseVideoInput = true;
	} else if (imageSources.length > 0) {
		debugLog("[FFmpeg] IMAGE-ONLY: Using generated black background");
		args.push(
			"-f",
			"lavfi",
			"-i",
			`color=c=${ffmpegColorValue(backgroundColor)}:s=${width}x${height}:d=${duration}:r=${fps}`
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
	const resolvedTextAssLayers: ResolvedTextAssLayer[] = [
		...(textAssPath
			? [{ path: textAssPath, blendMode: "normal" as const }]
			: []),
		...textAssLayers,
	].map((layer, sourceIndex) => ({ ...layer, sourceIndex }));
	const usesCanonicalVisualOrder =
		!useVideoInput &&
		[
			...videoSources,
			...validImages,
			...validStickers,
			...resolvedTextAssLayers,
		].some((layer) => Number.isFinite(layer.trackOrder));

	if (usesCanonicalVisualOrder) {
		const canonical = buildCanonicalVisualFilters({
			videoSources,
			videoTransitions,
			images: validImages,
			stickers: validStickers,
			textAssLayers: resolvedTextAssLayers,
			baseInputCount,
			width,
			height,
			fps,
			duration,
			backgroundColor,
			filterChain,
			textFilterChain,
		});
		filterSteps.push(...canonical.filterSteps);
		currentVideoLabel = canonical.outputLabel;
	} else {
		let filterLabelIndex = 0;
		if (videoSources.length > 0) {
			const timeline = buildVideoTimelineFilters({
				videoSources,
				videoTransitions,
				width,
				height,
				fps,
				totalDuration: duration,
				backgroundColor,
			});
			filterSteps.push(...timeline.filterSteps);
			currentVideoLabel = timeline.outputLabel;
		}

		if (filterChain) {
			const outputLabel = `v_fx_${filterLabelIndex++}`;
			filterSteps.push(`[${currentVideoLabel}]${filterChain}[${outputLabel}]`);
			currentVideoLabel = outputLabel;
		}

		for (const [index, image] of validImages.entries()) {
			const imageInputIndex = baseInputCount + index;
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

		const stickerInputStartIndex = baseInputCount + validImages.length;
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

		const legacyTextAssLayers = resolvedTextAssLayers.sort((a, b) => {
			const aHasOrder = Number.isFinite(a.trackOrder);
			const bHasOrder = Number.isFinite(b.trackOrder);
			if (aHasOrder && bHasOrder) {
				const trackDifference = (b.trackOrder ?? 0) - (a.trackOrder ?? 0);
				if (trackDifference !== 0) return trackDifference;
				const elementDifference = (a.elementOrder ?? 0) - (b.elementOrder ?? 0);
				if (elementDifference !== 0) return elementDifference;
			}
			return a.sourceIndex - b.sourceIndex;
		});
		for (const [index, layer] of legacyTextAssLayers.entries()) {
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
				filterSteps.push(
					`[${overlayLabel}]split=2[${textBlend}][${textAlpha}]`
				);
				filterSteps.push(
					`[${baseBlend}][${textBlend}]blend=all_mode=${layer.blendMode}[${blended}]`
				);
				filterSteps.push(`[${textAlpha}]alphaextract[${mask}]`);
				filterSteps.push(
					`[${blended}][${mask}]alphamerge[${blendedWithAlpha}]`
				);
				filterSteps.push(
					`[${baseOriginal}][${blendedWithAlpha}]overlay=shortest=1:format=auto[${outputLabel}]`
				);
			}
			currentVideoLabel = outputLabel;
		}
	}

	const audioInputStartIndex =
		baseInputCount + validImages.length + validStickers.length;
	const audioResult = buildTimelineAudioFilters({
		audioFiles,
		audioCrossfades,
		audioStartIndex: audioInputStartIndex,
		fps,
	});
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
		duration,
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
		let outputDuration = duration;

		if (videoSources.length === 1) {
			const video = videoSources[0];
			if (!fs.existsSync(video.path)) {
				throw new Error(`Video source not found: ${video.path}`);
			}

			const effectiveDuration =
				video.duration - (video.trimStart || 0) - (video.trimEnd || 0);
			outputDuration = effectiveDuration;

			if (video.trimStart && video.trimStart > 0) {
				args.push("-ss", String(video.trimStart));
			}
			args.push("-i", video.path);
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
			const audioGraph = buildTimelineAudioFilters({
				audioFiles,
				audioCrossfades: options.audioCrossfades ?? [],
				audioStartIndex: 1,
				fps: options.fps,
			});
			if (audioGraph.filterSteps.length > 0) {
				args.push("-filter_complex", audioGraph.filterSteps.join(";"));
			}
			args.push("-map", "0:v", "-map", audioGraph.mapAudio ?? "1:a");
			args.push("-c:a", "aac", "-b:a", "128k");
		}

		args.push("-c:v", "copy");
		if (outputDuration > 0) {
			args.push("-t", String(outputDuration));
		}
		args.push("-movflags", "+faststart", outputFile);
		return args;
	}

	throw new Error(
		"Invalid export configuration. Expected Mode 1, Mode 1.5, or Mode 2."
	);
}
