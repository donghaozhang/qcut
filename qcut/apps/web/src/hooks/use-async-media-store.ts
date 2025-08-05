import { useEffect, useState } from "react";
import { getMediaStore } from "@/stores/media-store-loader";
import type { MediaStore } from "@/stores/media-store-types";

interface AsyncMediaStoreState {
  store: MediaStore | null;
  loading: boolean;
  error: Error | null;
}

/**
 * NOTE:
 * We **must never** call a React hook conditionally or after an early return.
 * The previous implementation violated the Rules-of-Hooks because it invoked
 * `module.useMediaStore()` only *after* the dynamic module finished loading.
 * On the **first** render nothing was called, on the **second** render a new
 * hook appeared in the call-stack. React quite rightly threw the “change in
 * the order of Hooks” warning and crashed with a `TypeError`.
 *
 * To fix this we **never** call the zustand React hook.  Instead we rely on
 * the store's *API object* which is safe to use outside React.  `useMediaStore`
 * is created with `zustand`, therefore it exposes:
 *   - `useMediaStore.getState()`   → read current state / actions
 *   - `useMediaStore.subscribe()`  → subscribe to changes (not required here)
 */
export function useAsyncMediaStore(): AsyncMediaStoreState {
  const [state, setState] = useState<AsyncMediaStoreState>({
    store: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const module = await getMediaStore();
        if (!mounted) return;

        // We grab the zustand store *object* (not the React hook) via getState.
        const storeAPI = module.useMediaStore.getState();
        setState({
          store: storeAPI as unknown as MediaStore,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (!mounted) return;
        setState({
          store: null,
          loading: false,
          error:
            err instanceof Error
              ? err
              : new Error("Failed to load media store"),
        });
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}

// Hook for components that only need specific store actions
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

// Hook for components that only need the list of media items
export function useAsyncMediaItems() {
  const { store, loading, error } = useAsyncMediaStore();

  return {
    mediaItems: store?.mediaItems ?? [],
    loading,
    error,
  };
}
