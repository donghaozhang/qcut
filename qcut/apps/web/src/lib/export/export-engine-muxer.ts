/**
 * Mediabunny-based export engine for iPad/browser environments.
 *
 * Uses the WebCodecs API via mediabunny's CanvasSource for
 * hardware-accelerated H.264 encoding and proper MP4 muxing.
 * This replaces FFmpeg on platforms where native binaries are unavailable.
 */

import { ExportEngine } from "./export-engine";
import type { ExportSettings } from "@/types/export";
import type { TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import { shouldIncludeAudio } from "@/types/export";
import { renderBrowserTimelineAudio } from "@/lib/audio/browser-audio-export";
import { calculateFrameTime } from "./export-engine-utils";
import { exportProfiler } from "./export-profiler";
import { reportExportFrameProgress } from "./export-progress-reporter";
import { assertCanvasClipTransitionsRenderable } from "./export-clip-transitions";
import {
	type CanvasYuvConverter,
	createCanvasYuvConverter,
	EXPORT_VIDEO_COLOR_SPACE,
} from "./export-canvas-yuv";
import { isJianyingTimelineRendererAvailable } from "./export-engine-cli-jianying";
import { applyJianyingTransitionsToRenderedVideo } from "./export-muxer-jianying-pass";

// Progress callback type
type ProgressCallback = (progress: number, status: string) => void;

/** Race a promise against a timeout; clears the timer on success to avoid leaks. */
function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	message: string
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout>;
	return Promise.race([
		promise.then((v) => {
			clearTimeout(timeoutId);
			return v;
		}),
		new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => reject(new Error(message)), ms);
		}),
	]);
}

/** Quality preset → H.264 video bitrate mapping */
const VIDEO_BITRATE: Record<string, number> = {
	"1080p": 8_000_000,
	"720p": 5_000_000,
	"480p": 2_500_000,
};

/** Quality preset → AAC audio bitrate mapping */
const AUDIO_BITRATE: Record<string, number> = {
	"1080p": 128_000,
	"720p": 128_000,
	"480p": 96_000,
};

/**
 * Export engine using mediabunny for proper MP4 muxing via WebCodecs.
 * Works on iPad Safari 16.4+ and modern browsers without FFmpeg.
 */
export class ExportEngineMuxer extends ExportEngine {
	private activeOutput: any = null;

	/** Override main export method with mediabunny pipeline. */
	async export(progressCallback?: ProgressCallback): Promise<Blob> {
		if (this.isExporting) {
			throw new Error("Export already in progress");
		}

		this.isExporting = true;
		this.abortController = new AbortController();
		let yuvConverter: CanvasYuvConverter | null = null;

		try {
			progressCallback?.(0, "Initializing WebCodecs encoder...");

			// Transitions are decided before any frame is encoded: canvas renders
			// the ones it can express exactly, jianying-local seams go through the
			// native pass after muxing, and anything else fails closed here rather
			// than exporting a silent hard cut.
			const clipTransitions = this.getExportRenderIndex().clipTransitions;
			assertCanvasClipTransitionsRenderable({
				plan: clipTransitions,
				engineLabel: "muxer",
			});
			if (
				clipTransitions.jianyingTransitions.length > 0 &&
				!isJianyingTimelineRendererAvailable()
			) {
				throw new Error(
					"本机剪映转场需要 QCut 桌面版的剪映引擎；当前环境无法渲染这些转场，已中止导出以避免静默硬切。"
				);
			}

			// Dynamic import to avoid loading mediabunny on desktop
			const {
				Output,
				Mp4OutputFormat,
				BufferTarget,
				VideoSample,
				VideoSampleSource,
				AudioBufferSource,
			} = await import("mediabunny");

			const fps = this.getFrameRate();
			const totalFrames = this.calculateTotalFrames();
			const quality = this.settings.quality || "720p";
			const videoBitrate = VIDEO_BITRATE[quality] ?? 5_000_000;
			const audioBitrate = AUDIO_BITRATE[quality] ?? 128_000;

			// Create output with MP4 format
			const target = new BufferTarget();
			const output = new Output({
				format: new Mp4OutputFormat({ fastStart: "in-memory" }),
				target,
			});

			// Every frame is converted to BT.709 limited-range I420 on our
			// side before it reaches the encoder. Chromium fixes the stream's
			// color tags when the encoder is configured but chooses the
			// RGB→Y'CbCr matrix per frame from mutable canvas state, so raw
			// canvas frames can mix BT.601- and BT.709-coded frames under one
			// tag; pre-converted I420 keeps the tags truthful for the whole
			// stream. "no-preference" works on real hardware and simulators.
			const videoSource = new VideoSampleSource({
				codec: "avc",
				bitrate: videoBitrate,
				hardwareAcceleration: "no-preference",
			});
			output.addVideoTrack(videoSource, { frameRate: fps });
			yuvConverter = createCanvasYuvConverter({
				width: this.canvas.width,
				height: this.canvas.height,
			});

			// Prepare audio if timeline has audio elements
			const audioData = shouldIncludeAudio(this.settings)
				? await exportProfiler.time("audio-render", () =>
						renderBrowserTimelineAudio({
							tracks: this.tracks,
							mediaItems: this.mediaItems,
							totalDuration: this.totalDuration,
							fps,
						})
					)
				: null;
			let audioSource: InstanceType<typeof AudioBufferSource> | null = null;

			if (audioData) {
				audioSource = new AudioBufferSource({
					codec: "aac",
					bitrate: audioBitrate,
				});
				output.addAudioTrack(audioSource);
			}

			this.activeOutput = output;
			await output.start();

			progressCallback?.(2, "Rendering frames...");

			const frameDuration = 1 / fps;

			// Render and encode each frame. `CanvasSource.add` captures the
			// canvas synchronously and returns a backpressure promise, so the
			// encoder chews on frame N while frame N+1 renders — a bounded
			// one-frame pipeline that respects WebCodecs backpressure.
			let pendingEncode: Promise<void> | null = null;
			for (let frame = 0; frame < totalFrames; frame++) {
				if (this.isExportCancelled()) {
					throw new Error("Export cancelled by user");
				}

				const currentTime = calculateFrameTime({
					frameIndex: frame,
					frameRate: fps,
				});

				exportProfiler.frameStart(frame);

				// Render frame to canvas using existing renderer
				await exportProfiler.time("render-frame", () =>
					this.renderFrame(currentTime)
				);

				// Issue this frame's BT.709 I420 conversion, let the GPU work
				// while the encoder finishes the previous frame, then collect
				// the bytes: the readback overlaps the backpressure wait.
				const converter = yuvConverter;
				if (!converter) throw new Error("YUV converter was disposed");
				exportProfiler.timeSync("yuv-begin", () =>
					converter.begin(this.canvas)
				);
				if (pendingEncode) {
					const settled = pendingEncode;
					pendingEncode = null;
					await exportProfiler.time("encode-wait", () => settled);
				}

				// Capture the canvas as a BT.709 I420 sample (the sample copies
				// the bytes, so the converter's buffer can be reused) and feed
				// it to mediabunny with a timeout (WebCodecs encoders can stall
				// on simulator or unsupported platforms).
				const yuvFrame = exportProfiler.timeSync("yuv-finish", () =>
					converter.finish(this.canvas)
				);
				const sample = new VideoSample(yuvFrame.data, {
					format: "I420",
					codedWidth: yuvFrame.codedWidth,
					codedHeight: yuvFrame.codedHeight,
					timestamp: currentTime,
					duration: frameDuration,
					colorSpace: EXPORT_VIDEO_COLOR_SPACE,
				});
				const encodePromise = withTimeout(
					videoSource.add(sample).then(() => sample.close()),
					10_000,
					`Encoder stalled at frame ${frame + 1}/${totalFrames}`
				);
				// Keep an exception between add() and the next await from
				// surfacing as an unhandled rejection.
				encodePromise.catch(() => {});
				pendingEncode = encodePromise;

				exportProfiler.frameEnd();

				// Progress (reserve 5% for finalization)
				const progress = 2 + (frame / totalFrames) * 90;
				progressCallback?.(
					progress,
					`Encoding frame ${frame + 1}/${totalFrames}`
				);
				reportExportFrameProgress({
					progressPercent: progress,
					currentFrame: frame + 1,
					totalFrames,
				});

				// Yield to UI every 10 frames
				if (frame % 10 === 0) {
					await new Promise((resolve) => setTimeout(resolve, 0));
				}
			}
			if (pendingEncode) {
				const settled = pendingEncode;
				pendingEncode = null;
				await exportProfiler.time("encode-wait", () => settled);
			}

			// Add audio data if present
			if (audioSource && audioData) {
				progressCallback?.(93, "Encoding audio...");
				await audioSource.add(audioData);
			}

			progressCallback?.(96, "Finalizing MP4...");
			await exportProfiler.time("mp4-finalize", () => output.finalize());

			if (!target.buffer) {
				throw new Error("Export finalization failed — no output buffer");
			}
			let blob = new Blob([target.buffer], { type: "video/mp4" });
			if (clipTransitions.jianyingTransitions.length > 0) {
				if (this.isExportCancelled()) {
					throw new Error("Export cancelled by user");
				}
				progressCallback?.(97, "正在用本机剪映引擎渲染转场…");
				blob = await exportProfiler.time("jianying-transition-pass", () =>
					applyJianyingTransitionsToRenderedVideo({
						blob,
						transitions: clipTransitions.jianyingTransitions,
						tracks: this.tracks,
						fps,
						width: this.canvas.width,
						height: this.canvas.height,
						onProgress: progressCallback,
					})
				);
			}
			progressCallback?.(100, "Export complete!");

			await exportProfiler.finishAndSave({
				engine: "muxer",
				totalFrames,
				fps,
				width: this.canvas.width,
				height: this.canvas.height,
				quality,
			});

			return blob;
		} catch (error) {
			if (
				error instanceof Error &&
				error.message === "Export cancelled by user"
			) {
				throw error;
			}
			console.error("[ExportEngineMuxer] Export failed:", error);
			throw error;
		} finally {
			yuvConverter?.dispose();
			yuvConverter = null;
			this.activeOutput = null;
			this.isExporting = false;
			await this.disposeSequentialVideo();
		}
	}

	/** Override cancel to clean up mediabunny encoder resources. */
	cancel(): void {
		super.cancel();
		if (this.activeOutput) {
			try {
				this.activeOutput.cancel?.();
			} catch {
				// Ignore errors during cleanup
			}
			this.activeOutput = null;
		}
	}
}
