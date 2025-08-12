import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useMediaStore } from "@/stores/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useStickersStore } from "@/stores/stickers-store";
import { downloadIconSvg, createSvgBlob } from "@/lib/iconify-api";

export function useStickerSelect() {
  const { addMediaItem } = useMediaStore();
  const { activeProject } = useProjectStore();
  const { addRecentSticker } = useStickersStore();

  // Track object URLs for cleanup
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const handleStickerSelect = useCallback(
    async (iconId: string, name: string) => {
      if (!activeProject) {
        toast.error("No project selected");
        return;
      }

      try {
        // Download the actual SVG content with transparency
        const [collection, icon] = iconId.split(":");
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

        // Create a blob URL for preview (no data URL)
        const blobUrl = URL.createObjectURL(svgBlob);
        objectUrlsRef.current.add(blobUrl);

        await addMediaItem(activeProject.id, {
          name: `${name}.svg`,
          type: "image",
          file: svgFile,
          url: blobUrl,
          thumbnailUrl: blobUrl,
          width: 512,
          height: 512,
          duration: 0,
        });

        // Add to recent stickers
        addRecentSticker(iconId, name);

        toast.success(`Added ${name} to project`);
      } catch (error) {
        toast.error("Failed to add sticker to project");
      }
    },
    [activeProject, addMediaItem, addRecentSticker]
  );

  const cleanupObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  return {
    handleStickerSelect,
    cleanupObjectUrls,
    objectUrlsRef,
  };
}
