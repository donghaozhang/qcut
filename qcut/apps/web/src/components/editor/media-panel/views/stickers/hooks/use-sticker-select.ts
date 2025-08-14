import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useMediaStore } from "@/stores/media-store";
import { useProjectStore } from "@/stores/project-store";
import { useStickersStore } from "@/stores/stickers-store";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { downloadIconSvg, createSvgBlob } from "@/lib/iconify-api";

export function useStickerSelect() {
  const addMediaItem = useMediaStore((s) => s.addMediaItem);
  const activeProject = useProjectStore((s) => s.activeProject);
  const addRecentSticker = useStickersStore((s) => s.addRecentSticker);
  const addOverlaySticker = useStickersOverlayStore((s) => s.addOverlaySticker);

  // Track object URLs for cleanup
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const handleStickerSelect = useCallback(
    async (iconId: string, name: string): Promise<string | undefined> => {
      console.log('[STICKER DEBUG] handleStickerSelect called:', iconId, name);
      console.log('[STICKER DEBUG] Active project:', activeProject?.id);
      
      if (!activeProject) {
        console.log('[STICKER DEBUG] handleStickerSelect failed - no active project');
        toast.error("No project selected");
        return;
      }

      let createdObjectUrl: string | null = null;
      try {
        // Download the actual SVG content with transparency
        const [collection, icon] = iconId.split(":");
        console.log('[STICKER DEBUG] Parsed iconId - collection:', collection, 'icon:', icon);
        
        if (!collection || !icon) {
          console.log('[STICKER DEBUG] handleStickerSelect failed - invalid iconId format');
          toast.error("Invalid sticker ID format");
          return;
        }
        console.log('[STICKER DEBUG] Downloading SVG content...');
        const svgContent = await downloadIconSvg(collection, icon, {
          // No color specified to maintain transparency
          width: 512,
          height: 512,
        });

        console.log('[STICKER DEBUG] SVG content downloaded, length:', svgContent.length);

        // Create a Blob from the downloaded SVG content
        const svgBlob = createSvgBlob(svgContent);
        const svgFile = new File([svgBlob], `${name}.svg`, {
          type: "image/svg+xml;charset=utf-8",
        });

        console.log('[STICKER DEBUG] Created SVG file:', svgFile.name, 'size:', svgFile.size);

        // For Electron (file:// protocol), use data URL instead of blob URL
        let imageUrl: string;
        console.log('[STICKER DEBUG] Current protocol:', window.location.protocol);
        
        if (window.location.protocol === "file:") {
          console.log('[STICKER DEBUG] Using data URL for Electron...');
          // Create proper data URL with correct MIME type for SVG
          const base64Data = btoa(svgContent);
          imageUrl = `data:image/svg+xml;base64,${base64Data}`;
          console.log('[STICKER DEBUG] Data URL created with correct MIME type:', imageUrl.substring(0, 100) + '...');
        } else {
          console.log('[STICKER DEBUG] Using blob URL for web...');
          // Use blob URL for web environment
          createdObjectUrl = URL.createObjectURL(svgBlob);
          imageUrl = createdObjectUrl;
          objectUrlsRef.current.add(imageUrl);
          console.log('[STICKER DEBUG] Blob URL created:', imageUrl);
        }

        console.log('[STICKER DEBUG] Adding media item to store...');
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

        console.log('[STICKER DEBUG] Created media item ID:', mediaItemId);

        // Add to recent stickers
        console.log('[STICKER DEBUG] Adding to recent stickers...');
        addRecentSticker(iconId, name);

        toast.success(`Added ${name} to media library`);

        console.log('[STICKER DEBUG] handleStickerSelect completed successfully');
        // Return the media item ID for potential overlay use
        return mediaItemId;
      } catch (error) {
        console.log('[STICKER DEBUG] handleStickerSelect failed with error:', error);
        if (createdObjectUrl) {
          URL.revokeObjectURL(createdObjectUrl);
          objectUrlsRef.current.delete(createdObjectUrl);
        }
        toast.error("Failed to add sticker to project");
        return;
      }
    },
    [activeProject, addMediaItem, addRecentSticker]
  );

  // New function to add sticker directly to overlay
  const handleStickerSelectToOverlay = useCallback(
    async (iconId: string, name: string) => {
      console.log('[STICKER DEBUG] handleStickerSelectToOverlay called:', iconId, name);
      // First add to media, then to overlay
      const mediaItemId = await handleStickerSelect(iconId, name);
      if (mediaItemId) {
        console.log('[STICKER DEBUG] Adding sticker to overlay with mediaItemId:', mediaItemId);
        addOverlaySticker(mediaItemId);
        console.log('[STICKER DEBUG] handleStickerSelectToOverlay completed');
      } else {
        console.log('[STICKER DEBUG] handleStickerSelectToOverlay failed - no mediaItemId returned');
      }
    },
    [handleStickerSelect, addOverlaySticker]
  );

  const cleanupObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current.clear();
  }, []);

  return {
    handleStickerSelect,
    handleStickerSelectToOverlay,
    cleanupObjectUrls,
    objectUrlsRef,
  };
}
