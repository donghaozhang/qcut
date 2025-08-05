import { create } from "zustand";
import { storageService } from "@/lib/storage/storage-service";
import { useTimelineStore } from "./timeline-store";
import { generateUUID } from "@/lib/utils";
import { getVideoInfo, generateThumbnail } from "@/lib/ffmpeg-utils";

export type MediaType = "image" | "video" | "audio";

export interface MediaItem {
  id: string;
  name: string;
  type: MediaType;
  file: File;
  url?: string; // Object URL for preview
  thumbnailUrl?: string; // For video thumbnails
  duration?: number; // For video/audio duration
  width?: number; // For video/image width
  height?: number; // For video/image height
  fps?: number; // For video frame rate
  // Text-specific properties
  content?: string; // Text content
  fontSize?: number; // Font size
  fontFamily?: string; // Font family
  color?: string; // Text color
  backgroundColor?: string; // Background color
  textAlign?: "left" | "center" | "right"; // Text alignment
  // Metadata for various sources (AI generated, etc.)
  metadata?: {
    source?: string; // e.g., 'text2image', 'upload', etc.
    [key: string]: any; // Allow other metadata
  };
}

interface MediaStore {
  mediaItems: MediaItem[];
  isLoading: boolean;

  // Actions - now require projectId
  addMediaItem: (
    projectId: string,
    item: Omit<MediaItem, "id">
  ) => Promise<void>;
  addGeneratedImages: (
    items: Array<{
      url: string;
      type: MediaType;
      name: string;
      size: number;
      duration: number;
      metadata?: {
        source?: string;
        [key: string]: any;
      };
    }>
  ) => void;
  removeMediaItem: (projectId: string, id: string) => Promise<void>;
  loadProjectMedia: (projectId: string) => Promise<void>;
  clearProjectMedia: (projectId: string) => Promise<void>;
  clearAllMedia: () => void; // Clear local state only
}

// Helper function to determine file type
export const getFileType = (file: File): MediaType | null => {
  const { type } = file;

  if (type.startsWith("image/")) {
    return "image";
  }
  if (type.startsWith("video/")) {
    return "video";
  }
  if (type.startsWith("audio/")) {
    return "audio";
  }

  return null;
};

// Helper function to get image dimensions
export const getImageDimensions = (
  file: File
): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();

    img.addEventListener("load", () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      resolve({ width, height });
      img.remove();
    });

    img.addEventListener("error", () => {
      reject(new Error("Could not load image"));
      img.remove();
    });

    img.src = URL.createObjectURL(file);
  });
};

// Enhanced video processing with browser APIs first, FFmpeg as fallback
export const processVideoFile = async (file: File) => {
  try {
    // Try browser processing first - it's fast, reliable, and doesn't timeout
    const [thumbnailData, duration] = await Promise.all([
      generateVideoThumbnailBrowser(file),
      getMediaDuration(file)
    ]);
    
    return {
      thumbnailUrl: thumbnailData.thumbnailUrl,
      width: thumbnailData.width,
      height: thumbnailData.height,
      duration,
      fps: 30, // Default FPS for browser method
      processingMethod: 'browser'
    };
  } catch (browserError) {
    // Fallback to FFmpeg processing (for edge cases or special codecs)
    try {
      const [videoInfo, thumbnailUrl] = await Promise.all([
        getVideoInfo(file),
        generateThumbnail(file, 1) // Generate thumbnail at 1 second
      ]);
      
      return {
        thumbnailUrl,
        width: videoInfo.width,
        height: videoInfo.height,
        duration: videoInfo.duration,
        fps: videoInfo.fps,
        processingMethod: 'ffmpeg'
      };
    } catch (ffmpegError) {
      // Return minimal data to prevent complete failure
      return {
        thumbnailUrl: undefined,
        width: 1920, // Default resolution
        height: 1080,
        duration: 0,
        fps: 30,
        processingMethod: 'fallback',
        error: `Processing failed: ${ffmpegError instanceof Error ? ffmpegError.message : String(ffmpegError)}`
      };
    }
  }
};

// Helper function to generate video thumbnail using browser APIs (primary method)
export const generateVideoThumbnailBrowser = (
  file: File
): Promise<{ thumbnailUrl: string; width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video") as HTMLVideoElement;
    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }

    const cleanup = () => {
      video.remove();
      canvas.remove();
    };

    // Set timeout to prevent hanging
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Video thumbnail generation timed out"));
    }, 10_000);

    video.addEventListener("loadedmetadata", () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Seek to 1 second or 10% of duration, whichever is smaller
      video.currentTime = Math.min(1, video.duration * 0.1);
    });

    video.addEventListener("seeked", () => {
      try {
        clearTimeout(timeout);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
        const width = video.videoWidth;
        const height = video.videoHeight;

        resolve({ thumbnailUrl, width, height });
        cleanup();
      } catch (drawError) {
        cleanup();
        reject(new Error(`Canvas drawing failed: ${drawError instanceof Error ? drawError.message : String(drawError)}`));
      }
    });

    video.addEventListener("error", (event) => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(`Video loading failed: ${video.error?.message || 'Unknown error'}`));
    });

    try {
      video.src = URL.createObjectURL(file);
      video.load();
    } catch (urlError) {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(`Failed to create object URL: ${urlError instanceof Error ? urlError.message : String(urlError)}`));
    }
  });
};

// Helper function to get media duration
export const getMediaDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const element = document.createElement(
      file.type.startsWith("video/") ? "video" : "audio"
    ) as HTMLVideoElement;

    element.addEventListener("loadedmetadata", () => {
      resolve(element.duration);
      element.remove();
    });

    element.addEventListener("error", () => {
      reject(new Error("Could not load media"));
      element.remove();
    });

    element.src = URL.createObjectURL(file);
    element.load();
  });
};

// Helper to get aspect ratio from MediaItem
export const getMediaAspectRatio = (item: MediaItem): number => {
  if (item.width && item.height) {
    return item.width / item.height;
  }
  return 16 / 9; // Default aspect ratio
};

export const useMediaStore = create<MediaStore>((set, get) => ({
  mediaItems: [],
  isLoading: false,

  addMediaItem: async (projectId, item) => {
    const newItem: MediaItem = {
      ...item,
      id: generateUUID(),
    };

    // Add to local state immediately for UI responsiveness
    set((state) => ({
      mediaItems: [...state.mediaItems, newItem],
    }));

    // Save to persistent storage in background
    try {
      await storageService.saveMediaItem(projectId, newItem);
    } catch (error) {
      console.error("Failed to save media item:", error);
      // Remove from local state if save failed
      set((state) => ({
        mediaItems: state.mediaItems.filter((media) => media.id !== newItem.id),
      }));
    }
  },

  addGeneratedImages: (items) => {
    const newItems: MediaItem[] = items.map((item) => ({
      id: generateUUID(),
      name: item.name,
      type: item.type,
      file: new File([], item.name), // Empty file for generated images
      url: item.url,
      duration: item.duration,
      metadata: item.metadata,
    }));

    // Add to local state immediately
    set((state) => ({
      mediaItems: [...state.mediaItems, ...newItems],
    }));
  },

  removeMediaItem: async (projectId: string, id: string) => {
    const state = get();
    const item = state.mediaItems.find((media) => media.id === id);

    // Cleanup object URLs to prevent memory leaks
    if (item?.url) {
      URL.revokeObjectURL(item.url);
      if (item.thumbnailUrl) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    }

    // 1) Remove from local state immediately
    set((state) => ({
      mediaItems: state.mediaItems.filter((media) => media.id !== id),
    }));

    // 2) Cascade into the timeline: remove any elements using this media ID
    const timeline = useTimelineStore.getState();
    const {
      tracks,
      removeElementFromTrack,
      removeElementFromTrackWithRipple,
      rippleEditingEnabled,
      pushHistory,
    } = timeline;

    // Find all elements that reference this media
    const elementsToRemove: Array<{ trackId: string; elementId: string }> = [];
    for (const track of tracks) {
      for (const el of track.elements) {
        if (el.type === "media" && el.mediaId === id) {
          elementsToRemove.push({ trackId: track.id, elementId: el.id });
        }
      }
    }

    // If there are elements to remove, push history once before batch removal
    if (elementsToRemove.length > 0) {
      pushHistory();

      // Remove all elements without pushing additional history entries
      for (const { trackId, elementId } of elementsToRemove) {
        if (rippleEditingEnabled) {
          removeElementFromTrackWithRipple(trackId, elementId, false);
        } else {
          removeElementFromTrack(trackId, elementId, false);
        }
      }
    }

    // 3) Remove from persistent storage
    try {
      await storageService.deleteMediaItem(projectId, id);
    } catch (error) {
      console.error("Failed to delete media item:", error);
    }
  },

  loadProjectMedia: async (projectId) => {
    set({ isLoading: true });

    try {
      const mediaItems = await storageService.loadAllMediaItems(projectId);

      // Process media items with enhanced error handling
      const updatedMediaItems = await Promise.all(
        mediaItems.map(async (item) => {
          if (item.type === "video" && item.file) {
            try {
              const processResult = await processVideoFile(item.file);
              
              return {
                ...item,
                thumbnailUrl: processResult.thumbnailUrl || item.thumbnailUrl,
                width: processResult.width || item.width,
                height: processResult.height || item.height,
                duration: processResult.duration || item.duration,
                fps: processResult.fps || item.fps,
                metadata: {
                  ...item.metadata,
                  processingMethod: processResult.processingMethod,
                  ...(processResult.error && { processingError: processResult.error })
                }
              };
            } catch (error) {
              console.error(`[Media Store] ❌ Failed to process video ${item.id}:`, error);
              
              // Return item with error metadata to prevent complete failure
              return {
                ...item,
                metadata: {
                  ...item.metadata,
                  processingError: `Video processing failed: ${error instanceof Error ? error.message : String(error)}`,
                  processingMethod: 'failed'
                }
              };
            }
          }
          return item;
        })
      );

      set({ mediaItems: updatedMediaItems });
    } catch (error) {
      console.error("[Media Store] ❌ Failed to load media items:", error);
      
      // Set empty array to prevent undefined state
      set({ mediaItems: [] });
    } finally {
      set({ isLoading: false });
    }
  },

  clearProjectMedia: async (projectId) => {
    const state = get();

    // Cleanup all object URLs
    state.mediaItems.forEach((item) => {
      if (item.url) {
        URL.revokeObjectURL(item.url);
      }
      if (item.thumbnailUrl) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    });

    // Clear local state
    set({ mediaItems: [] });

    // Clear persistent storage
    try {
      const mediaIds = state.mediaItems.map((item) => item.id);
      await Promise.all(
        mediaIds.map((id) => storageService.deleteMediaItem(projectId, id))
      );
    } catch (error) {
      console.error("Failed to clear media items from storage:", error);
    }
  },

  clearAllMedia: () => {
    const state = get();

    // Cleanup all object URLs
    state.mediaItems.forEach((item) => {
      if (item.url) {
        URL.revokeObjectURL(item.url);
      }
      if (item.thumbnailUrl) {
        URL.revokeObjectURL(item.thumbnailUrl);
      }
    });

    // Clear local state
    set({ mediaItems: [] });
  },
}));
