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
  const { FFmpeg } = await getFFmpeg();
  return new FFmpeg();
}