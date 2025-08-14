// Define types directly to avoid static imports from media-store

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

// Export type definitions for the store functions
export type MediaStoreUtils = {
  getFileType: (file: File) => MediaType | null;
  getImageDimensions: (
    file: File
  ) => Promise<{ width: number; height: number }>;
  generateVideoThumbnail: (
    file: File,
    time?: number
  ) => Promise<{ thumbnailUrl: string; width: number; height: number }>;
  getMediaDuration: (file: File) => Promise<number>;
  getMediaAspectRatio: (item: MediaItem) => number;
};

// Export type for the store itself
export type MediaStore = {
  mediaItems: MediaItem[];
  isLoading: boolean;
  addMediaItem: (
    projectId: string,
    item: Omit<MediaItem, "id"> & { id?: string }
  ) => Promise<string>;
  addGeneratedImages: (
    items: Array<{
      id?: string;
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
  clearAllMedia: () => void;
};
