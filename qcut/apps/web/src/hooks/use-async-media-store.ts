import { useEffect, useState } from "react";
import type { useMediaStore } from "@/stores/media-store";
import { getMediaStore } from "@/stores/media-store-loader";

export function useAsyncMediaStore() {
  const [store, setStore] = useState<ReturnType<typeof useMediaStore> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadStore() {
      try {
        const module = await getMediaStore();
        if (mounted) {
          setStore(module.useMediaStore());
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
    updateMediaItem: store?.updateMediaItem,
    clearMediaItems: store?.clearMediaItems,
    loadMediaItems: store?.loadMediaItems,
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