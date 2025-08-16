import type {
  MediaType,
  MediaItem,
  MediaStoreUtils,
} from "./media-store-types";
import { getMediaStore as getMediaStoreLazy } from "@/utils/lazy-stores";

let mediaStoreModule: typeof import("./media-store") | undefined;

export async function getMediaStore() {
  if (!mediaStoreModule) {
    // Use lazy import wrapper to avoid static/dynamic import conflicts
    const useMediaStore = await getMediaStoreLazy();
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
    generateVideoThumbnail: module.generateVideoThumbnailBrowser,
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
