import type {
  MediaType,
  MediaItem,
  MediaStoreUtils,
} from "./media-store-types";

let mediaStoreModule: typeof import("./media-store") | undefined;

export async function getMediaStore() {
  if (!mediaStoreModule) {
    mediaStoreModule = await import("./media-store");
  }
  return mediaStoreModule;
}

// Re-export utility functions that are used by timeline-store
export async function getMediaStoreUtils(): Promise<MediaStoreUtils> {
  const module = await getMediaStore();
  return {
    getFileType: module.getFileType,
    getImageDimensions: module.getImageDimensions,
    generateVideoThumbnail: module.generateVideoThumbnail,
    getMediaDuration: module.getMediaDuration,
    getMediaAspectRatio: module.getMediaAspectRatio,
  };
}

// Re-export types (these don't cause static imports)
export type {
  MediaType,
  MediaItem,
  MediaStore,
  MediaStoreUtils,
} from "./media-store-types";
