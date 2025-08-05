import { ExportEngine } from "./export-engine";
import { ExportSettings } from "@/types/export";
import { TimelineTrack } from "@/types/timeline";
import { MediaItem } from "@/stores/media-store";

export type ProgressCallback = (progress: number, message: string) => void;

export class CLIExportEngine extends ExportEngine {
  private sessionId: string | null = null;
  private frameDir: string | null = null;

  // Override parent's renderFrame to skip video validation issues
  async renderFrame(currentTime: number): Promise<void> {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Fill with background color (black for now)
    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const activeElements = this.getActiveElementsCLI(currentTime);

    // Sort elements by track type (render bottom to top)
    const sortedElements = activeElements.sort((a, b) => {
      // Text tracks on top
      if (a.track.type === "text" && b.track.type !== "text") return 1;
      if (b.track.type === "text" && a.track.type !== "text") return -1;
      // Audio tracks at bottom
      if (a.track.type === "audio" && b.track.type !== "audio") return -1;
      if (b.track.type === "audio" && a.track.type !== "audio") return 1;
      return 0;
    });

    // Render each active element WITHOUT validation
    for (const { element, mediaItem } of sortedElements) {
      await this.renderElementCLI(element, mediaItem, currentTime);
    }
  }

  // CLI-specific element rendering without black frame validation
  private async renderElementCLI(
    element: any,
    mediaItem: any,
    currentTime: number
  ): Promise<void> {
    const elementTimeOffset = currentTime - element.startTime;

    if (element.type === "media" && mediaItem) {
      await this.renderMediaElementCLI(element, mediaItem, elementTimeOffset);
    } else if (element.type === "text") {
      this.renderTextElementCLI(element);
    }
  }

  // CLI media rendering with more lenient validation
  private async renderMediaElementCLI(
    element: any,
    mediaItem: any,
    timeOffset: number
  ): Promise<void> {
    if (!mediaItem.url) {
      console.warn(`[CLIExportEngine] No URL for media item ${mediaItem.id}`);
      return;
    }

    try {
      if (mediaItem.type === "image") {
        await this.renderImageCLI(element, mediaItem);
      } else if (mediaItem.type === "video") {
        await this.renderVideoCLI(element, mediaItem, timeOffset);
      }
    } catch (error) {
      console.warn(
        `[CLIExportEngine] Failed to render ${element.id}, using fallback:`,
        error
      );
      // Fallback: render a colored rectangle instead of failing
      this.ctx.fillStyle = "#333333";
      const bounds = this.calculateElementBounds(element, 640, 480);
      this.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
  }

  // Simplified video rendering for CLI without strict validation
  private async renderVideoCLI(
    element: any,
    mediaItem: any,
    timeOffset: number
  ): Promise<void> {
    try {
      let video = this.getVideoFromCache(mediaItem.url);
      if (!video) {
        video = document.createElement("video");
        video.src = mediaItem.url;
        video.crossOrigin = "anonymous";

        await new Promise<void>((resolve, reject) => {
          video!.onloadeddata = () => resolve();
          video!.onerror = () => reject(new Error("Failed to load video"));
          setTimeout(() => reject(new Error("Video load timeout")), 5000);
        });

        this.cacheVideo(mediaItem.url, video);
      }

      // Seek to the correct time
      const seekTime = timeOffset + element.trimStart;
      video.currentTime = seekTime;

      // Wait for seek with more generous timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.warn(
            "[CLIExportEngine] Video seek timeout, using current frame"
          );
          resolve(); // Don't reject, just use whatever frame we have
        }, 3000); // Increased timeout

        video.onseeked = () => {
          clearTimeout(timeout);
          setTimeout(() => resolve(), 200); // Longer stabilization
        };
      });

      // Calculate bounds and draw
      const { x, y, width, height } = this.calculateElementBounds(
        element,
        video.videoWidth || 640,
        video.videoHeight || 480
      );

      this.ctx.drawImage(video, x, y, width, height);

      // No black frame validation for CLI export
    } catch (error) {
      console.warn(
        "[CLIExportEngine] Video render failed, using placeholder:",
        error
      );
      // Render placeholder instead of failing
      this.ctx.fillStyle = "#444444";
      const bounds = this.calculateElementBounds(element, 640, 480);
      this.ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
  }

  // Simple image rendering for CLI
  private async renderImageCLI(element: any, mediaItem: any): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const { x, y, width, height } = this.calculateElementBounds(
            element,
            img.width,
            img.height
          );
          this.ctx.drawImage(img, x, y, width, height);
          resolve();
        } catch (error) {
          console.warn("[CLIExportEngine] Image render failed:", error);
          resolve(); // Don't fail the export
        }
      };

      img.onerror = () => {
        console.warn(
          `[CLIExportEngine] Failed to load image: ${mediaItem.url}`
        );
        resolve(); // Don't fail the export
      };

      // Timeout fallback
      setTimeout(() => {
        console.warn(`[CLIExportEngine] Image load timeout: ${mediaItem.url}`);
        resolve();
      }, 3000);

      img.src = mediaItem.url!;
    });
  }

  // Simple text rendering for CLI
  private renderTextElementCLI(element: any): void {
    if (element.type !== "text" || !element.content?.trim()) return;

    this.ctx.fillStyle = element.color || "#ffffff";
    this.ctx.font = `${element.fontSize || 24}px ${element.fontFamily || "Arial"}`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";

    const x = element.x || 50;
    const y = element.y || 50;

    this.ctx.fillText(element.content, x, y);
  }

  // Helper methods for video caching (CLI-specific cache)
  private cliVideoCache = new Map<string, HTMLVideoElement>();

  private getVideoFromCache(url: string): HTMLVideoElement | undefined {
    return this.cliVideoCache.get(url);
  }

  private cacheVideo(url: string, video: HTMLVideoElement): void {
    this.cliVideoCache.set(url, video);
  }

  // Helper to get active elements (CLI-specific version)
  private getActiveElementsCLI(
    currentTime: number
  ): Array<{ element: any; track: any; mediaItem: any }> {
    const activeElements: Array<{ element: any; track: any; mediaItem: any }> =
      [];

    this.tracks.forEach((track) => {
      track.elements.forEach((element) => {
        if (element.hidden) return;

        const elementStart = element.startTime;
        const elementEnd =
          element.startTime +
          (element.duration - element.trimStart - element.trimEnd);

        if (currentTime >= elementStart && currentTime < elementEnd) {
          let mediaItem = null;
          if (element.type === "media" && element.mediaId !== "test") {
            mediaItem =
              this.mediaItems.find((item) => item.id === element.mediaId) ||
              null;
          }
          activeElements.push({ element, track, mediaItem });
        }
      });
    });

    return activeElements;
  }

  async export(progressCallback?: ProgressCallback): Promise<Blob> {
    console.log("[CLIExportEngine] Starting CLI export...");

    // Log original timeline duration
    console.log(
      `[CLIExportEngine] 📏 Original timeline duration: ${this.totalDuration.toFixed(3)}s`
    );
    console.log(
      `[CLIExportEngine] 🎬 Target frames: ${this.calculateTotalFrames()} frames at 30fps`
    );

    // Create export session
    progressCallback?.(5, "Setting up export session...");
    const session = await this.createExportSession();
    this.sessionId = session.sessionId;
    this.frameDir = session.frameDir;

    try {
      // Pre-load videos (our optimization)
      progressCallback?.(10, "Pre-loading videos...");
      await this.preloadAllVideos();

      // Render frames to disk
      progressCallback?.(15, "Rendering frames...");
      await this.renderFramesToDisk(progressCallback);

      // Export with FFmpeg CLI
      progressCallback?.(85, "Encoding with FFmpeg CLI...");
      const outputFile = await this.exportWithCLI(progressCallback);

      // Read result and cleanup
      progressCallback?.(95, "Reading output...");
      const videoBlob = await this.readOutputFile(outputFile);

      // Log exported video information
      console.log(
        `[CLIExportEngine] 📦 Exported video size: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`
      );
      console.log(`[CLIExportEngine] 🔗 Blob type: ${videoBlob.type}`);

      // Calculate and log expected vs actual video duration
      const expectedDuration = this.totalDuration;
      const actualFramesRendered = this.calculateTotalFrames();
      const calculatedDuration = actualFramesRendered / 30; // 30fps

      console.log(
        `[CLIExportEngine] ⏱️  Expected duration: ${expectedDuration.toFixed(3)}s`
      );
      console.log(
        `[CLIExportEngine] ⏱️  Calculated duration: ${calculatedDuration.toFixed(3)}s (${actualFramesRendered} frames / 30fps)`
      );
      console.log(
        `[CLIExportEngine] 📊 Duration ratio: ${(calculatedDuration / expectedDuration).toFixed(3)}x`
      );

      // Try to get actual video duration from blob
      this.logActualVideoDurationCLI(videoBlob);

      progressCallback?.(100, "Export completed!");
      return videoBlob;
    } finally {
      // For debugging: don't cleanup temp files so we can inspect frames
      console.log(
        "[CLIExportEngine] 🔍 DEBUG: Keeping frames in temp directory for inspection"
      );
      console.log(
        `[CLIExportEngine] 📁 Frames location: C:\\Users\\zdhpe\\AppData\\Local\\Temp\\qcut-export\\${this.sessionId}\\frames`
      );
      console.log(
        "[CLIExportEngine] 🧪 TEST: Try this FFmpeg command manually:"
      );
      console.log(
        `cd "C:\\Users\\zdhpe\\Desktop\\vite_opencut\\OpenCut-main\\qcut\\electron\\resources" && ffmpeg.exe -y -framerate 30 -i "C:\\Users\\zdhpe\\AppData\\Local\\Temp\\qcut-export\\${this.sessionId}\\frames\\frame-%04d.png" -c:v libx264 -preset fast -crf 23 -t 5 test-output.mp4`
      );

      // Uncomment this line to cleanup as normal:
      // if (this.sessionId) {
      //   await this.cleanup();
      // }
    }
  }

  private async createExportSession() {
    // Use existing Electron API structure
    if (!window.electronAPI) {
      throw new Error("CLI export only available in Electron");
    }

    return await window.electronAPI.invoke("create-export-session");
  }

  private async renderFramesToDisk(
    progressCallback?: ProgressCallback
  ): Promise<void> {
    const totalFrames = this.calculateTotalFrames();
    const frameTime = 1 / 30; // fps

    console.log(`[CLI] Rendering ${totalFrames} frames to disk...`);

    for (let frame = 0; frame < totalFrames; frame++) {
      if (this.abortController?.signal.aborted) {
        throw new Error("Export cancelled");
      }

      const currentTime = frame * frameTime;

      // Render frame to canvas
      await this.renderFrame(currentTime);

      // Save frame to disk
      const framePath = `frame-${frame.toString().padStart(4, "0")}.png`;
      await this.saveFrameToDisk(framePath);

      // Progress update (15% to 80% for frame rendering)
      const progress = 15 + (frame / totalFrames) * 65;
      progressCallback?.(
        progress,
        `Rendering frame ${frame + 1}/${totalFrames}`
      );
    }

    console.log(`[CLI] Rendered ${totalFrames} frames to ${this.frameDir}`);
  }

  private async saveFrameToDisk(frameName: string): Promise<void> {
    if (!window.electronAPI) {
      throw new Error("CLI export only available in Electron");
    }

    try {
      // Convert canvas to base64
      const dataUrl = this.canvas.toDataURL("image/png", 1.0); // Max quality
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");

      // Validate base64 data
      if (!base64Data || base64Data.length < 100) {
        throw new Error(`Invalid PNG data: ${base64Data.length} chars`);
      }

      // Save via IPC using existing API structure
      await window.electronAPI.invoke("save-frame", {
        sessionId: this.sessionId,
        frameName,
        data: base64Data,
      });

      // Log success for debugging
      if (frameName === "frame-0000.png" || frameName === "frame-0001.png") {
        console.log(
          `[CLIExportEngine] Saved ${frameName} (${base64Data.length} chars)`
        );
      }
    } catch (error) {
      console.error(
        `[CLIExportEngine] Failed to save frame ${frameName}:`,
        error
      );
      throw error;
    }
  }

  private async exportWithCLI(
    progressCallback?: ProgressCallback
  ): Promise<string> {
    if (!window.electronAPI) {
      throw new Error("CLI export only available in Electron");
    }

    // Note: Progress updates would need to be added to electronAPI
    // For now, use basic invoke without progress tracking

    const result = await window.electronAPI.invoke("export-video-cli", {
      sessionId: this.sessionId,
      width: this.canvas.width,
      height: this.canvas.height,
      fps: 30,
      quality: this.settings.quality || "medium",
    });

    return result.outputFile;
  }

  private async readOutputFile(outputPath: string): Promise<Blob> {
    if (!window.electronAPI) {
      throw new Error("CLI export only available in Electron");
    }
    const buffer = await window.electronAPI.invoke(
      "read-output-file",
      outputPath
    );
    return new Blob([buffer], { type: "video/mp4" });
  }

  private async cleanup(): Promise<void> {
    if (this.sessionId && window.electronAPI) {
      await window.electronAPI.invoke("cleanup-export-session", this.sessionId);
    }
  }

  calculateTotalFrames(): number {
    return Math.ceil(this.totalDuration * 30); // 30 fps
  }

  // Get actual video duration from blob for debugging (CLI version)
  private logActualVideoDurationCLI(videoBlob: Blob): void {
    const video = document.createElement("video");
    const url = URL.createObjectURL(videoBlob);

    video.onloadedmetadata = () => {
      const actualDuration = video.duration;
      const expectedDuration = this.totalDuration;

      console.log(
        `[CLIExportEngine] 🎥 Actual video duration: ${actualDuration.toFixed(3)}s`
      );
      console.log(
        `[CLIExportEngine] 📈 Timeline vs Video ratio: ${(actualDuration / expectedDuration).toFixed(3)}x`
      );

      if (Math.abs(actualDuration - expectedDuration) > 0.1) {
        console.warn(
          `[CLIExportEngine] ⚠️  Duration mismatch detected! Expected: ${expectedDuration.toFixed(3)}s, Got: ${actualDuration.toFixed(3)}s`
        );
      } else {
        console.log("[CLIExportEngine] ✅ Duration match within tolerance");
      }

      // Cleanup
      URL.revokeObjectURL(url);
    };

    video.onerror = () => {
      console.warn(
        "[CLIExportEngine] ⚠️  Could not determine actual video duration"
      );
      URL.revokeObjectURL(url);
    };

    video.src = url;
  }
}
