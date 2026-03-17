import { ExportSettings, FORMAT_INFO, ExportPurpose } from "@/types/export";
import { TimelineElement, TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import {
	FFmpegVideoRecorder,
	isFFmpegExportEnabled,
} from "@/lib/ffmpeg/ffmpeg-video-recorder";
import { debugLog, debugError, debugWarn } from "@/lib/debug/debug-config";
import { preloadStickerImages } from "@/lib/stickers/sticker-export-helper";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useMediaStore } from "@/stores/media/media-store";
import { useEffectsStore } from "@/stores/ai/effects-store";

// Extracted modules
import {
	calculateTotalFrames as calculateTotalFramesImpl,
	calculateElementBounds as calculateElementBoundsImpl,
} from "./export-engine-utils";
import { logActualVideoDuration } from "./export-engine-debug";
import {
	type RecorderContext,
	getVideoBitrate as getVideoBitrateImpl,
	setupMediaRecorder as setupMediaRecorderImpl,
	startRecording as startRecordingImpl,
	stopRecording as stopRecordingImpl,
} from "./export-engine-recorder";
import {
	type RenderContext,
	renderFrame as renderFrameImpl,
	renderOverlayStickers as renderOverlayStickersImpl,
	destroyExportCompositor,
} from "./export-engine-renderer";

// Re-export for consumers
export type { ActiveElement } from "./export-engine-utils";

// Advanced progress info
interface AdvancedProgressInfo {
	currentFrame: number;
	totalFrames: number;
	encodingSpeed: number;
	processedFrames: number;
	elapsedTime: number;
	averageFrameTime: number;
	estimatedTimeRemaining: number;
}

// Progress callback type
type ProgressCallback = (
	progress: number,
	status: string,
	advancedInfo?: AdvancedProgressInfo
) => void;

// Export engine for rendering timeline to video
export class ExportEngine {
	protected canvas: HTMLCanvasElement;
	protected ctx: CanvasRenderingContext2D;
	protected settings: ExportSettings;
	protected tracks: TimelineTrack[];
	protected mediaItems: MediaItem[];
	protected totalDuration: number;
	protected fps = 30; // Fixed framerate for now

	// MediaRecorder properties
	private mediaRecorder: MediaRecorder | null = null;
	private recordedChunks: Blob[] = [];
	protected isExporting = false;
	protected abortController: AbortController | null = null;

	// FFmpeg recorder for WASM-based export
	private ffmpegRecorder: FFmpegVideoRecorder | null = null;
	private useFFmpegExport = false;

	// Video element cache for performance
	private videoCache = new Map<string, HTMLVideoElement>();

	// Track images used during export
	private usedImages = new Set<string>();

	constructor(
		canvas: HTMLCanvasElement,
		settings: ExportSettings,
		tracks: TimelineTrack[],
		mediaItems: MediaItem[],
		totalDuration: number
	) {
		this.canvas = canvas;
		this.settings = settings;
		this.tracks = tracks;
		this.mediaItems = mediaItems;
		this.totalDuration = totalDuration;

		// Check if we should use FFmpeg WASM export
		this.useFFmpegExport = isFFmpegExportEnabled();
		debugLog(
			`[ExportEngine] Using ${this.useFFmpegExport ? "FFmpeg WASM" : "MediaRecorder"} for export`
		);

		console.log("🎬 STANDARD EXPORT ENGINE: Constructor called");
		console.log(
			`🎬 STANDARD EXPORT ENGINE: Will use ${this.useFFmpegExport ? "FFmpeg WASM" : "MediaRecorder"} for export`
		);

		// Progressive canvas quality based on export purpose
		const isPreview = settings.purpose === ExportPurpose.PREVIEW;
		const canvasOptions: CanvasRenderingContext2DSettings = {
			willReadFrequently: true,
			alpha: !isPreview,
			desynchronized: isPreview,
		};

		const ctx = canvas.getContext("2d", canvasOptions);
		if (!ctx) {
			throw new Error("Failed to get 2D context from canvas");
		}
		this.ctx = ctx;

		// Set render quality based on purpose
		if (isPreview) {
			this.ctx.imageSmoothingEnabled = false;
			this.ctx.imageSmoothingQuality = "low";
			debugLog("[ExportEngine] Canvas quality: preview mode (fast)");
		} else {
			this.ctx.imageSmoothingEnabled = true;
			this.ctx.imageSmoothingQuality = "high";
			debugLog("[ExportEngine] Canvas quality: final mode (high quality)");
		}

		// Set canvas dimensions to match export settings
		this.canvas.width = settings.width;
		this.canvas.height = settings.height;
	}

	// --- Delegated utility methods ---

	calculateTotalFrames(): number {
		return calculateTotalFramesImpl(this.totalDuration, this.fps);
	}

	getTotalDuration(): number {
		return this.totalDuration;
	}

	getFrameRate(): number {
		return this.fps;
	}

	protected calculateElementBounds(
		element: TimelineElement,
		mediaWidth: number,
		mediaHeight: number
	) {
		return calculateElementBoundsImpl(
			element,
			mediaWidth,
			mediaHeight,
			this.canvas.width,
			this.canvas.height
		);
	}

	protected getVideoBitrate(): number {
		return getVideoBitrateImpl(this.settings.quality);
	}

	// --- Delegated render methods ---

	/** Build the render context from current class state */
	private buildRenderContext(): RenderContext {
		return {
			ctx: this.ctx,
			canvas: this.canvas,
			tracks: this.tracks,
			mediaItems: this.mediaItems,
			videoCache: this.videoCache,
			usedImages: this.usedImages,
			fps: this.fps,
		};
	}

	/** Build the recorder context from current class state */
	private buildRecorderContext(): RecorderContext {
		return {
			canvas: this.canvas,
			settings: this.settings,
			mediaRecorder: this.mediaRecorder,
			recordedChunks: this.recordedChunks,
			useFFmpegExport: this.useFFmpegExport,
			ffmpegRecorder: this.ffmpegRecorder,
			fps: this.fps,
		};
	}

	/** Sync recorder context back to class state */
	private syncRecorderContext(context: RecorderContext): void {
		this.mediaRecorder = context.mediaRecorder;
		this.recordedChunks = context.recordedChunks;
		this.ffmpegRecorder = context.ffmpegRecorder;
	}

	async renderFrame(currentTime: number): Promise<void> {
		return renderFrameImpl(this.buildRenderContext(), currentTime);
	}

	protected async renderOverlayStickers(currentTime: number): Promise<void> {
		return renderOverlayStickersImpl(this.buildRenderContext(), currentTime);
	}

	// --- Core methods (kept in class) ---

	// Check if export was cancelled (protected for subclasses)
	protected isExportCancelled(): boolean {
		return this.abortController?.signal.aborted || false;
	}

	// Main export method - renders timeline and captures video
	async export(progressCallback?: ProgressCallback): Promise<Blob> {
		console.log("🎬 STANDARD EXPORT ENGINE: Export method called");
		console.log(
			`🎬 STANDARD EXPORT ENGINE: Will use ${this.useFFmpegExport ? "FFmpeg WASM" : "MediaRecorder"} export path`
		);

		console.log("\n📋 NEXT INVESTIGATION STEPS:");
		console.log("1️⃣ Track which elements have effects applied during export");
		console.log("2️⃣ Compare element IDs between preview and export");
		console.log("3️⃣ Monitor CSS filter to canvas filter conversion");
		console.log("4️⃣ Check if effects persist through entire export duration");
		console.log("5️⃣ Verify canvas context save/restore for effects\n");

		if (this.isExporting) {
			throw new Error("Export already in progress");
		}

		this.isExporting = true;
		this.abortController = new AbortController();

		// Reset tracking for this export
		this.usedImages.clear();

		debugLog(
			`[ExportEngine] 📏 Original timeline duration: ${this.totalDuration.toFixed(3)}s`
		);
		debugLog(
			`[ExportEngine] 🎬 Target frames: ${this.calculateTotalFrames()} frames at ${this.fps}fps`
		);
		debugLog(
			"[ExportEngine] ⚡ Optimizations: 500-2000ms timeout, retry mechanism, frame validation"
		);

		// Preload sticker images before export starts
		try {
			const stickersStore = useStickersOverlayStore.getState();
			const allStickers = stickersStore.getStickersForExport();

			if (allStickers.length > 0) {
				progressCallback?.(0, "Preloading sticker images...");

				const mediaStore = useMediaStore.getState();
				const mediaItemsMap = new Map(
					mediaStore.mediaItems.map((item) => [item.id, item])
				);

				const preloadResult = await preloadStickerImages(
					allStickers,
					mediaItemsMap
				);

				if (preloadResult.failed.length > 0) {
					debugWarn(
						`[ExportEngine] Failed to preload ${preloadResult.failed.length} sticker images:`,
						preloadResult.failed
					);
				}

				debugLog(
					`[ExportEngine] Preloaded ${preloadResult.loaded}/${allStickers.length} sticker images`
				);
			}
		} catch (preloadError) {
			debugWarn("[ExportEngine] Sticker preload failed:", preloadError);
		}

		try {
			// Build recorder context
			const recorderCtx = this.buildRecorderContext();

			// Get canvas stream for manual frame capture (MediaRecorder only)
			let videoTrack: MediaStreamTrack | null = null;

			if (!this.useFFmpegExport) {
				const stream = this.canvas.captureStream(0);
				videoTrack = stream.getVideoTracks()[0];
				setupMediaRecorderImpl(recorderCtx, stream);
				this.syncRecorderContext(recorderCtx);
			}

			await startRecordingImpl(recorderCtx);
			this.syncRecorderContext(recorderCtx);

			const totalFrames = this.calculateTotalFrames();
			const frameTime = 1 / this.fps;
			const startTime = Date.now();

			progressCallback?.(0, "Starting export...");

			// Verify stream sync (MediaRecorder only)
			if (!this.useFFmpegExport && this.mediaRecorder?.stream) {
				const stream = this.canvas.captureStream(0);
				if (stream.id !== this.mediaRecorder.stream.id) {
					debugWarn("[ExportEngine] Stream mismatch detected!");
				}
			}

			// Render each frame with advanced progress tracking
			for (let frame = 0; frame < totalFrames; frame++) {
				const frameStartTime = performance.now();

				if (this.abortController.signal.aborted) {
					throw new Error("Export cancelled by user");
				}

				const currentTime = frame * frameTime;

				debugLog(
					`[FRAME_DEBUG] Frame ${frame + 1}/${totalFrames} at time ${currentTime.toFixed(3)}s`
				);

				// Render frame (polymorphic - subclasses can override)
				await this.renderFrame(currentTime);

				// Smart canvas verification - only check every 10th frame
				if (frame % 10 === 0 || frame === 0) {
					const imageData = this.ctx.getImageData(
						0,
						0,
						this.canvas.width,
						this.canvas.height
					);
					const pixels = imageData.data;
					let nonBlackPixels = 0;

					const sampleRate = 10;
					for (let i = 0; i < pixels.length; i += 4 * sampleRate) {
						if (pixels[i] > 0 || pixels[i + 1] > 0 || pixels[i + 2] > 0) {
							nonBlackPixels++;
						}
					}

					nonBlackPixels *= sampleRate;

					if (nonBlackPixels === 0) {
						debugWarn(`[ExportEngine] BLACK FRAME at ${frame + 1}!`);
					} else if (frame % 30 === 0) {
						debugLog(
							`[ExportEngine] Frame ${frame + 1}: ~${nonBlackPixels} pixels (sampled)`
						);
					}
				}

				// Capture frame based on export method
				if (this.useFFmpegExport && this.ffmpegRecorder) {
					const dataUrl = this.canvas.toDataURL("image/png");
					await this.ffmpegRecorder.addFrame(dataUrl, frame);
				} else {
					if (videoTrack && "requestFrame" in videoTrack) {
						(
							videoTrack as MediaStreamTrack & { requestFrame(): void }
						).requestFrame();
						await new Promise((resolve) => setTimeout(resolve, 50));
					} else {
						debugWarn(`[ExportEngine] Cannot capture frame ${frame + 1}`);
					}
				}

				// Calculate advanced progress metrics
				const now = Date.now();
				const elapsedTime = (now - startTime) / 1000;
				const frameProcessingTime = performance.now() - frameStartTime;
				const averageFrameTime = (elapsedTime * 1000) / (frame + 1);
				const encodingSpeed = (frame + 1) / elapsedTime;

				if (frame % 30 === 0) {
					debugLog(
						`[ExportEngine] Frame ${frame + 1} took ${frameProcessingTime.toFixed(1)}ms`
					);
				}

				const remainingFrames = totalFrames - frame - 1;
				const estimatedTimeRemaining =
					remainingFrames * (averageFrameTime / 1000);

				const progress = (frame / totalFrames) * 95;
				const status = `Rendering frame ${frame + 1} of ${totalFrames} (${encodingSpeed.toFixed(1)} fps)`;

				if (progressCallback) {
					progressCallback(progress, status, {
						currentFrame: frame + 1,
						totalFrames,
						encodingSpeed,
						processedFrames: frame + 1,
						elapsedTime,
						averageFrameTime,
						estimatedTimeRemaining,
					});
				}

				if (frame % 10 === 0) {
					await new Promise((resolve) => setTimeout(resolve, 1));
				}
			}

			progressCallback?.(95, "Finalizing video...");

			// Stop recording and get final blob
			const stopCtx = this.buildRecorderContext();
			const videoBlob = await stopRecordingImpl(stopCtx);
			this.syncRecorderContext(stopCtx);

			debugLog(
				`[ExportEngine] 📦 Exported video size: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`
			);
			debugLog(`[ExportEngine] 🔗 Blob type: ${videoBlob.type}`);

			const expectedDuration = this.totalDuration;
			const actualFramesRendered = this.calculateTotalFrames();
			const calculatedDuration = actualFramesRendered / this.fps;

			debugLog(
				`[ExportEngine] ⏱️  Expected duration: ${expectedDuration.toFixed(3)}s`
			);
			debugLog(
				`[ExportEngine] ⏱️  Calculated duration: ${calculatedDuration.toFixed(3)}s (${actualFramesRendered} frames / ${this.fps}fps)`
			);
			debugLog(
				`[ExportEngine] 📊 Duration ratio: ${(calculatedDuration / expectedDuration).toFixed(3)}x`
			);

			logActualVideoDuration(videoBlob, this.totalDuration);

			progressCallback?.(100, "Export complete!");

			// Export investigation summary
			const totalFramesRendered = this.calculateTotalFrames();
			console.log("\n🎆 EXPORT INVESTIGATION SUMMARY:");
			console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
			console.log(`🎥 Total frames rendered: ${totalFramesRendered}`);
			console.log(`⏱️ Export duration: ${(Date.now() - startTime) / 1000}s`);
			console.log(
				`💽 Video size: ${(videoBlob.size / (1024 * 1024)).toFixed(2)} MB`
			);

			const allElements = new Set<string>();
			const elementsWithEffects = new Set<string>();
			for (const track of this.tracks) {
				for (const element of track.elements) {
					allElements.add(element.id);
					const effects = useEffectsStore
						.getState()
						.getElementEffects(element.id);
					if (effects && effects.length > 0) {
						elementsWithEffects.add(element.id);
					}
				}
			}

			console.log(
				`🎨 Elements with effects: ${elementsWithEffects.size}/${allElements.size}`
			);
			if (elementsWithEffects.size > 0) {
				console.log("✅ Effects were found and should be applied");
				console.log("⚠️ If effects are missing in export, check:");
				console.log("  1. Canvas filter support in export environment");
				console.log("  2. Context save/restore timing");
				console.log("  3. Effect parameter conversion");
			} else {
				console.log("❌ No effects found on any elements");
			}

			console.log(`\n🖼️ Images used in export: ${this.usedImages.size}`);
			if (this.usedImages.size > 0) {
				for (const imageId of this.usedImages) {
					const mediaItem = this.mediaItems.find((item) => item.id === imageId);
					if (mediaItem) {
						console.log(`  📸 ${mediaItem.name || "Unnamed"} (ID: ${imageId})`);
					}
				}
			}
			console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

			return videoBlob;
		} catch (error) {
			debugError("[ExportEngine] Export failed:", error);
			if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
				this.mediaRecorder.stop();
			}
			if (this.ffmpegRecorder) {
				this.ffmpegRecorder.cleanup();
			}
			this.isExporting = false;
			throw error;
		} finally {
			this.isExporting = false;
			destroyExportCompositor();
			if (this.ffmpegRecorder) {
				this.ffmpegRecorder.cleanup();
				this.ffmpegRecorder = null;
			}
		}
	}

	// Cancel export
	cancel(): void {
		if (this.abortController) {
			this.abortController.abort();
		}

		if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
			this.mediaRecorder.stop();
		}

		if (this.ffmpegRecorder) {
			this.ffmpegRecorder.cleanup();
			this.ffmpegRecorder = null;
		}

		this.isExporting = false;
		this.recordedChunks = [];
	}

	// Check if export is in progress
	isExportInProgress(): boolean {
		return this.isExporting;
	}

	// Download video blob
	async downloadVideo(blob: Blob, filename: string): Promise<void> {
		const formatInfo = FORMAT_INFO[this.settings.format];
		const extension = formatInfo.extension;
		const finalFilename = filename.endsWith(extension)
			? filename
			: `${filename}${extension}`;

		if ("showSaveFilePicker" in window) {
			try {
				const mimeType = blob.type || formatInfo.mimeTypes[0];
				const fileHandle = await (
					window as Window &
						typeof globalThis & {
							showSaveFilePicker(options?: {
								suggestedName?: string;
								types?: {
									description: string;
									accept: Record<string, string[]>;
								}[];
							}): Promise<FileSystemFileHandle>;
						}
				).showSaveFilePicker({
					suggestedName: finalFilename,
					types: [
						{
							description: `${formatInfo.label} files`,
							accept: { [mimeType]: [extension] },
						},
					],
				});

				const writable = await fileHandle.createWritable();
				await writable.write(blob);
				await writable.close();
				return;
			} catch (error) {
				// User cancelled or API unavailable - fall back to traditional download
				console.warn(
					"[ExportEngine] showSaveFilePicker failed, using fallback:",
					error
				);
			}
		}

		const url = URL.createObjectURL(blob);

		const iframe = document.createElement("iframe");
		iframe.style.display = "none";
		document.body.appendChild(iframe);

		const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
		if (iframeDoc) {
			const link = iframeDoc.createElement("a");
			link.href = url;
			link.download = finalFilename;
			iframeDoc.body.appendChild(link);
			link.click();
			iframeDoc.body.removeChild(link);
		}

		setTimeout(() => {
			document.body.removeChild(iframe);
			URL.revokeObjectURL(url);
		}, 100);
	}

	// Complete export with download
	async exportAndDownload(
		filename: string,
		progressCallback?: ProgressCallback
	): Promise<void> {
		const videoBlob = await this.export(progressCallback);
		await this.downloadVideo(videoBlob, filename);
	}

	// Pre-load all videos for performance
	protected async preloadAllVideos(): Promise<void> {
		const videoUrls = new Set<string>();

		for (const item of this.mediaItems) {
			if (item.type === "video" && item.url) {
				videoUrls.add(item.url);
			}
		}

		debugLog(`[ExportEngine] Pre-loading ${videoUrls.size} videos...`);

		const loadPromises = Array.from(videoUrls).map((url) =>
			this.preloadVideo(url)
		);
		await Promise.all(loadPromises);

		debugLog(`[ExportEngine] Pre-loaded ${this.videoCache.size} videos`);
	}

	private async preloadVideo(url: string): Promise<void> {
		if (this.videoCache.has(url)) return;

		const video = document.createElement("video");
		video.src = url;
		video.crossOrigin = "anonymous";

		await new Promise<void>((resolve, reject) => {
			video.onloadeddata = () => resolve();
			video.onerror = () => reject(new Error(`Failed to load video: ${url}`));
		});

		this.videoCache.set(url, video);
	}
}
