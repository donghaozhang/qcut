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
    console.log("[FFmpeg Loader] 📦 Loading FFmpeg module...");
    const ffmpegModule = await getFFmpeg();
    
    if (!ffmpegModule || !ffmpegModule.FFmpeg) {
      console.error("[FFmpeg Loader] ❌ FFmpeg module or FFmpeg class not found:", ffmpegModule);
      throw new Error("FFmpeg module failed to load or FFmpeg class not available");
    }
    
    console.log("[FFmpeg Loader] ✅ FFmpeg module loaded, creating instance...");
    const { FFmpeg } = ffmpegModule;
    const instance = new FFmpeg();
    
    if (!instance) {
      throw new Error("FFmpeg constructor returned null/undefined");
    }
    
    console.log("[FFmpeg Loader] ✅ FFmpeg instance created successfully");
    return instance;
  } catch (error) {
    console.error("[FFmpeg Loader] ❌ Failed to create FFmpeg instance:", error);
    throw error;
  }
}
