// Location: apps/web/src/lib/export-analysis.ts

import type { TimelineTrack, MediaElement } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import { ExportUnsupportedError } from "./export-errors";
import { hasMediaVisualEdits } from "@/lib/video/video-properties";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import { hasMediaAudioEdits } from "@/lib/audio/audio-properties";

/**
 * Analysis result determining export optimization strategy.
 * Direct copy is 15-48x faster but requires specific conditions.
 */
export interface ExportAnalysis {
	/** Requires frame-by-frame rendering (slow path) */
	needsImageProcessing: boolean;
	/** Requires frame rendering (images/overlapping videos need canvas compositing) */
	needsFrameRendering: boolean;
	/** Requires FFmpeg filter encoding (text/stickers can use filters instead of frames) */
	needsFilterEncoding: boolean;
	/** Contains static images requiring canvas compositing */
	hasImageElements: boolean;
	/** Contains text overlays requiring canvas rendering */
	hasTextElements: boolean;
	/** Contains stickers requiring canvas compositing */
	hasStickers: boolean;
	/** Contains visual effects requiring FFmpeg filters */
	hasEffects: boolean;
	/** Contains transform, crop, perspective, opacity, or blend edits on video clips */
	hasVideoVisualEdits: boolean;
	/** Contains clip-to-clip transitions requiring encoded video filters. */
	hasTransitions: boolean;
	/** Multiple videos that may need concatenation */
	hasMultipleVideoSources: boolean;
	/** Videos overlap in time; requires compositing, not concat */
	hasOverlappingVideos: boolean;
	/** Can use FFmpeg direct copy/concat (fast path) */
	canUseDirectCopy: boolean;
	/** Which export pipeline to use (Mode 3/image-pipeline removed - now throws error) */
	optimizationStrategy:
		| "direct-copy"
		| "direct-video-with-filters"
		| "video-normalization"
		| "image-video-composite";
	/** Human-readable explanation of strategy choice */
	reason: string;
}

/**
 * Optional export canvas properties supplied by the export engine.
 * Width/height come from export settings; fps is often a fixed project value.
 */
export interface ExportCanvasOptions {
	width?: number;
	height?: number;
	fps?: number;
}

type CanvasSettingSource = "export-settings" | "media-fallback" | "default";

interface ResolvedCanvasSettings {
	width: number;
	height: number;
	fps: number;
	source: CanvasSettingSource;
}

function resolveExportCanvasSettings(params: {
	exportSettings?: ExportCanvasOptions | null;
	fallbackWidth?: number | null;
	fallbackHeight?: number | null;
	fallbackFps?: number | null;
}): ResolvedCanvasSettings {
	const { exportSettings, fallbackWidth, fallbackHeight, fallbackFps } = params;

	const exportWidth = exportSettings?.width;
	const exportHeight = exportSettings?.height;
	const exportFps = exportSettings?.fps;

	const hasExportDimensions =
		typeof exportWidth === "number" &&
		exportWidth > 0 &&
		typeof exportHeight === "number" &&
		exportHeight > 0;
	const hasExportFps = typeof exportFps === "number" && exportFps > 0;

	// Use clear conditional logic instead of nested ternaries
	let resolvedWidth = 1280;
	let resolvedHeight = 720;
	let source: CanvasSettingSource = "default";

	if (hasExportDimensions) {
		resolvedWidth = exportWidth!;
		resolvedHeight = exportHeight!;
		source = "export-settings";
	} else if (
		typeof fallbackWidth === "number" &&
		fallbackWidth > 0 &&
		typeof fallbackHeight === "number" &&
		fallbackHeight > 0
	) {
		resolvedWidth = fallbackWidth;
		resolvedHeight = fallbackHeight;
		source = "media-fallback";
	}

	let resolvedFps = 30;
	if (hasExportFps) {
		resolvedFps = exportFps!;
	} else if (typeof fallbackFps === "number" && fallbackFps > 0) {
		resolvedFps = fallbackFps;
	}

	return {
		width: resolvedWidth,
		height: resolvedHeight,
		fps: resolvedFps,
		source,
	};
}

/**
 * Video metadata used to determine when normalization is required.
 */
export interface VideoProperties {
	width: number;
	height: number;
	fps: number;
	codec?: string;
	pixelFormat?: string;
}

/**
 * Extracts the intrinsic video properties for a media element.
 */
function extractVideoProperties(
	element: MediaElement,
	mediaItemsMap: Map<string, MediaItem>
): VideoProperties | null {
	const mediaItem = mediaItemsMap.get(element.mediaId);

	if (!mediaItem || mediaItem.type !== "video") {
		return null;
	}

	const metadata = mediaItem.metadata;

	const isRecord = (value: unknown): value is Record<string, unknown> =>
		typeof value === "object" && value !== null;

	const selectPositiveNumber = (candidates: unknown[]): number | undefined => {
		for (const candidate of candidates) {
			if (typeof candidate === "number" && candidate > 0) {
				return candidate;
			}
		}
		return;
	};

	const selectString = (candidates: unknown[]): string | undefined => {
		for (const candidate of candidates) {
			if (typeof candidate === "string") {
				return candidate;
			}
		}
		return;
	};

	const metadataRecord = isRecord(metadata) ? metadata : undefined;
	const rawVideoMetadata = metadataRecord?.video;
	const videoMetadata = isRecord(rawVideoMetadata)
		? rawVideoMetadata
		: undefined;

	const width = selectPositiveNumber([mediaItem.width, metadataRecord?.width]);
	const height = selectPositiveNumber([
		mediaItem.height,
		metadataRecord?.height,
	]);
	const fps = selectPositiveNumber([
		mediaItem.fps,
		metadataRecord?.fps,
		videoMetadata?.fps,
	]);

	if (!width || !height || !fps) {
		return null;
	}

	const codec = selectString([videoMetadata?.codec, metadataRecord?.codec]);
	const pixelFormat = selectString([
		videoMetadata?.pixelFormat,
		metadataRecord?.pixelFormat,
	]);

	return {
		width,
		height,
		fps,
		codec,
		pixelFormat,
	};
}

/**
 * Checks if all videos match the target export properties.
 *
 * WHY this check is critical:
 * - Mode 1 direct copy requires identical video properties
 * - Mismatches cause FFmpeg concat demuxer to fail
 * - Mode 1.5 normalization can fix mismatches (5-7x faster than Mode 3)
 *
 * Edge cases handled:
 * - Missing metadata: Returns false (triggers normalization)
 * - FPS tolerance: Uses 0.1 fps tolerance for floating point comparison
 * - Null properties: Treats as mismatch to ensure safe fallback
 *
 * @param videoElements - Array of video elements from timeline
 * @param mediaItemsMap - Map of media items for fast lookup
 * @param targetWidth - Export target width
 * @param targetHeight - Export target height
 * @param targetFps - Export target fps
 * @returns true if all videos match export settings, false if normalization needed
 */
function checkVideoPropertiesMatch(
	videoElements: MediaElement[],
	mediaItemsMap: Map<string, MediaItem>,
	targetWidth: number,
	targetHeight: number,
	targetFps: number
): boolean {
	console.log("🔍 [MODE 1.5 DETECTION] Checking video properties...");
	console.log(
		`🔍 [MODE 1.5 DETECTION] Target: ${targetWidth}x${targetHeight} @ ${targetFps}fps`
	);

	// Edge case: No videos to check
	if (videoElements.length === 0) {
		console.log("⚠️ [MODE 1.5 DETECTION] No video elements to check");
		return true; // No videos = no mismatches
	}

	// Check each video against export settings
	for (let i = 0; i < videoElements.length; i++) {
		const props = extractVideoProperties(videoElements[i], mediaItemsMap);

		// Missing metadata = needs normalization
		if (!props) {
			console.log(
				`⚠️ [MODE 1.5 DETECTION] Video ${i}: No properties found - triggering normalization`
			);
			return false;
		}

		console.log(
			`🔍 [MODE 1.5 DETECTION] Video ${i}: ${props.width}x${props.height} @ ${props.fps}fps`
		);

		// Resolution must match exactly
		if (props.width !== targetWidth || props.height !== targetHeight) {
			console.log(
				`⚠️ [MODE 1.5 DETECTION] Video ${i} resolution mismatch - normalization needed`
			);
			console.log(
				`   Expected: ${targetWidth}x${targetHeight}, Got: ${props.width}x${props.height}`
			);
			return false;
		}

		// FPS comparison with tolerance (floating point safety)
		const fpsTolerance = 0.1;
		const fpsDiff = Math.abs(props.fps - targetFps);
		if (fpsDiff > fpsTolerance) {
			console.log(
				`⚠️ [MODE 1.5 DETECTION] Video ${i} FPS mismatch - normalization needed`
			);
			console.log(
				`   Expected: ${targetFps}fps, Got: ${props.fps}fps, Diff: ${fpsDiff.toFixed(2)}fps`
			);
			return false;
		}
	}

	console.log(
		"✅ [MODE 1.5 DETECTION] All videos match export settings - can use direct copy"
	);
	return true;
}

/**
 * Analyzes timeline to determine optimal export strategy for performance.
 *
 * WHY this analysis matters:
 * - Mode 1 (direct copy) is 15-48x faster than frame rendering
 * - Mode 2 (direct video + filters) is 3-5x faster than frame rendering
 * - Mode 3 (frame rendering) is the slowest but most flexible
 *
 * Performance implications:
 * - Frame rendering: ~5-10s for typical 2s video (slow)
 * - Direct copy: ~0.1-0.5s (extremely fast)
 * - Direct video + filters: ~1-2s (fast)
 *
 * Edge cases handled:
 * - Videos without localPath (blob URLs) cannot use direct modes
 * - Overlapping videos require compositing (Mode 3 only)
 * - Trimmed videos are supported in all modes
 *
 * @param tracks - Timeline tracks containing all elements
 * @param mediaItems - All media items in the project
 * @returns Analysis result with optimization strategy and reasoning
 */
export function analyzeTimelineForExport(
	tracks: TimelineTrack[],
	mediaItems: MediaItem[],
	exportCanvas?: ExportCanvasOptions,
	overlayStickersCount?: number
): ExportAnalysis {
	// Create a map for fast media item lookup
	const mediaItemsMap = new Map(mediaItems.map((item) => [item.id, item]));

	let hasImageElements = false;
	let hasTextElements = false;
	let hasStickers = overlayStickersCount != null && overlayStickersCount > 0;
	let hasEffects = false;
	let hasVideoVisualEdits = false;
	const hasTransitions = tracks.some(
		(track) =>
			!track.hidden &&
			track.type === "media" &&
			(track.transitions?.length ?? 0) > 0
	);
	let videoElementCount = 0;
	const videoTimeRanges: Array<{ start: number; end: number }> = [];
	const videoElements: MediaElement[] = [];
	let allVideosHaveLocalPath = true;

	// Iterate through all tracks and elements
	for (const track of tracks) {
		for (const element of track.elements) {
			// Skip hidden elements
			if (element.hidden) continue;

			// Check for text-like overlay elements
			if (element.type === "text" || element.type === "markdown") {
				hasTextElements = true;
				continue;
			}

			// Check for sticker elements
			if (element.type === "sticker") {
				hasStickers = true;
				continue;
			}

			// Check for media elements (video/image)
			if (element.type === "media") {
				const mediaElement = element as MediaElement;
				const mediaItem = mediaItemsMap.get(mediaElement.mediaId);

				if (!mediaItem) continue;

				// Check if media item is an image
				if (mediaItem.type === "image") {
					hasImageElements = true;
				}

				// Track video elements and their time ranges
				if (mediaItem.type === "video") {
					if (
						hasMediaVisualEdits(mediaElement) ||
						hasMediaAudioEdits({ element: mediaElement })
					) {
						hasVideoVisualEdits = true;
						hasEffects = true;
					}
					videoElementCount++;
					const effectiveDuration = getMediaTimelineDuration(mediaElement);

					// Validate effective duration is positive
					if (effectiveDuration <= 0) {
						console.warn(
							`[EXPORT ANALYSIS] Invalid video duration for element ${element.id}: duration=${element.duration}, trimStart=${element.trimStart}, trimEnd=${element.trimEnd}`
						);
						continue; // Skip this element
					}

					const startTime = element.startTime;
					const endTime = element.startTime + effectiveDuration;
					videoTimeRanges.push({ start: startTime, end: endTime });
					videoElements.push(mediaElement);

					// Check if this video has a localPath (required for direct copy)
					if (!mediaItem.localPath) {
						allVideosHaveLocalPath = false;
					}
				}

				// Check for effects on this element
				if (
					(element.effects && element.effects.length > 0) ||
					(element.effectIds && element.effectIds.length > 0)
				) {
					hasEffects = true;
				}
			}
		}
	}

	// Check for overlapping video elements (requires compositing)
	const hasOverlappingVideos = checkForOverlappingRanges(videoTimeRanges);
	const hasMultipleVideoSources = videoElementCount > 1;

	// Check for overlay stickers (separate from timeline stickers)
	// Note: This check happens at runtime via useStickersOverlayStore.getState()
	// For analysis, we rely on timeline sticker elements

	// Separate frame rendering (canvas compositing) from filter encoding (FFmpeg filters)
	const needsFrameRendering =
		hasImageElements || // Images require canvas compositing
		hasOverlappingVideos; // Multiple videos require compositing
	// Note: Effects analysis pending - for now assume all effects need frame rendering

	const needsFilterEncoding =
		hasTextElements || // Text uses FFmpeg drawtext
		hasStickers || // Stickers use FFmpeg overlay
		hasTransitions;
	// Note: Effects can be added here once FFmpeg-compatible effects are identified

	const needsImageProcessing =
		needsFrameRendering || needsFilterEncoding || hasEffects;

	// Can use direct copy/concat if:
	// - Single video source with no processing needed, OR
	// - Multiple video sources without overlaps (sequential concatenation) and no processing
	// - No image elements, text overlays, stickers, or effects
	// - All videos have localPath (filesystem access required for FFmpeg)
	const canUseDirectCopy =
		videoElementCount >= 1 &&
		!hasOverlappingVideos &&
		!hasImageElements &&
		!hasTextElements &&
		!hasStickers &&
		!hasEffects &&
		!hasTransitions &&
		allVideosHaveLocalPath;

	// Validate timeline before proceeding - throws if unsupported
	// This replaces Mode 3 fallback - now we error instead of slow export
	validateTimelineForExport({
		hasImageElements,
		hasOverlappingVideos,
		videoElementCount,
		allVideosHaveLocalPath,
	});

	// Determine optimization strategy
	let optimizationStrategy:
		| "direct-copy"
		| "direct-video-with-filters"
		| "video-normalization"
		| "image-video-composite";

	// Mode decision tree (priority order):
	// 1. Check if images present - requires image-video-composite strategy
	// 2. Can we use direct copy? (Mode 1 - fastest)
	// 3. Single video with filters? (Mode 2 - fast)
	// 4. Multiple videos that need normalization? (Mode 1.5 - medium-fast)
	// Note: Mode 3 (frame rendering) removed - unsupported cases now throw errors

	if (hasImageElements) {
		// Images require FFmpeg overlay filters (similar to stickers)
		optimizationStrategy = "image-video-composite";
		console.log(
			"🖼️ [MODE DETECTION] Image elements detected - using image-video-composite strategy"
		);
	} else if (canUseDirectCopy) {
		console.log(
			`🎯 [MODE DETECTION] Direct copy eligible - ${videoElementCount} video(s), checking requirements...`
		);

		// For multiple videos, we need to check if they have matching properties
		if (videoElementCount > 1) {
			console.log(
				"🔍 [MODE DETECTION] Multiple sequential videos detected - checking properties for Mode 1 vs Mode 1.5..."
			);

			// Get export canvas settings (use export settings or first video as fallback)
			const firstVideo = videoElements[0];
			const firstMediaItem = mediaItemsMap.get(firstVideo.mediaId);

			const canvasSettings = resolveExportCanvasSettings({
				exportSettings: exportCanvas,
				fallbackWidth: firstMediaItem?.width,
				fallbackHeight: firstMediaItem?.height,
				fallbackFps: firstMediaItem?.fps,
			});
			const targetWidth = canvasSettings.width;
			const targetHeight = canvasSettings.height;
			const targetFps = canvasSettings.fps;

			console.log(
				`🔍 [MODE DETECTION] Using target: ${targetWidth}x${targetHeight} @ ${targetFps}fps (source: ${canvasSettings.source})`
			);

			// Check if all videos match the export settings
			const videosMatch = checkVideoPropertiesMatch(
				videoElements,
				mediaItemsMap,
				targetWidth,
				targetHeight,
				targetFps
			);

			if (videosMatch) {
				// Mode 1: All videos match, can use direct copy
				optimizationStrategy = "direct-copy";
				console.log(
					"✅ [MODE DETECTION] All videos match export settings - using Mode 1: Direct copy (15-48x speedup)"
				);
			} else {
				// Mode 1.5: Videos need normalization
				optimizationStrategy = "video-normalization";
				console.log(
					"⚡ [MODE DETECTION] Videos have different properties - using Mode 1.5: Video normalization (5-7x speedup)"
				);
				console.log(
					"🎬 [MODE 1.5] Videos will be normalized to match export canvas before concatenation"
				);
			}
		} else {
			// Single video - always use direct copy (Mode 1)
			optimizationStrategy = "direct-copy";
			console.log(
				"✅ [MODE DETECTION] Single video - using Mode 1: Direct copy (15-48x speedup)"
			);
		}
	} else {
		// Mode 2: Direct video with FFmpeg filters (text/stickers/effects)
		// This is now the fallback for any timeline that passes validation
		// (validation already rejected unsupported cases like images/overlaps)
		optimizationStrategy = "direct-video-with-filters";
		console.log(
			"⚡ [MODE DETECTION] Selected Mode 2: Direct video with filters (3-5x speedup)"
		);

		// Log what filters will be applied
		const filterReasons: string[] = [];
		if (hasTextElements) filterReasons.push("text overlays");
		if (hasStickers) filterReasons.push("stickers");
		if (hasEffects) filterReasons.push("effects");
		if (hasTransitions) filterReasons.push("transitions");
		if (filterReasons.length > 0) {
			console.log(`   Filters: ${filterReasons.join(", ")}`);
		}
	}

	// Generate reason for strategy choice
	let reason = "";
	if (optimizationStrategy === "image-video-composite") {
		reason =
			"Timeline contains image elements - using FFmpeg overlay filters for compositing";
	} else if (optimizationStrategy === "direct-copy") {
		if (videoElementCount === 1) {
			reason =
				"Single video with no overlays, effects, or compositing - using direct copy";
		} else {
			reason =
				"Sequential videos without overlaps - using FFmpeg concat demuxer";
		}
	} else if (optimizationStrategy === "direct-video-with-filters") {
		const filterTypes: string[] = [];
		if (hasTextElements) filterTypes.push("text");
		if (hasStickers) filterTypes.push("stickers");
		if (hasEffects) filterTypes.push("effects");
		if (hasTransitions) filterTypes.push("transitions");
		reason =
			filterTypes.length > 0
				? `Video with ${filterTypes.join("/")} overlays - using FFmpeg filters`
				: "Video processing - using FFmpeg filters";
	} else if (optimizationStrategy === "video-normalization") {
		reason =
			"Multiple videos with different properties - using FFmpeg normalization";
	}

	// Log localPath validation for debugging
	console.log("🔍 [EXPORT ANALYSIS] Video localPath validation:", {
		totalVideos: videoElementCount,
		videosWithLocalPath: videoElements.filter((el) => {
			const media = mediaItemsMap.get(el.mediaId);
			return media?.localPath;
		}).length,
		allHaveLocalPath: allVideosHaveLocalPath,
	});

	if (!allVideosHaveLocalPath && videoElementCount > 0) {
		console.log(
			"⚠️ [EXPORT ANALYSIS] Some videos lack localPath - direct copy disabled"
		);
		const videosWithoutLocalPath = videoElements
			.filter((el) => {
				const media = mediaItemsMap.get(el.mediaId);
				return !media?.localPath;
			})
			.map((el) => {
				const media = mediaItemsMap.get(el.mediaId);
				return {
					elementId: el.id,
					mediaId: media?.id,
					hasUrl: !!media?.url,
					urlType: media?.url?.substring(0, 20),
				};
			});
		console.log(
			"📝 [EXPORT ANALYSIS] Videos without localPath:",
			videosWithoutLocalPath
		);
	}

	// Log detailed analysis results
	console.log("📊 [EXPORT ANALYSIS] Complete analysis result:", {
		videoElementCount,
		hasOverlappingVideos,
		hasImageElements,
		hasTextElements,
		hasStickers,
		hasEffects,
		hasVideoVisualEdits,
		hasTransitions,
		allVideosHaveLocalPath,
		canUseDirectCopy,
		optimizationStrategy,
		reason,
	});

	// Log video elements with trim information
	if (videoElementCount > 0) {
		const videoTrimInfo = videoElements.map((el) => {
			const media = mediaItemsMap.get(el.mediaId);
			return {
				elementId: el.id,
				hasTrim: el.trimStart > 0 || el.trimEnd > 0,
				trimStart: el.trimStart,
				trimEnd: el.trimEnd,
				duration: el.duration,
				effectiveDuration: getMediaTimelineDuration(el),
				hasLocalPath: !!media?.localPath,
				localPath:
					media?.localPath?.substring(media.localPath.lastIndexOf("\\") + 1) ||
					"NONE",
			};
		});
		console.log(
			"🎬 [EXPORT ANALYSIS] Video elements with trim info:",
			videoTrimInfo
		);
	}

	// Log optimization strategy with clear mode indicators
	if (optimizationStrategy === "image-video-composite") {
		console.log(
			"🖼️ [EXPORT ANALYSIS] IMAGE-VIDEO-COMPOSITE: Using FFmpeg overlay filters for image compositing! 🖼️"
		);
	} else if (optimizationStrategy === "direct-copy") {
		console.log(
			"✅ [EXPORT ANALYSIS] MODE 1: Using DIRECT COPY optimization - Fast export! 🚀"
		);
	} else if (optimizationStrategy === "direct-video-with-filters") {
		console.log(
			"⚡ [EXPORT ANALYSIS] MODE 2: Using DIRECT VIDEO WITH FILTERS - Fast export with text/stickers! ⚡"
		);
	} else if (optimizationStrategy === "video-normalization") {
		console.log(
			"⚡ [EXPORT ANALYSIS] MODE 1.5: Using VIDEO NORMALIZATION - Fast export with padding! ⚡"
		);
	}

	return {
		needsImageProcessing,
		needsFrameRendering, // NEW: Separate frame rendering flag
		needsFilterEncoding, // NEW: Separate filter encoding flag
		hasImageElements,
		hasTextElements,
		hasStickers,
		hasEffects,
		hasVideoVisualEdits,
		hasTransitions,
		hasMultipleVideoSources,
		hasOverlappingVideos,
		canUseDirectCopy,
		optimizationStrategy,
		reason,
	};
}

/**
 * Detects overlapping videos to determine if compositing is required.
 *
 * Overlaps prevent direct FFmpeg concat; requires frame-by-frame compositing.
 * Sequential videos (no overlap) can use fast concat demuxer.
 *
 * @param ranges - Video time ranges from timeline elements
 * @returns true if any videos overlap (need compositing), false if sequential
 */
function checkForOverlappingRanges(
	ranges: Array<{ start: number; end: number }>
): boolean {
	if (ranges.length < 2) return false;

	// Sort ranges by start time
	const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);

	// Check for overlaps
	for (let i = 0; i < sortedRanges.length - 1; i++) {
		const current = sortedRanges[i];
		const next = sortedRanges[i + 1];

		// If current range ends after next range starts, they overlap
		if (current.end > next.start) {
			return true;
		}
	}

	return false;
}

/**
 * Validates timeline configuration for export.
 * Throws ExportUnsupportedError if the timeline contains unsupported elements.
 *
 * Unsupported cases (Mode 3 removed):
 * - Image elements (require canvas compositing)
 * - Overlapping videos (require canvas compositing)
 * - Blob URLs without local paths (FFmpeg cannot access)
 * - No video elements (nothing to export)
 *
 * @param params - Validation parameters extracted from timeline analysis
 * @throws ExportUnsupportedError if timeline configuration is unsupported
 */
export function validateTimelineForExport(params: {
	hasImageElements: boolean;
	hasOverlappingVideos: boolean;
	videoElementCount: number;
	allVideosHaveLocalPath: boolean;
}): void {
	const {
		hasImageElements,
		hasOverlappingVideos,
		videoElementCount,
		allVideosHaveLocalPath,
	} = params;

	// Check for no video elements (allow if images present)
	if (videoElementCount === 0 && !hasImageElements) {
		console.error(
			"❌ [EXPORT VALIDATION] No video or image elements found in timeline"
		);
		throw new ExportUnsupportedError("no-video-elements");
	}

	// Image elements are now supported via CLI export engine (FFmpeg overlay)
	// No validation check needed - handled by image-video-composite strategy

	// Check for overlapping videos (unsupported - would require Mode 3)
	if (hasOverlappingVideos) {
		console.error(
			"❌ [EXPORT VALIDATION] Overlapping videos are not supported in export"
		);
		throw new ExportUnsupportedError("overlapping-videos");
	}

	// Check for blob URLs without local paths
	if (!allVideosHaveLocalPath) {
		console.error(
			"❌ [EXPORT VALIDATION] Some videos have blob URLs without local paths"
		);
		throw new ExportUnsupportedError("blob-urls");
	}

	console.log("✅ [EXPORT VALIDATION] Timeline configuration is valid");
}
