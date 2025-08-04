import { toast } from "sonner";
import { getMediaStoreUtils, type MediaItem } from "@/stores/media-store-loader";
import { getFFmpegUtilFunctions } from "@/lib/ffmpeg-utils-loader";

export interface ProcessedMediaItem extends Omit<MediaItem, "id"> {}

export async function processMediaFiles(
  files: FileList | File[],
  onProgress?: (progress: number) => void
): Promise<ProcessedMediaItem[]> {
  const fileArray = Array.from(files);
  const processedItems: ProcessedMediaItem[] = [];

  // Load utilities dynamically
  const mediaUtils = await getMediaStoreUtils();
  const ffmpegUtils = await getFFmpegUtilFunctions();

  const total = fileArray.length;
  let completed = 0;

  for (const file of fileArray) {
    const fileType = mediaUtils.getFileType(file);

    if (!fileType) {
      toast.error(`Unsupported file type: ${file.name}`);
      continue;
    }

    const url = URL.createObjectURL(file);
    let thumbnailUrl: string | undefined;
    let duration: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let fps: number | undefined;

    try {
      if (fileType === "image") {
        // Get image dimensions
        const dimensions = await mediaUtils.getImageDimensions(file);
        width = dimensions.width;
        height = dimensions.height;
      } else if (fileType === "video") {
        try {
          // Use FFmpeg for comprehensive video info extraction
          const videoInfo = await ffmpegUtils.getVideoInfo(file);
          duration = videoInfo.duration;
          width = videoInfo.width;
          height = videoInfo.height;
          fps = videoInfo.fps;

          // Generate thumbnail using FFmpeg
          thumbnailUrl = await ffmpegUtils.generateThumbnail(file, 1);
        } catch (error) {
          console.warn(
            "FFmpeg processing failed, falling back to basic processing:",
            error
          );
          // Fallback to basic processing
          const videoResult = await mediaUtils.generateVideoThumbnail(file);
          thumbnailUrl = videoResult.thumbnailUrl;
          width = videoResult.width;
          height = videoResult.height;
          duration = await mediaUtils.getMediaDuration(file);
          // FPS will remain undefined for fallback
        }
      } else if (fileType === "audio") {
        // For audio, we don't set width/height/fps (they'll be undefined)
        duration = await mediaUtils.getMediaDuration(file);
      }

      processedItems.push({
        name: file.name,
        type: fileType,
        file,
        url,
        thumbnailUrl,
        duration,
        width,
        height,
        fps,
      });

      // Yield back to the event loop to keep the UI responsive
      await new Promise((resolve) => setTimeout(resolve, 0));

      completed += 1;
      if (onProgress) {
        const percent = Math.round((completed / total) * 100);
        onProgress(percent);
      }
    } catch (error) {
      console.error("Error processing file:", file.name, error);
      toast.error(`Failed to process ${file.name}`);
      URL.revokeObjectURL(url); // Clean up on error
    }
  }

  return processedItems;
}
