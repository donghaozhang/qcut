import { ExportEngine } from "./export-engine";
import type {
	ExportSettingsWithAudio,
	AudioExportOptions,
} from "@/types/export";
import type { TimelineTrack, TimelineElement } from "@/types/timeline";
import { MediaItem } from "@/stores/media/media-store";
import { platform } from "@qcut/platform-core";
import {
	combineEffectRenderPrograms,
	type EffectInstance,
	type EffectRenderProgram,
} from "@qcut/editor-core";
import { debugLog, debugError, debugWarn } from "@/lib/debug/debug-config";
import { useEffectsStore } from "@/stores/ai/effects-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useProjectStore } from "@/stores/project-store";
import {
	analyzeTimelineForExport,
	type ExportAnalysis,
} from "./export-analysis";

// Import extracted modules
import type {
	AudioCrossfadeInput,
	StickerSourceForFilter,
	ImageSourceInput,
	ProgressCallback,
	VideoSourceInput,
	VideoTransitionInput,
	AudioFileInput,
	AudioMixConfigInput,
} from "../export-cli/types";
import {
	buildTextOverlayFilters,
	buildStickerOverlayFilters,
	buildImageOverlayFilters,
} from "../export-cli/filters";
import {
	extractAudioCrossfadeInputs,
	extractVideoSources,
	extractVideoTransitions,
	extractVideoInputPath,
	extractStickerSources,
	extractImageSources,
	extractAudioMixConfig,
	extractEffectOverlaySources,
	extractEffectPersonSources,
	extractEffectCompanionAudioSources,
	extractEffectAudioReactiveEnvelopes,
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
import { buildTimelineAssLayers } from "./export-engine-cli-text";

// Re-export types for backward compatibility (using export from)
export type {
	AudioCrossfadeInput,
	ProgressCallback,
	VideoSourceInput,
	VideoTransitionInput,
	AudioFileInput,
	AudioMixConfigInput,
} from "../export-cli/types";

type EffectsStore = ReturnType<typeof useEffectsStore.getState>;

function collectExportEffects({
	tracks,
	effectsStore,
}: {
	tracks: readonly TimelineTrack[];
	effectsStore?: EffectsStore;
}): ReadonlyMap<string, readonly EffectInstance[]> {
	const effectsByElementId = new Map<string, readonly EffectInstance[]>();
	for (const track of tracks) {
		for (const element of track.elements) {
			const effects = effectsStore
				? effectsStore.getElementEffects(element.id)
				: (element.effects ?? []);
			if (effects.length > 0) effectsByElementId.set(element.id, effects);
		}
	}
	return effectsByElementId;
}

/** FFmpeg CLI-based export engine that renders timeline projects to video files via Electron IPC. */
export class CLIExportEngine extends ExportEngine {
	private sessionId: string | null = null;
	private frameDir: string | null = null;
	private effectsStore?: EffectsStore;
	private exportAnalysis: ExportAnalysis | null = null;
	private audioOptions: AudioExportOptions;
	private gifConfig: ExportSettingsWithAudio["gifConfig"];

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
		this.gifConfig = settings.gifConfig;

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
			`[CLIExportEngine] 🎬 Target frames: ${this.calculateTotalFrames()} frames at ${this.fps}fps`
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
			let outputFile = await this.exportWithCLI(progressCallback);

			if (this.settings.format === "gif") {
				if (!this.sessionId) throw new Error("No active GIF export session");
				progressCallback?.(92, "Converting video to GIF...");
				const gifConfig = this.gifConfig;
				const converted = await platform().ffmpeg.convertVideoToGif({
					sessionId: this.sessionId,
					inputPath: outputFile,
					width: this.canvas.width,
					height: this.canvas.height,
					fps: gifConfig?.frameRate ?? 20,
					loop: gifConfig?.loop ?? true,
					quality: gifConfig?.quality ?? 10,
				});
				outputFile = converted.outputPath;
			}

			progressCallback?.(95, "Reading output...");
			const videoBlob = await this.readOutputFile(outputFile);

			debugLog(
				`[CLIExportEngine] 📦 Exported video size: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`
			);
			debugLog(`[CLIExportEngine] 🔗 Blob type: ${videoBlob.type}`);

			const expectedDuration = this.totalDuration;
			const actualFramesRendered = this.calculateTotalFrames();
			const calculatedDuration = actualFramesRendered / this.fps;

			debugLog(
				`[CLIExportEngine] ⏱️  Expected duration: ${expectedDuration.toFixed(3)}s`
			);
			debugLog(
				`[CLIExportEngine] ⏱️  Calculated duration: ${calculatedDuration.toFixed(3)}s (${actualFramesRendered} frames / ${this.fps}fps)`
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
		const effectsByElementId = collectExportEffects({
			tracks: this.tracks,
			effectsStore: this.effectsStore,
		});
		const hasAudioReactiveEffects = [...effectsByElementId.values()].some(
			(effects) =>
				effects.some((effect) =>
					effect.renderProgram?.stages.some(
						(stage) => stage.kind === "audio-reactive"
					)
				)
		);
		// Prepare audio files
		progressCallback?.(5, "Preparing audio files...");
		const includeAudio = this.audioOptions.includeAudio ?? true;
		debugLog("[CLI Export] includeAudio option:", {
			includeAudio,
			requestedIncludeAudio: this.audioOptions.includeAudio,
		});

		let audioFiles: AudioFileInput[] = [];
		let audioReactiveAnalysisFiles: AudioFileInput[] = [];
		if (includeAudio || hasAudioReactiveEffects) {
			const { tracks, mediaItems } = await resolveAudioPreparationInputs({
				mediaItems: this.mediaItems,
				tracks: this.tracks,
			});
			const preparedAudioFiles = await prepareAudioFilesForExport({
				fileExists: ({ filePath }) => fileExistsUtil({ filePath }),
				invokeIfAvailable: ({ args = [], channel }) =>
					invokeIfAvailableUtil({ args, channel }),
				mediaItems,
				sessionId: this.sessionId,
				tracks,
				fps: this.getFrameRate(),
				includeEmbeddedVideoAudio:
					this.exportAnalysis?.optimizationStrategy !== "direct-copy",
			});
			audioReactiveAnalysisFiles = preparedAudioFiles;
			if (includeAudio) {
				audioFiles = preparedAudioFiles;
				audioFiles.push(
					...(await extractEffectCompanionAudioSources({
						tracks: this.tracks,
						effectsByElementId,
					}))
				);
			}
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
		audioReactiveAnalysisFiles = includeAudio
			? audioFiles
			: await validateAudioFiles(audioReactiveAnalysisFiles);

		// Collect effects filter chains
		const elementFilterChains = new Map<string, string>();
		const elementRenderPrograms = new Map<string, EffectRenderProgram>();
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
				const renderProgram = combineEffectRenderPrograms({
					programs: (effectsByElementId.get(element.id) ?? [])
						.filter((effect) => effect.enabled && effect.renderProgram)
						.flatMap((effect) =>
							effect.renderProgram ? [effect.renderProgram] : []
						),
				});
				if (renderProgram) {
					elementRenderPrograms.set(element.id, renderProgram);
				}
			}
		}
		const hasPerClipVideoEffects =
			elementFilterChains.size > 0 || elementRenderPrograms.size > 0;
		const combinedFilterChain = hasPerClipVideoEffects
			? ""
			: Array.from(elementFilterChains.values()).join(",");
		const hasEffectOverlayStages = Array.from(
			elementRenderPrograms.values()
		).some((program) =>
			program.stages.some((stage) => stage.kind === "overlay")
		);
		const hasEffectPersonStages = Array.from(
			elementRenderPrograms.values()
		).some((program) =>
			program.stages.some((stage) => stage.kind === "person-tracking")
		);
		if (hasEffectOverlayStages && !this.sessionId) {
			throw new Error("Effect overlay export requires an active session");
		}
		if (hasEffectPersonStages && !this.sessionId) {
			throw new Error("Person effect export requires an active session");
		}
		const effectOverlaySourcesByElementId = this.sessionId
			? await extractEffectOverlaySources({
					programsByElementId: elementRenderPrograms,
					sessionId: this.sessionId,
					canvasWidth: this.canvas.width,
					canvasHeight: this.canvas.height,
					logger: debugLog,
				})
			: new Map();
		const effectPersonSourcesByElementId = this.sessionId
			? await extractEffectPersonSources({
					programsByElementId: elementRenderPrograms,
					tracks: this.tracks,
					mediaItems: this.mediaItems,
					sessionId: this.sessionId,
				})
			: new Map();
		const effectAudioReactiveEnvelopesByElementId =
			await extractEffectAudioReactiveEnvelopes({
				programsByElementId: elementRenderPrograms,
				tracks: this.tracks,
				audioFiles: audioReactiveAnalysisFiles,
				fps: this.getFrameRate(),
			});

		// Build text overlay filter chain
		console.log(
			"🔍 [TEXT EXPORT DEBUG] Starting text filter chain generation..."
		);
		const {
			layers: textAssLayers,
			renderedTextElementIds: assRenderedElementIds,
		} = buildTimelineAssLayers({
			tracks: this.tracks,
			canvasWidth: this.canvas.width,
			canvasHeight: this.canvas.height,
			fps: this.getFrameRate(),
			platform: window.electronAPI?.platform as
				| "darwin"
				| "win32"
				| "linux"
				| undefined,
		});
		const textFilterChain = buildTextOverlayFilters(
			this.tracks,
			(window.electronAPI?.platform ?? "darwin") as
				| "win32"
				| "darwin"
				| "linux",
			this.getFrameRate(),
			assRenderedElementIds
		);
		if (textFilterChain || textAssLayers.length > 0) {
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
			const _overlayCount = (
				await import("@/stores/stickers-overlay-store")
			).useStickersOverlayStore
				.getState()
				.getStickersForExport().length;
			console.log(
				`🎨 [STICKER EXPORT] Checking for sticker overlays... overlay store has ${_overlayCount} sticker(s)`
			);
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
					debugLog,
					this.fps
				);
				imageSources = imageSources.map((source) => ({
					...source,
					effectFilter: elementFilterChains.get(source.elementId),
					effectRenderProgram: elementRenderPrograms.get(source.elementId),
					effectOverlaySources: effectOverlaySourcesByElementId.get(
						source.elementId
					),
					effectPersonSources: effectPersonSourcesByElementId.get(
						source.elementId
					),
					effectAudioReactiveEnvelopes:
						effectAudioReactiveEnvelopesByElementId.get(source.elementId),
				}));
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
		const hasTextFilters =
			textFilterChain.length > 0 || textAssLayers.length > 0;
		const hasStickerFilters = (stickerFilterChain?.length ?? 0) > 0;

		const visibleVideoCount = this.countVisibleVideoElements();
		const canUseMode2 =
			this.exportAnalysis?.optimizationStrategy ===
				"direct-video-with-filters" ||
			(this.exportAnalysis?.optimizationStrategy === "image-video-composite" &&
				visibleVideoCount === 1);

		const { hasWordFilters } = resolveWordFilters(this.totalDuration, null);
		const hasVideoVisualEdits =
			this.exportAnalysis?.hasVideoVisualEdits ?? false;
		const hasTransitions = this.exportAnalysis?.hasTransitions ?? false;
		const hasLayeredVisualOverlays =
			imageSources.length > 0 ||
			stickerSources.length > 0 ||
			textAssLayers.length > 0 ||
			textFilterChain.length > 0;
		const needsVideoInput =
			(!hasLayeredVisualOverlays &&
				canUseMode2 &&
				!hasVideoVisualEdits &&
				!hasPerClipVideoEffects &&
				!hasTransitions) ||
			hasWordFilters;
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
			hasVideoVisualEdits ||
			hasPerClipVideoEffects ||
			hasTransitions ||
			(hasLayeredVisualOverlays && visibleVideoCount > 0) ||
			this.exportAnalysis?.optimizationStrategy === "video-normalization" ||
			(this.exportAnalysis?.canUseDirectCopy &&
				!hasTextFilters &&
				!hasStickerFilters) ||
			(this.exportAnalysis?.optimizationStrategy === "image-video-composite" &&
				visibleVideoCount > 0 &&
				!videoInput);

		const extractedVideoSources: VideoSourceInput[] = shouldExtractVideoSources
			? await extractVideoSources(
					this.tracks,
					this.mediaItems,
					this.sessionId,
					undefined,
					debugLog,
					this.fps
				)
			: [];
		const videoSources = extractedVideoSources.map((source) => ({
			...source,
			effectFilter: elementFilterChains.get(source.elementId),
			effectRenderProgram: elementRenderPrograms.get(source.elementId),
			effectOverlaySources: effectOverlaySourcesByElementId.get(
				source.elementId
			),
			effectPersonSources: effectPersonSourcesByElementId.get(source.elementId),
			effectAudioReactiveEnvelopes: effectAudioReactiveEnvelopesByElementId.get(
				source.elementId
			),
		}));
		const videoTransitions: VideoTransitionInput[] = hasTransitions
			? extractVideoTransitions({
					tracks: this.tracks,
					mediaItems: this.mediaItems,
					fps: this.fps,
				})
			: [];
		const audioCrossfades: AudioCrossfadeInput[] = extractAudioCrossfadeInputs({
			tracks: this.tracks,
		});
		const audioMixConfig: AudioMixConfigInput = extractAudioMixConfig({
			tracks: this.tracks,
			audioMix: useProjectStore.getState().activeProject?.audioMix,
		});

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
			fps: this.fps,
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
			exportAnalysis: this.exportAnalysis,
			hasTextFilters,
			hasStickerFilters,
			wordFilterSegments,
			videoSources,
			videoTransitions,
			videoInput,
			backgroundColor:
				useProjectStore.getState().activeProject?.backgroundColor ?? "#000000",
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
		return new Blob([buffer], {
			type: this.settings.format === "gif" ? "image/gif" : "video/mp4",
		});
	}

	calculateTotalFrames(): number {
		return Math.ceil(this.totalDuration * this.fps);
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
