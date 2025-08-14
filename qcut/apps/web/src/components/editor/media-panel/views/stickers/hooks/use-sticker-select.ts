import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useMediaStore } from "@/stores/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useStickersStore } from "@/stores/stickers-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { downloadIconSvg, createSvgBlob } from "@/lib/iconify-api";

export function useStickerSelect() {
  const { addMediaItem } = useMediaStore();
  const { activeProject } = useProjectStore();
  const { addRecentSticker } = useStickersStore();
  const { addOverlaySticker } = useStickersOverlayStore();

  // Track object URLs for cleanup
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const handleStickerSelect = useCallback(
    async (iconId: string, name: string): Promise<string | undefined> => {
      if (!activeProject) {
        toast.error("No project selected");
        return undefined;
      }

      try {
        // Download the actual SVG content with transparency
        const [collection, icon] = iconId.split(":");
        if (!collection || !icon) {
          toast.error("Invalid sticker ID format");
          return undefined;
        }
        const svgContent = await downloadIconSvg(collection, icon, {
          // No color specified to maintain transparency
          width: 512,
          height: 512,
        });

        // Create a Blob from the downloaded SVG content
        const svgBlob = createSvgBlob(svgContent);
        const svgFile = new File([svgBlob], `${name}.svg`, {
          type: "image/svg+xml;charset=utf-8",
        });

        // For Electron (file:// protocol), use data URL instead of blob URL
        let imageUrl: string;
        if (window.location.protocol === "file:") {
          // Convert to data URL for Electron compatibility
          imageUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === "string") {
                resolve(reader.result);
              } else {
                reject(new Error("Failed to read file as data URL"));
              }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(svgFile);
          });
        } else {
          // Use blob URL for web environment
          imageUrl = URL.createObjectURL(svgBlob);
          objectUrlsRef.current.add(imageUrl);
        }

        const mediaItemId = await addMediaItem(activeProject.id, {
          name: `${name}.svg`,
          type: "image",
          file: svgFile,
          url: imageUrl,
          thumbnailUrl: imageUrl,
          width: 512,
          height: 512,
          duration: 0,
        });

        // Add to recent stickers
        addRecentSticker(iconId, name);

        toast.success(`Added ${name} to media library`);

        // Return the media item ID for potential overlay use
        return mediaItemId;
      } catch (error) {
        toast.error("Failed to add sticker to project");
        return undefined;
      }
    },
    [activeProject, addMediaItem, addRecentSticker]
  );

  // New function to add sticker directly to overlay
  const handleStickerSelectToOverlay = useCallback(
    async (iconId: string, name: string) => {
      // First add to media, then to overlay
      const mediaItemId = await handleStickerSelect(iconId, name);
      if (mediaItemId) {
        addOverlaySticker(mediaItemId);
      }
    },
    [handleStickerSelect, addOverlaySticker]
  );

  const cleanupObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  return {
    handleStickerSelect,
    handleStickerSelectToOverlay,
    cleanupObjectUrls,
    objectUrlsRef,
  };
}
