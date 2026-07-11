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

		try {
			progressCallback?.(0, "Initializing WebCodecs encoder...");

			// Dynamic import to avoid loading mediabunny on desktop
			const {
				Output,
				Mp4OutputFormat,
				BufferTarget,
				CanvasSource,
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

			// Create video source from canvas
			// Use "no-preference" so it works on both real hardware (GPU) and simulator (software)
			const videoSource = new CanvasSource(this.canvas, {
				codec: "avc",
				bitrate: videoBitrate,
				hardwareAcceleration: "no-preference",
			});
			output.addVideoTrack(videoSource, { frameRate: fps });

			// Prepare audio if timeline has audio elements
			const audioData = shouldIncludeAudio(this.settings)
				? await renderBrowserTimelineAudio({
						tracks: this.tracks,
						mediaItems: this.mediaItems,
						totalDuration: this.totalDuration,
						fps,
					})
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

			// Render and encode each frame
			for (let frame = 0; frame < totalFrames; frame++) {
				if (this.isExportCancelled()) {
					throw new Error("Export cancelled by user");
				}

				const currentTime = frame * frameDuration;

				// Render frame to canvas using existing renderer
				await this.renderFrame(currentTime);

				// Feed canvas to mediabunny's CanvasSource with timeout
				// (WebCodecs encoder can stall on simulator or unsupported platforms)
				await withTimeout(
					videoSource.add(currentTime, frameDuration),
					10_000,
					`Encoder stalled at frame ${frame + 1}/${totalFrames}`
				);

				// Progress (reserve 5% for finalization)
				const progress = 2 + (frame / totalFrames) * 90;
				progressCallback?.(
					progress,
					`Encoding frame ${frame + 1}/${totalFrames}`
				);

				// Yield to UI every 10 frames
				if (frame % 10 === 0) {
					await new Promise((resolve) => setTimeout(resolve, 0));
				}
			}

			// Add audio data if present
			if (audioSource && audioData) {
				progressCallback?.(93, "Encoding audio...");
				await audioSource.add(audioData);
			}

			progressCallback?.(96, "Finalizing MP4...");
			await output.finalize();

			if (!target.buffer) {
				throw new Error("Export finalization failed — no output buffer");
			}
			const blob = new Blob([target.buffer], { type: "video/mp4" });
			progressCallback?.(100, "Export complete!");

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
			this.activeOutput = null;
			this.isExporting = false;
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
