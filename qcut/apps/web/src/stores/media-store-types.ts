// Re-export types from media-store without importing the actual implementation
// This allows other modules to use the types without triggering the static import

export type {
  MediaType,
  MediaItem,
} from "./media-store";

// Export type definitions for the store functions
export type MediaStoreUtils = {
  getFileType: (file: File) => MediaType | null;
  getImageDimensions: (file: File) => Promise<{ width: number; height: number }>;
  generateVideoThumbnail: (file: File, time?: number) => Promise<string>;
  getMediaDuration: (file: File) => Promise<number>;
  getMediaAspectRatio: (item: MediaItem) => number;
};

// Export type for the store itself
export type MediaStore = {
  mediaItems: MediaItem[];
  isLoading: boolean;
  addMediaItem: (projectId: string, item: Omit<MediaItem, "id">) => Promise<void>;
  addGeneratedImages: (items: Array<{
    url: string;
    type: MediaType;
    name: string;
    size: number;
    duration: number;
    metadata?: {
      source?: string;
      [key: string]: any;
    };
  }>) => Promise<void>;
  removeMediaItem: (projectId: string, itemId: string) => Promise<void>;
  updateMediaItem: (projectId: string, itemId: string, updates: Partial<MediaItem>) => Promise<void>;
  clearMediaItems: (projectId: string) => Promise<void>;
  loadMediaItems: (projectId: string) => Promise<void>;
};