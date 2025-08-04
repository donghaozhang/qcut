import { useEffect, useState } from "react";
import { getMediaStore } from "@/stores/media-store-loader";
import type { MediaStore } from "@/stores/media-store-types";

export function useAsyncMediaStore() {
  const [storeHook, setStoreHook] = useState<(() => MediaStore) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadStore() {
      try {
        const module = await getMediaStore();
        if (mounted) {
          setStoreHook(() => module.useMediaStore);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to load media store'));
          setLoading(false);
        }
      }
    }

    loadStore();

    return () => {
      mounted = false;
    };
  }, []);

  // Now we can safely call the hook inside this React component
  const store = storeHook ? storeHook() : null;

  return { store, loading, error };
}

// Hook for components that only need specific methods
export function useAsyncMediaStoreActions() {
  const { store, loading, error } = useAsyncMediaStore();

  return {
    loading,
    error,
    addMediaItem: store?.addMediaItem,
    addGeneratedImages: store?.addGeneratedImages,
    removeMediaItem: store?.removeMediaItem,
    clearProjectMedia: store?.clearProjectMedia,
    loadProjectMedia: store?.loadProjectMedia,
    clearAllMedia: store?.clearAllMedia,
  };
}

// Hook for components that only need media items
export function useAsyncMediaItems() {
  const { store, loading, error } = useAsyncMediaStore();

  return {
    mediaItems: store?.mediaItems || [],
    loading,
    error,
  };
}