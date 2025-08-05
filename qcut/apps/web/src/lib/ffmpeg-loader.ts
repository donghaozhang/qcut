import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegModule: typeof import("@ffmpeg/ffmpeg") | undefined;

export async function getFFmpeg() {
  if (!ffmpegModule) {
    ffmpegModule = await import("@ffmpeg/ffmpeg");
  }
  return ffmpegModule;
}

// Helper to create FFmpeg instance
export async function createFFmpeg() {
  try {
    const ffmpegModule = await getFFmpeg();

    if (!ffmpegModule || !ffmpegModule.FFmpeg) {
      throw new Error(
        "FFmpeg module failed to load or FFmpeg class not available"
      );
    }

    const { FFmpeg } = ffmpegModule;
    const instance = new FFmpeg();

    if (!instance) {
      throw new Error("FFmpeg constructor returned null/undefined");
    }

    return instance;
  } catch (error) {
    console.error(
      "[FFmpeg Loader] ❌ Failed to create FFmpeg instance:",
      error
    );
    throw error;
  }
}
