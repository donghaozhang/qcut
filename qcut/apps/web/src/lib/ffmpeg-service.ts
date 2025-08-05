import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { initFFmpeg, isFFmpegReady } from "./ffmpeg-utils";

export class FFmpegService {
  private ffmpeg: FFmpeg | null = null;
  private onProgress?: (progress: number, message: string) => void;

  constructor(
    onProgress?: (progress: number, message: string) => void
  ) {
    this.onProgress = onProgress;
  }

  async initialize(): Promise<void> {
    console.log("[FFmpeg Service] 🔄 Starting initialization...");

    try {
      // Use the ffmpeg-utils which already handles Electron properly and singleton management
      console.log("[FFmpeg Service] 📞 Calling initFFmpeg()...");
      this.ffmpeg = await initFFmpeg();
      console.log(
        "[FFmpeg Service] ✅ initFFmpeg() completed, instance received"
      );

      if (!this.ffmpeg) {
        throw new Error("FFmpeg instance is null after initialization");
      }

      console.log("[FFmpeg Service] ✅ Initialized successfully");
    } catch (error) {
      console.error("[FFmpeg Service] ❌ Initialization failed:", error);
      throw error;
    }
  }

  async encodeFramesToVideo(
    frames: Blob[],
    fps: number,
    format: string
  ): Promise<Blob> {
    console.log(
      `[FFmpeg Service] 🎬 Starting encodeFramesToVideo with ${frames.length} frames`
    );

    // Ensure FFmpeg is ready, re-initialize if needed
    if (!isFFmpegReady() || !this.ffmpeg) {
      console.log("[FFmpeg Service] 🔄 FFmpeg not ready, initializing...");
      await this.initialize();
    }

    if (!this.ffmpeg || !isFFmpegReady()) {
      throw new Error(
        "FFmpeg initialization failed - instance not ready for encoding"
      );
    }

    console.log(
      `[FFmpeg Service] ✅ FFmpeg ready, starting video encoding: ${frames.length} frames at ${fps}fps to ${format}`
    );

    try {
      // Add progress during encoding
      this.ffmpeg!.on("progress", ({ progress, time }) => {
        const percent = 90 + progress * 10; // 90-100% range
        console.log(
          `[FFmpeg Service] 📊 Encoding progress: ${Math.round(progress * 100)}%`
        );
        this.onProgress?.(
          percent,
          `Encoding video... ${Math.round(progress * 100)}%`
        );
      });

      console.log(
        "[FFmpeg Service] 📝 Writing frames to FFmpeg file system..."
      );
      // Write frames to FFmpeg file system
      for (let i = 0; i < frames.length; i++) {
        console.log(
          `[FFmpeg Service] 📂 Processing frame ${i + 1}/${frames.length}...`
        );
        const frameData = await frames[i].arrayBuffer();
        const frameName = `frame${i.toString().padStart(5, "0")}.png`;
        await this.ffmpeg.writeFile(frameName, new Uint8Array(frameData));

        if (i % 10 === 0 || i === frames.length - 1) {
          console.log(
            `[FFmpeg Service] ✅ Written ${i + 1}/${frames.length} frames`
          );
        }
      }

      console.log(
        "[FFmpeg Service] 🎥 All frames written, starting video encoding..."
      );
      // Encode video
      const outputFile = `output.${format}`;
      await this.runFFmpegCommand(fps, format, outputFile);

      console.log("[FFmpeg Service] 📖 Reading output file...");
      // Read output
      const data = await this.ffmpeg.readFile(outputFile);
      const videoBlob = new Blob([data], { type: `video/${format}` });

      console.log(
        `[FFmpeg Service] ✅ Video encoded successfully: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`
      );

      // Cleanup
      console.log("[FFmpeg Service] 🧹 Cleaning up temporary files...");
      await this.cleanup();

      console.log(
        "[FFmpeg Service] 🎉 encodeFramesToVideo completed successfully"
      );
      return videoBlob;
    } catch (error) {
      console.error("[FFmpeg Service] ❌ Error during encoding:", error);
      throw error;
    }
  }

  private async runFFmpegCommand(
    fps: number,
    format: string,
    outputFile: string
  ): Promise<void> {
    const args = this.getFFmpegArgs(fps, format, outputFile);

    console.log("[FFmpeg Service] 🚀 Running FFmpeg command:", args.join(" "));

    try {
      console.log("[FFmpeg Service] ⏳ Executing FFmpeg command...");
      await this.ffmpeg!.exec(args);
      console.log("[FFmpeg Service] ✅ FFmpeg command completed successfully");
    } catch (error) {
      console.error("[FFmpeg Service] ❌ FFmpeg command failed:", error);
      throw error;
    }
  }

  private getFFmpegArgs(
    fps: number,
    format: string,
    outputFile: string
  ): string[] {
    const baseArgs = [
      "-framerate",
      fps.toString(),
      "-pattern_type",
      "sequence",
      "-i",
      "frame%05d.png",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "fast",
      "-crf",
      "23",
    ];

    // Format-specific settings
    if (format === "mp4") {
      baseArgs.push("-movflags", "+faststart");
    } else if (format === "webm") {
      baseArgs[baseArgs.indexOf("libx264")] = "libvpx-vp9";
      baseArgs.push("-b:v", "1M");
    }

    baseArgs.push(outputFile);
    return baseArgs;
  }

  private async cleanup(): Promise<void> {
    // Remove all frame files
    const files = await this.ffmpeg!.listDir("/");
    for (const file of files) {
      if (file.name.startsWith("frame") || file.name.startsWith("output")) {
        await this.ffmpeg!.deleteFile(file.name);
      }
    }
  }
}
