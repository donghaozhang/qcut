/**
 * Export Mode Decision Logic for CLI Export
 *
 * Resolves word filter segments and builds the final export options object.
 */

import { useWordTimelineStore } from "@/stores/timeline/word-timeline-store";
import { WORD_FILTER_STATE } from "@/types/word-timeline";
import { calculateKeepSegments } from "../transcription/segment-calculator";
import { debugLog, debugWarn } from "@/lib/debug/debug-config";
import type { ExportAnalysis } from "./export-analysis";
import type {
	AudioCrossfadeInput,
	AudioFileInput,
	AudioMixConfigInput,
	VideoSourceInput,
	VideoTransitionInput,
	StickerSourceForFilter,
	ImageSourceInput,
} from "../export-cli/types";

export interface WordFilterResult {
	hasWordFilters: boolean;
	wordFilterSegments?: Array<{ start: number; end: number }>;
}

/** Resolves word filter state from the word timeline store and computes keep-segments for export. */
export function resolveWordFilters(
	totalDuration: number,
	videoInput: { path: string; trimStart: number; trimEnd: number } | null
): WordFilterResult {
	const wordTimelineData = useWordTimelineStore.getState().data;
	const hasWordFilters =
		wordTimelineData?.words.some(
			(word) =>
				word.filterState === WORD_FILTER_STATE.AI ||
				word.filterState === WORD_FILTER_STATE.USER_REMOVE
		) || false;

	debugLog(
		`[CLI Export] Word timeline data: ${wordTimelineData ? `${wordTimelineData.words.length} words` : "null"}`
	);
	if (wordTimelineData) {
		const stateCounts: Record<string, number> = {};
		for (const w of wordTimelineData.words) {
			stateCounts[w.filterState] = (stateCounts[w.filterState] || 0) + 1;
		}
		debugLog("[CLI Export] Filter state breakdown:", stateCounts);
	}
	debugLog(
		`[CLI Export] hasWordFilters: ${hasWordFilters}, videoInput: ${!!videoInput}`
	);

	let wordFilterSegments: Array<{ start: number; end: number }> | undefined;

	if (hasWordFilters && videoInput && wordTimelineData) {
		const filteredWords = wordTimelineData.words.filter(
			(w) =>
				w.filterState === WORD_FILTER_STATE.AI ||
				w.filterState === WORD_FILTER_STATE.USER_REMOVE
		);
		debugLog(
			`[CLI Export] Word filters active: ${filteredWords.length} words marked for removal`
		);

		const keepSegments = calculateKeepSegments({
			words: wordTimelineData.words,
			videoDuration: totalDuration,
			options: { bufferMs: 50, crossfadeMs: 30, minGapMs: 50 },
		});

		debugLog(`[CLI Export] Keep segments: ${keepSegments.length}`);

		const isFullLengthSegment =
			keepSegments.length === 1 &&
			Math.abs(keepSegments[0].start - 0) < 0.001 &&
			Math.abs(keepSegments[0].end - totalDuration) < 0.001;
		if (!isFullLengthSegment) {
			wordFilterSegments = keepSegments;
		}
	} else if (hasWordFilters && !videoInput) {
		debugWarn(
			"[CLI Export] Word filter cuts requested, but no single video input is available. Falling back to standard export."
		);
	}

	return { hasWordFilters, wordFilterSegments };
}

export interface BuildExportOptionsParams {
	sessionId: string;
	canvasWidth: number;
	canvasHeight: number;
	quality: string;
	totalDuration: number;
	fps: number;
	audioFiles: AudioFileInput[];
	audioCrossfades: AudioCrossfadeInput[];
	audioMixConfig: AudioMixConfigInput;
	combinedFilterChain: string;
	textFilterChain: string;
	textAssLayers: Array<{
		content: string;
		blendMode:
			| "normal"
			| "multiply"
			| "screen"
			| "overlay"
			| "darken"
			| "lighten";
		trackOrder: number;
		elementOrder: number;
	}>;
	stickerFilterChain: string | undefined;
	stickerSources: StickerSourceForFilter[];
	imageFilterChain: string | undefined;
	imageSources: ImageSourceInput[];
	exportAnalysis: ExportAnalysis | null;
	hasTextFilters: boolean;
	hasStickerFilters: boolean;
	wordFilterSegments: Array<{ start: number; end: number }> | undefined;
	videoSources: VideoSourceInput[];
	videoTransitions?: VideoTransitionInput[];
	videoInput: { path: string; trimStart: number; trimEnd: number } | null;
	backgroundColor?: string;
}

/** Assembles the final FFmpeg export options object from analysis results and filter chains. */
export function buildExportOptions(params: BuildExportOptionsParams) {
	const {
		sessionId,
		canvasWidth,
		canvasHeight,
		quality,
		totalDuration,
		fps,
		audioFiles,
		audioCrossfades,
		audioMixConfig,
		combinedFilterChain,
		textFilterChain,
		textAssLayers,
		stickerFilterChain,
		stickerSources,
		imageFilterChain,
		imageSources,
		exportAnalysis,
		hasTextFilters,
		hasStickerFilters,
		wordFilterSegments,
		videoSources,
		videoTransitions = [],
		videoInput,
		backgroundColor,
	} = params;

	const hasImageFilters = imageSources.length > 0;

	return {
		sessionId,
		width: canvasWidth,
		height: canvasHeight,
		fps,
		quality: quality || "medium",
		duration: totalDuration,
		audioFiles,
		audioCrossfades:
			audioCrossfades.length > 0 ? audioCrossfades : undefined,
		audioMixConfig,
		filterChain: combinedFilterChain || undefined,
		textFilterChain: hasTextFilters ? textFilterChain : undefined,
		textAssLayers: textAssLayers.length > 0 ? textAssLayers : undefined,
		stickerFilterChain,
		stickerSources,
		imageFilterChain,
		imageSources,
		useDirectCopy: !!(
			exportAnalysis?.canUseDirectCopy &&
			fps === 30 &&
			exportAnalysis?.optimizationStrategy !== "video-normalization" &&
			!hasTextFilters &&
			!hasStickerFilters &&
			!hasImageFilters &&
			audioCrossfades.length === 0 &&
			!wordFilterSegments
		),
		videoSources: videoSources.length > 0 ? videoSources : undefined,
		videoTransitions:
			videoTransitions.length > 0 ? videoTransitions : undefined,
		useVideoInput: !!videoInput,
		videoInputPath: videoInput?.path,
		trimStart: videoInput?.trimStart || 0,
		trimEnd: videoInput?.trimEnd || 0,
		wordFilterSegments,
		crossfadeMs: 30,
		backgroundColor,
		optimizationStrategy: exportAnalysis?.optimizationStrategy,
	};
}
