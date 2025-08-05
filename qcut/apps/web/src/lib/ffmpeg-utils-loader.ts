let ffmpegUtilsModule: typeof import("./ffmpeg-utils") | undefined;

export async function getFFmpegUtils() {
  if (!ffmpegUtilsModule) {
    ffmpegUtilsModule = await import("./ffmpeg-utils");
  }
  return ffmpegUtilsModule;
}

// Re-export commonly used functions
export async function getFFmpegUtilFunctions() {
  const module = await getFFmpegUtils();
  return {
    initFFmpeg: module.initFFmpeg,
    isFFmpegReady: module.isFFmpegReady,
    getFFmpegInstance: module.getFFmpegInstance,
    generateThumbnail: module.generateThumbnail,
    trimVideo: module.trimVideo,
    getVideoInfo: module.getVideoInfo,
    convertToWebM: module.convertToWebM,
    extractAudio: module.extractAudio,
    // Add other utility functions as they are found in the module
  };
}
