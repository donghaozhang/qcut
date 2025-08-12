import { toast } from "sonner";
import {
  getMediaStoreUtils,
  type MediaItem,
} from "@/stores/media-store-loader";
import { getFFmpegUtilFunctions } from "@/lib/ffmpeg-utils-loader";
import { debugLog, debugError, debugWarn } from "@/lib/debug-config";

export interface ProcessedMediaItem extends Omit<MediaItem, "id"> {}

export async function processMediaFiles(
  files: FileList | File[],
  onProgress?: (progress: number) => void
): Promise<ProcessedMediaItem[]> {
  debugLog(
    "[Media Processing] 🚀 Starting processMediaFiles with",
    files.length,
    "files"
  );
  const fileArray = Array.from(files);
  const processedItems: ProcessedMediaItem[] = [];

  // Load utilities dynamically
  const mediaUtils = await getMediaStoreUtils();
  const ffmpegUtils = await getFFmpegUtilFunctions();

  const total = fileArray.length;
  let completed = 0;

  for (const file of fileArray) {
    debugLog(
      `[Media Processing] 🎬 Processing file: ${file.name} (${file.type}, ${(file.size / 1024 / 1024).toFixed(2)} MB)`
    );

    const fileType = mediaUtils.getFileType(file);
    debugLog(`[Media Processing] 📝 Detected file type: ${fileType}`);

    if (!fileType) {
      debugWarn(
        `[Media Processing] ❌ Unsupported file type: ${file.name} (${file.type})`
      );
      toast.error(`Unsupported file type: ${file.name}`);
      continue;
    }

    // Create object URL silently
    const url = URL.createObjectURL(file);

    let thumbnailUrl: string | undefined;
    let duration: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let fps: number | undefined;

    try {
      if (fileType === "image") {
        debugLog(`[Media Processing] 🖼️ Processing image: ${file.name}`);
        // Get image dimensions
        const dimensions = await mediaUtils.getImageDimensions(file);
        width = dimensions.width;
        height = dimensions.height;
        debugLog(`[Media Processing] ✅ Image processed: ${width}x${height}`);
      } else if (fileType === "video") {
        debugLog(`[Media Processing] 🎥 Processing video: ${file.name}`);
        try {
          debugLog(
            "[Media Processing] 🌐 Using browser APIs for video processing (primary method)..."
          );
          const videoResult = await mediaUtils.generateVideoThumbnail(file);
          debugLog(
            "[Media Processing] ✅ Browser thumbnail generated:",
            videoResult
          );
          thumbnailUrl = videoResult.thumbnailUrl;
          width = videoResult.width;
          height = videoResult.height;

          debugLog("[Media Processing] ⏱️ Getting video duration...");
          duration = await mediaUtils.getMediaDuration(file);

          // Set default FPS for browser processing
          fps = 30;

          // Skip FFmpeg enhancement entirely to avoid error messages
          // Browser APIs are sufficient for most use cases
          debugLog(
            "[Media Processing] ✅ Browser processing complete, skipping FFmpeg enhancement"
          );
        } catch (error) {
          debugWarn(
            "[Media Processing] Browser processing failed, falling back to FFmpeg:",
            error
          );

          // Fallback to FFmpeg processing
          try {
            debugLog(
              "[Media Processing] 🔧 Attempting FFmpeg fallback processing..."
            );
            const videoInfo = await ffmpegUtils.getVideoInfo(file);
            debugLog(
              "[Media Processing] ✅ FFmpeg getVideoInfo successful:",
              videoInfo
            );
            duration = videoInfo.duration;
            width = videoInfo.width;
            height = videoInfo.height;
            fps = videoInfo.fps;

            debugLog(
              "[Media Processing] 🖼️ Generating thumbnail with FFmpeg..."
            );
            // Skip FFmpeg thumbnail generation if video dimensions are invalid
            if (width === 0 || height === 0) {
              debugWarn(
                `[Media Processing] ⚠️ Skipping FFmpeg thumbnail due to invalid dimensions (${width}x${height})`
              );
              throw new Error(
                "Invalid video dimensions for thumbnail generation"
              );
            }
            // Generate thumbnail using FFmpeg
            thumbnailUrl = await ffmpegUtils.generateThumbnail(file, 1);
            debugLog(
              "[Media Processing] ✅ FFmpeg fallback processing successful"
            );
          } catch (ffmpegError) {
            debugWarn(
              "[Media Processing] ⚠️ FFmpeg fallback also failed, using minimal processing:",
              ffmpegError
            );

            // Minimal processing - just basic file info
            try {
              duration = await mediaUtils.getMediaDuration(file);
            } catch (durationError) {
              debugWarn(
                "[Media Processing] ⚠️ Duration extraction failed:",
                durationError
              );
              duration = 0; // Default duration
            }

            // Set default dimensions for failed processing
            width = 1920;
            height = 1080;
            fps = 30;
            thumbnailUrl = undefined;

            debugLog("[Media Processing] ✅ Minimal processing completed");
          }
        }
      } else if (fileType === "audio") {
        debugLog(`[Media Processing] 🎵 Processing audio: ${file.name}`);
        // For audio, we don't set width/height/fps (they'll be undefined)
        duration = await mediaUtils.getMediaDuration(file);
        debugLog("[Media Processing] ✅ Audio duration extracted:", duration);
      }

      const processedItem = {
        name: file.name,
        type: fileType,
        file,
        url,
        thumbnailUrl,
        duration,
        width,
        height,
        fps,
      };

      debugLog("[Media Processing] ➕ Adding processed item:", {
        name: processedItem.name,
        type: processedItem.type,
        url: processedItem.url ? "SET" : "UNSET",
        thumbnailUrl: processedItem.thumbnailUrl ? "SET" : "UNSET",
        duration: processedItem.duration,
        width: processedItem.width,
        height: processedItem.height,
        fps: processedItem.fps,
      });

      processedItems.push(processedItem);

      // Yield back to the event loop to keep the UI responsive
      await new Promise((resolve) => setTimeout(resolve, 0));

      completed += 1;
      if (onProgress) {
        const percent = Math.round((completed / total) * 100);
        onProgress(percent);
        debugLog(
          `[Media Processing] 📊 Progress: ${percent}% (${completed}/${total})`
        );
      }
    } catch (error) {
      debugError(
        "[Media Processing] ❌ Critical error processing file:",
        file.name,
        error
      );

      // Don't completely abort - try to add the file with minimal info
      try {
        processedItems.push({
          name: file.name,
          type: fileType,
          file,
          url,
          thumbnailUrl: undefined,
          duration:
            fileType === "video" || fileType === "audio" ? 0 : undefined,
          width:
            fileType === "video" || fileType === "image" ? 1920 : undefined,
          height:
            fileType === "video" || fileType === "image" ? 1080 : undefined,
          fps: fileType === "video" ? 30 : undefined,
        });

        debugLog(
          "[Media Processing] ✅ Added file with minimal processing:",
          file.name
        );
        toast.warning(`${file.name} added with limited processing`);
      } catch (addError) {
        debugError(
          "[Media Processing] ❌ Failed to add file even with minimal processing:",
          addError
        );
        toast.error(`Failed to process ${file.name}`);
        URL.revokeObjectURL(url); // Clean up on complete failure
      }
    }
  }

  return processedItems;
}

/**
 * Convert FAL.ai media URLs to blob URLs to avoid CORS/COEP issues
 */
export async function convertFalImageToBlob(imageUrl: string): Promise<string> {
  if (!imageUrl.includes("fal.media")) {
    debugLog("[FAL Image] URL is not a fal.media URL, returning as-is");
    return imageUrl;
  }

  try {
    debugLog("[FAL Image] Converting fal.media URL to blob:", imageUrl);
    const response = await fetch(imageUrl, {
      mode: "cors",
      headers: {
        "Accept": "image/*",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    debugLog("[FAL Image] ✅ Successfully converted to blob URL:", blobUrl);
    return blobUrl;
  } catch (error) {
    debugError("[FAL Image] ❌ Failed to convert to blob:", error);
    // Fallback to original URL - better to try than completely fail
    return imageUrl;
  }
}
