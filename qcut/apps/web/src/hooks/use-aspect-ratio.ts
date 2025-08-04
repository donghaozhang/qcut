import { useEditorStore } from "@/stores/editor-store";
import { useAsyncMediaItems } from "@/hooks/use-async-media-store";
import { getMediaStoreUtils, type MediaItem } from "@/stores/media-store-loader";
import { useTimelineStore } from "@/stores/timeline-store";
import { useMemo, useState, useEffect } from "react";

export function useAspectRatio() {
  const { canvasSize, canvasMode, canvasPresets } = useEditorStore();
  const { mediaItems, loading: mediaItemsLoading, error: mediaItemsError } = useAsyncMediaItems();
  const { tracks } = useTimelineStore();
  const [mediaUtils, setMediaUtils] = useState<{ getMediaAspectRatio: (item: MediaItem) => number } | null>(null);

  // Load media utilities
  useEffect(() => {
    getMediaStoreUtils().then(utils => {
      setMediaUtils({ getMediaAspectRatio: utils.getMediaAspectRatio });
    }).catch(console.error);
  }, []);

  // Find the current preset based on canvas size
  const currentPreset = canvasPresets.find(
    (preset) =>
      preset.width === canvasSize.width && preset.height === canvasSize.height
  );

  // Get the original aspect ratio from the first video/image in timeline
  const getOriginalAspectRatio = (): number => {
    // If media items are loading or utils not ready, return default
    if (mediaItemsLoading || !mediaUtils) {
      return 16 / 9;
    }

    // Find first video or image in timeline
    for (const track of tracks) {
      for (const element of track.elements) {
        if (element.type === "media") {
          const mediaItem = mediaItems.find(
            (item) => item.id === element.mediaId
          );
          if (
            mediaItem &&
            (mediaItem.type === "video" || mediaItem.type === "image")
          ) {
            return mediaUtils.getMediaAspectRatio(mediaItem);
          }
        }
      }
    }
    return 16 / 9; // Default aspect ratio
  };

  // Get current aspect ratio
  const getCurrentAspectRatio = (): number => {
    return canvasSize.width / canvasSize.height;
  };

  // Format aspect ratio as a readable string
  const formatAspectRatio = (aspectRatio: number): string => {
    // Check if it matches a common aspect ratio
    const ratios = [
      { ratio: 16 / 9, label: "16:9" },
      { ratio: 9 / 16, label: "9:16" },
      { ratio: 1, label: "1:1" },
      { ratio: 4 / 3, label: "4:3" },
      { ratio: 3 / 4, label: "3:4" },
      { ratio: 21 / 9, label: "21:9" },
    ];

    for (const { ratio, label } of ratios) {
      if (Math.abs(aspectRatio - ratio) < 0.01) {
        return label;
      }
    }

    // If not a common ratio, format as decimal
    return aspectRatio.toFixed(2);
  };

  // Check if current mode is "Original"
  const isOriginal = canvasMode === "original";

  // Get display name for current aspect ratio
  const getDisplayName = (): string => {
    // If explicitly set to original mode, always show "Original"
    if (canvasMode === "original") {
      return "Original";
    }

    if (currentPreset) {
      return currentPreset.name;
    }

    return formatAspectRatio(getCurrentAspectRatio());
  };

  return {
    currentPreset,
    canvasMode,
    isOriginal,
    getCurrentAspectRatio,
    getOriginalAspectRatio,
    formatAspectRatio,
    getDisplayName,
    canvasSize,
    canvasPresets,
    // Loading states
    loading: mediaItemsLoading || !mediaUtils,
    error: mediaItemsError,
  };
}
