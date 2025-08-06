import { toast } from "sonner";
import {
  getMediaStoreUtils,
  type MediaItem,
} from "@/stores/media-store-loader";
import { getFFmpegUtilFunctions } from "@/lib/ffmpeg-utils-loader";

export interface ProcessedMediaItem extends Omit<MediaItem, "id"> {}

export async function processMediaFiles(
  files: FileList | File[],
  onProgress?: (progress: number) => void
): Promise<ProcessedMediaItem[]> {
  console.log(
    "[Media Processing] 🚀 Starting processMediaFiles with",
    files.length,
    "files"
  );
  const fileArray = Array.from(files);
  const processedItems: ProcessedMediaItem[] = [];

  // Load utilities dynamically
  console.log("[Media Processing] 📦 Loading media store utils...");
  const mediaUtils = await getMediaStoreUtils();
  console.log("[Media Processing] ✅ Media store utils loaded");

  console.log("[Media Processing] 📦 Loading FFmpeg utils...");
  const ffmpegUtils = await getFFmpegUtilFunctions();
  console.log("[Media Processing] ✅ FFmpeg utils loaded");

  const total = fileArray.length;
  let completed = 0;

  for (const file of fileArray) {
    console.log(
      `[Media Processing] 🎬 Processing file: ${file.name} (${file.type}, ${(file.size / 1024 / 1024).toFixed(2)} MB)`
    );

    const fileType = mediaUtils.getFileType(file);
    console.log(`[Media Processing] 📝 Detected file type: ${fileType}`);

    if (!fileType) {
      console.warn(
        `[Media Processing] ❌ Unsupported file type: ${file.name} (${file.type})`
      );
      toast.error(`Unsupported file type: ${file.name}`);
      continue;
    }

    console.log(`[Media Processing] 🔗 Creating object URL for: ${file.name}`);
    const url = URL.createObjectURL(file);
    console.log(`[Media Processing] ✅ Object URL created: ${url}`);

    let thumbnailUrl: string | undefined;
    let duration: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let fps: number | undefined;

    try {
      if (fileType === "image") {
        console.log(`[Media Processing] 🖼️ Processing image: ${file.name}`);
        // Get image dimensions
        const dimensions = await mediaUtils.getImageDimensions(file);
        width = dimensions.width;
        height = dimensions.height;
        console.log(
          `[Media Processing] ✅ Image processed: ${width}x${height}`
        );
      } else if (fileType === "video") {
        console.log(`[Media Processing] 🎥 Processing video: ${file.name}`);
        try {
          console.log(
            "[Media Processing] 🌐 Using browser APIs for video processing (primary method)..."
          );
          const videoResult = await mediaUtils.generateVideoThumbnail(file);
          console.log(
            "[Media Processing] ✅ Browser thumbnail generated:",
            videoResult
          );
          thumbnailUrl = videoResult.thumbnailUrl;
          width = videoResult.width;
          height = videoResult.height;

          console.log("[Media Processing] ⏱️ Getting video duration...");
          duration = await mediaUtils.getMediaDuration(file);
          console.log("[Media Processing] ✅ Duration extracted:", duration);

          // Set default FPS for browser processing (FFmpeg can override later if needed)
          fps = 30;
          console.log("[Media Processing] ✅ Browser processing successful");

          // Optionally try to enhance with FFmpeg data if available (non-blocking)
          try {
            console.log(
              "[Media Processing] 🔧 Attempting to enhance with FFmpeg data..."
            );
            const videoInfo = await Promise.race([
              ffmpegUtils.getVideoInfo(file),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("FFmpeg enhancement timeout")),
                  5000
                )
              ),
            ]);
            console.log(
              "[Media Processing] ✅ FFmpeg enhancement successful:",
              videoInfo
            );
            // Only override FPS from FFmpeg, keep browser-generated thumbnail and dimensions
            fps = videoInfo.fps || fps;
          } catch (ffmpegError) {
            console.log(
              "[Media Processing] ℹ️ FFmpeg enhancement failed (using browser data):",
              ffmpegError instanceof Error
                ? ffmpegError.message
                : String(ffmpegError)
            );
            // Continue with browser-generated data - this is not an error
          }
        } catch (error) {
          console.warn(
            "[Media Processing] Browser processing failed, falling back to FFmpeg:",
            error
          );

          // Fallback to FFmpeg processing
          try {
            console.log(
              "[Media Processing] 🔧 Attempting FFmpeg fallback processing..."
            );
            const videoInfo = await ffmpegUtils.getVideoInfo(file);
            console.log(
              "[Media Processing] ✅ FFmpeg getVideoInfo successful:",
              videoInfo
            );
            duration = videoInfo.duration;
            width = videoInfo.width;
            height = videoInfo.height;
            fps = videoInfo.fps;

            console.log(
              "[Media Processing] 🖼️ Generating thumbnail with FFmpeg..."
            );
            // Skip FFmpeg thumbnail generation if video dimensions are invalid
            if (width === 0 || height === 0) {
              console.warn(
                `[Media Processing] ⚠️ Skipping FFmpeg thumbnail due to invalid dimensions (${width}x${height})`
              );
              throw new Error(
                "Invalid video dimensions for thumbnail generation"
              );
            }
            // Generate thumbnail using FFmpeg
            thumbnailUrl = await ffmpegUtils.generateThumbnail(file, 1);
            console.log(
              "[Media Processing] ✅ FFmpeg fallback processing successful"
            );
          } catch (ffmpegError) {
            console.warn(
              "[Media Processing] ⚠️ FFmpeg fallback also failed, using minimal processing:",
              ffmpegError
            );

            // Minimal processing - just basic file info
            try {
              duration = await mediaUtils.getMediaDuration(file);
            } catch (durationError) {
              console.warn(
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

            console.log("[Media Processing] ✅ Minimal processing completed");
          }
        }
      } else if (fileType === "audio") {
        console.log(`[Media Processing] 🎵 Processing audio: ${file.name}`);
        // For audio, we don't set width/height/fps (they'll be undefined)
        duration = await mediaUtils.getMediaDuration(file);
        console.log(
          "[Media Processing] ✅ Audio duration extracted:",
          duration
        );
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

      console.log("[Media Processing] ➕ Adding processed item:", {
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
        console.log(
          `[Media Processing] 📊 Progress: ${percent}% (${completed}/${total})`
        );
      }
    } catch (error) {
      console.error(
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

        console.log(
          "[Media Processing] ✅ Added file with minimal processing:",
          file.name
        );
        toast.warning(`${file.name} added with limited processing`);
      } catch (addError) {
        console.error(
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
