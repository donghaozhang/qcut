import { ExportEngine } from "./export-engine";
import type {
	ExportSettingsWithAudio,
	AudioExportOptions,
} from "@/types/export";
import { TimelineTrack, TimelineElement } from "@/types/timeline";
import { MediaItem } from "@/stores/media/media-store";
import { platform } from "@qcut/platform-core";
import { debugLog, debugError, debugWarn } from "@/lib/debug/debug-config";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import {
	analyzeTimelineForExport,
	type ExportAnalysis,
} from "./export-analysis";

// Import extracted modules
import type {
	StickerSourceForFilter,
	ImageSourceInput,
	ProgressCallback,
	VideoSourceInput,
	AudioFileInput,
} from "../export-cli/types";
import {
	buildTextOverlayFilters,
	buildStickerOverlayFilters,
	buildImageOverlayFilters,
} from "../export-cli/filters";
import {
	extractVideoSources,
	extractVideoInputPath,
	extractStickerSources,
	extractImageSources,
} from "../export-cli/sources";
import {
	prepareAudioFilesForExport,
	resolveAudioPreparationInputs,
} from "./export-engine-cli-audio";
import {
	fileExists as fileExistsUtil,
	invokeIfAvailable as invokeIfAvailableUtil,
} from "./export-engine-cli-utils";

// Import split modules
import { validateAudioFiles } from "./export-engine-cli-validation";
import {
	resolveWordFilters,
	buildExportOptions,
} from "./export-engine-cli-mode";
import {
	logExportConfiguration,
	invokeFFmpegExport,
} from "./export-engine-cli-ffmpeg";
import {
	logActualVideoDurationCLI,
	logMode2Detection,
} from "./export-engine-cli-debug";

// Re-export types for backward compatibility (using export from)
export type {
	ProgressCallback,
	VideoSourceInput,
	AudioFileInput,
} from "../export-cli/types";

type EffectsStore = ReturnType<typeof useEffectsStore.getState>;

/** FFmpeg CLI-based export engine that renders timeline projects to video files via Electron IPC. */
export class CLIExportEngine extends ExportEngine {
	private sessionId: string | null = null;
	private frameDir: string | null = null;
	private effectsStore?: EffectsStore;
	private exportAnalysis: ExportAnalysis | null = null;
	private audioOptions: AudioExportOptions;

	constructor(
		canvas: HTMLCanvasElement,
		settings: ExportSettingsWithAudio,
		tracks: TimelineTrack[],
		mediaItems: MediaItem[],
		totalDuration: number,
		effectsStore?: EffectsStore
	) {
		super(canvas, settings, tracks, mediaItems, totalDuration);
		this.effectsStore = effectsStore;
		this.audioOptions = {
			includeAudio: settings.includeAudio,
			audioCodec: settings.audioCodec,
			audioBitrate: settings.audioBitrate,
			audioSampleRate: settings.audioSampleRate,
			audioChannels: settings.audioChannels,
		};

		if (typeof platform().ffmpeg.exportVideoCLI !== "function") {
			throw new Error("CLI Export Engine requires Electron environment");
		}
	}

	private countVisibleVideoElements(): number {
		let count = 0;
		for (const track of this.tracks) {
			if (track.type !== "media") continue;
			for (const element of track.elements) {
				if (element.hidden || element.type !== "media") continue;
				const mediaElement = element as TimelineElement & { mediaId: string };
				const mediaItem = this.mediaItems.find(
					(item) => item.id === mediaElement.mediaId
				);
				if (mediaItem?.type === "video") count++;
			}
		}
		return count;
	}

	/**
	 * Main export entry point - analyzes timeline and selects optimal export mode.
	 *
	 * Three export modes (automatic selection):
	 * - Mode 1 - Direct Copy (15-48x faster): Single/sequential videos, no overlays
	 * - Mode 1.5 - Video Normalization: Re-encode for format consistency
	 * - Mode 2 - Direct Video + Filters (3-5x faster): Single video with text/stickers
	 */
	async export(progressCallback?: ProgressCallback): Promise<Blob> {
		debugLog("[CLIExportEngine] Starting CLI export...");
		debugLog(
			`[CLIExportEngine] 📏 Original timeline duration: ${this.totalDuration.toFixed(3)}s`
		);
		debugLog(
			`[CLIExportEngine] 🎬 Target frames: ${this.calculateTotalFrames()} frames at 30fps`
		);

		progressCallback?.(5, "Setting up export session...");
		const session = await this.createExportSession();
		this.sessionId = session.sessionId;
		this.frameDir = session.framesDir;

		debugLog(
			"[CLIExportEngine] 🔍 Analyzing timeline for export optimization..."
		);
		const overlayStickersCount = useStickersOverlayStore
			.getState()
			.getStickersForExport().length;
		this.exportAnalysis = analyzeTimelineForExport(
			this.tracks,
			this.mediaItems,
			undefined,
			overlayStickersCount
		);
		debugLog("[CLIExportEngine] 📊 Export Analysis:", this.exportAnalysis);

		try {
			progressCallback?.(10, "Pre-loading videos...");
			await this.preloadAllVideos();

			const visibleVideoCount = this.countVisibleVideoElements();
			const isImageCompositeStrategy =
				this.exportAnalysis?.optimizationStrategy === "image-video-composite";
			const canUseMode2 =
				this.exportAnalysis?.optimizationStrategy ===
					"direct-video-with-filters" ||
				(isImageCompositeStrategy && visibleVideoCount === 1);
			const videoInput: {
				path: string;
				trimStart: number;
				trimEnd: number;
			} | null = canUseMode2
				? await extractVideoInputPath(
						this.tracks,
						this.mediaItems,
						this.sessionId,
						undefined,
						debugLog
					)
				: null;

			if (videoInput) {
				debugLog(
					"[CLIExportEngine] ⚡ MODE 2: Using direct video input with filters"
				);
				debugLog(`[CLIExportEngine] Video path: ${videoInput.path}`);
				debugLog(
					`[CLIExportEngine] Trim: ${videoInput.trimStart}s - ${videoInput.trimEnd}s`
				);
				progressCallback?.(15, "Preparing video with filters...");
			} else if (this.exportAnalysis?.canUseDirectCopy) {
				debugLog("[CLIExportEngine] ⚡ MODE 1: Using direct video copy");
				progressCallback?.(15, "Preparing direct video copy...");
			} else if (
				this.exportAnalysis?.optimizationStrategy === "video-normalization"
			) {
				debugLog("[CLIExportEngine] ⚡ MODE 1.5: Using video normalization");
				progressCallback?.(15, "Preparing video normalization...");
			}

			progressCallback?.(85, "Encoding with FFmpeg CLI...");
			const outputFile = await this.exportWithCLI(progressCallback);

			progressCallback?.(95, "Reading output...");
			const videoBlob = await this.readOutputFile(outputFile);

			debugLog(
				`[CLIExportEngine] 📦 Exported video size: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`
			);
			debugLog(`[CLIExportEngine] 🔗 Blob type: ${videoBlob.type}`);

			const expectedDuration = this.totalDuration;
			const actualFramesRendered = this.calculateTotalFrames();
			const calculatedDuration = actualFramesRendered / 30;

			debugLog(
				`[CLIExportEngine] ⏱️  Expected duration: ${expectedDuration.toFixed(3)}s`
			);
			debugLog(
				`[CLIExportEngine] ⏱️  Calculated duration: ${calculatedDuration.toFixed(3)}s (${actualFramesRendered} frames / 30fps)`
			);
			debugLog(
				`[CLIExportEngine] 📊 Duration ratio: ${(calculatedDuration / expectedDuration).toFixed(3)}x`
			);

			logActualVideoDurationCLI(videoBlob, this.totalDuration);

			progressCallback?.(100, "Export completed!");
			return videoBlob;
		} finally {
			const DEBUG_MODE = true;
			if (DEBUG_MODE) {
				debugLog(
					"[CLIExportEngine] 🔍 DEBUG MODE ENABLED: Keeping frames in temp directory for inspection"
				);
				debugLog(
					`[CLIExportEngine] 📁 Frames location: ${this.frameDir}\\frames`
				);
				debugLog(
					"[CLIExportEngine] 🧪 TEST: Try this FFmpeg command manually:"
				);
				(async () => {
					try {
						const ffmpegPath = await platform().ffmpeg.getPath();
						const framesDir = `${this.frameDir}\\frames`;
						const duration = Math.ceil(this.totalDuration);
						debugLog(
							`"${ffmpegPath}" -y -framerate ${this.fps}` +
								` -i "${framesDir}\\frame-%04d.png" -c:v libx264` +
								` -preset fast -crf 23 -t ${duration} "output.mp4"`
						);
					} catch {
						// FFmpeg path not available on this platform
					}
				})();
				debugLog(
					"[CLIExportEngine] ⚠️ NOTE: Frames will NOT be deleted. Set DEBUG_MODE=false to enable cleanup."
				);
			} else {
				debugLog("[CLIExportEngine] 🧹 Cleaning up temporary files...");
				if (this.sessionId) {
					await this.cleanup();
				}
			}
		}
	}

	private async createExportSession() {
		return platform().ffmpeg.createExportSession();
	}

	private async exportWithCLI(
		progressCallback?: ProgressCallback
	): Promise<string> {
		// Prepare audio files
		progressCallback?.(5, "Preparing audio files...");
		const includeAudio = this.audioOptions.includeAudio ?? true;
		debugLog("[CLI Export] includeAudio option:", {
			includeAudio,
			requestedIncludeAudio: this.audioOptions.includeAudio,
		});

		let audioFiles: AudioFileInput[] = [];
		if (includeAudio) {
			const { tracks, mediaItems } = await resolveAudioPreparationInputs({
				mediaItems: this.mediaItems,
				tracks: this.tracks,
			});
			audioFiles = await prepareAudioFilesForExport({
				fileExists: ({ filePath }) => fileExistsUtil({ filePath }),
				invokeIfAvailable: ({ args = [], channel }) =>
					invokeIfAvailableUtil({ args, channel }),
				mediaItems,
				sessionId: this.sessionId,
				tracks,
			});
		} else {
			debugLog(
				"[CLI Export] Audio excluded by user setting (includeAudio=false)"
			);
		}

		debugLog(`[CLI] Prepared ${audioFiles.length} audio files for export`);
		progressCallback?.(10, "Starting video compilation...");

		// Log and validate audio files
		debugLog(`[CLI Export] Initial audio files count: ${audioFiles.length}`);
		for (const [index, audioFile] of audioFiles.entries()) {
			debugLog(`[CLI Export] Audio file ${index}:`, {
				path: audioFile.path,
				startTime: audioFile.startTime,
				volume: audioFile.volume,
				isBlob: audioFile.path?.startsWith("blob:"),
				isData: audioFile.path?.startsWith("data:"),
				pathType: typeof audioFile.path,
				pathLength: audioFile.path?.length,
			});
			debugLog(`[CLI Export] Audio file ${index} raw path:`, audioFile.path);
		}

		audioFiles = await validateAudioFiles(audioFiles);

		// Collect effects filter chains
		const elementFilterChains = new Map<string, string>();
		for (const track of this.tracks) {
			for (const element of track.elements) {
				if (this.effectsStore) {
					const filterChain = this.effectsStore.getFFmpegFilterChain(
						element.id
					);
					if (filterChain) {
						elementFilterChains.set(element.id, filterChain);
					}
				}
			}
		}
		const combinedFilterChain = Array.from(elementFilterChains.values()).join(
			","
		);

		// Build text overlay filter chain
		console.log(
			"🔍 [TEXT EXPORT DEBUG] Starting text filter chain generation..."
		);
		const textFilterChain = buildTextOverlayFilters(this.tracks);
		if (textFilterChain) {
			console.log(
				"✅ [TEXT EXPORT DEBUG] Text filter chain generated successfully"
			);
			console.log(
				`📊 [TEXT EXPORT DEBUG] Text filter chain: ${textFilterChain}`
			);
			console.log(
				`📈 [TEXT EXPORT DEBUG] Text element count: ${(textFilterChain.match(/drawtext=/g) || []).length}`
			);
			console.log(
				"🎯 [TEXT EXPORT DEBUG] Text will be rendered by FFmpeg CLI (not canvas)"
			);
			debugLog(`[CLI Export] Text filter chain generated: ${textFilterChain}`);
			debugLog(
				`[CLI Export] Text filter count: ${(textFilterChain.match(/drawtext=/g) || []).length}`
			);
		} else {
			console.log("ℹ️ [TEXT EXPORT DEBUG] No text elements found in timeline");
		}

		// Extract sticker overlays
		let stickerFilterChain: string | undefined;
		let stickerSources: StickerSourceForFilter[] = [];
		try {
			console.log("🎨 [STICKER EXPORT] Checking for sticker overlays...");
			stickerSources = await extractStickerSources(
				this.mediaItems,
				this.sessionId,
				this.canvas.width,
				this.canvas.height,
				this.totalDuration,
				undefined,
				undefined,
				debugLog
			);
			if (stickerSources.length > 0) {
				console.log(
					`🎨 [STICKER EXPORT] Found ${stickerSources.length} sticker(s) to overlay`
				);
				for (const [i, s] of stickerSources.entries()) {
					console.log(
						`🎨 [STICKER EXPORT]   [${i + 1}/${stickerSources.length}] id=${s.id} ${s.width}x${s.height} at (${s.x},${s.y}) t=${s.startTime}-${s.endTime}s`
					);
				}
				console.log(
					"🎨 [STICKER EXPORT] Building FFmpeg overlay filter chain..."
				);
				stickerFilterChain = buildStickerOverlayFilters(
					stickerSources,
					this.totalDuration,
					debugLog
				);
				console.log("🎨 [STICKER EXPORT] Sticker filter chain ready");
				debugLog(`[CLI Export] Sticker filter chain: ${stickerFilterChain}`);
			} else {
				console.log("🎨 [STICKER EXPORT] No stickers found, skipping overlay");
			}
		} catch (error) {
			console.warn(
				"⚠️ [STICKER EXPORT] Failed to process stickers, continuing without:",
				error
			);
			debugWarn(
				"[CLI Export] Failed to process stickers, continuing without:",
				error
			);
			stickerSources = [];
			stickerFilterChain = undefined;
		}

		// Extract image sources
		let imageFilterChain: string | undefined;
		let imageSources: ImageSourceInput[] = [];
		if (this.exportAnalysis?.hasImageElements) {
			try {
				imageSources = await extractImageSources(
					this.tracks,
					this.mediaItems,
					this.sessionId,
					undefined,
					debugLog
				);
				if (imageSources.length > 0) {
					imageFilterChain = buildImageOverlayFilters(
						imageSources,
						this.canvas.width,
						this.canvas.height,
						1,
						debugLog
					);
					debugLog(`[CLI Export] Image sources: ${imageSources.length}`);
					debugLog(`[CLI Export] Image filter chain: ${imageFilterChain}`);
				} else {
					throw new Error(
						"Timeline contains image elements but no image sources were resolved."
					);
				}
			} catch (error) {
				debugError("[CLI Export] Failed to process image sources:", error);
				throw new Error(
					`Failed to process image sources for export: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		// Mode decision
		const hasTextFilters = textFilterChain.length > 0;
		const hasStickerFilters = (stickerFilterChain?.length ?? 0) > 0;

		const visibleVideoCount = this.countVisibleVideoElements();
		const canUseMode2 =
			this.exportAnalysis?.optimizationStrategy ===
				"direct-video-with-filters" ||
			(this.exportAnalysis?.optimizationStrategy === "image-video-composite" &&
				visibleVideoCount === 1);

		const { hasWordFilters } = resolveWordFilters(this.totalDuration, null);
		const needsVideoInput = canUseMode2 || hasWordFilters;
		const videoInput: {
			path: string;
			trimStart: number;
			trimEnd: number;
		} | null = needsVideoInput
			? await extractVideoInputPath(
					this.tracks,
					this.mediaItems,
					this.sessionId,
					undefined,
					debugLog
				)
			: null;

		logMode2Detection(
			canUseMode2,
			videoInput,
			needsVideoInput,
			hasTextFilters,
			hasStickerFilters
		);

		const { wordFilterSegments } = resolveWordFilters(
			this.totalDuration,
			videoInput
		);

		const shouldExtractVideoSources =
			this.exportAnalysis?.optimizationStrategy === "video-normalization" ||
			(this.exportAnalysis?.canUseDirectCopy &&
				!hasTextFilters &&
				!hasStickerFilters) ||
			(this.exportAnalysis?.optimizationStrategy === "image-video-composite" &&
				visibleVideoCount > 0 &&
				!videoInput);

		const videoSources: VideoSourceInput[] = shouldExtractVideoSources
			? await extractVideoSources(
					this.tracks,
					this.mediaItems,
					this.sessionId,
					undefined,
					debugLog
				)
			: [];

		if (
			this.exportAnalysis?.optimizationStrategy === "image-video-composite" &&
			visibleVideoCount > 0 &&
			!videoInput &&
			videoSources.length === 0
		) {
			throw new Error(
				"Image/video composite export requires a base video input, but none could be resolved."
			);
		}

		if (!this.sessionId) {
			throw new Error("No active session ID");
		}

		const exportOptions = buildExportOptions({
			sessionId: this.sessionId,
			canvasWidth: this.canvas.width,
			canvasHeight: this.canvas.height,
			quality: this.settings.quality || "medium",
			totalDuration: this.totalDuration,
			audioFiles,
			combinedFilterChain,
			textFilterChain,
			stickerFilterChain,
			stickerSources,
			imageFilterChain,
			imageSources,
			exportAnalysis: this.exportAnalysis,
			hasTextFilters,
			hasStickerFilters,
			wordFilterSegments,
			videoSources,
			videoInput,
		});

		logExportConfiguration(exportOptions, {
			hasTextFilters,
			hasStickerFilters,
			hasImageFilters: imageSources.length > 0,
			stickerCount: stickerSources.length,
			imageCount: imageSources.length,
			textFilterChainLength: textFilterChain.length,
		});

		return invokeFFmpegExport(exportOptions);
	}

	private async readOutputFile(outputPath: string): Promise<Blob> {
		const buffer = await platform().ffmpeg.readOutputFile(outputPath);
		if (!buffer) {
			throw new Error(`Failed to read exported file: ${outputPath}`);
		}
		return new Blob([buffer], { type: "video/mp4" });
	}

	calculateTotalFrames(): number {
		return Math.ceil(this.totalDuration * 30);
	}

	private async cleanup(): Promise<void> {
		if (!this.sessionId) return;

		try {
			await platform().ffmpeg.cleanupExportSession(this.sessionId);
			debugLog(
				`[CLIExportEngine] 🧹 Cleaned up export session: ${this.sessionId}`
			);
		} catch (error) {
			debugWarn(
				`[CLIExportEngine] ⚠️  Failed to cleanup session ${this.sessionId}:`,
				error
			);
		}
	}
}
