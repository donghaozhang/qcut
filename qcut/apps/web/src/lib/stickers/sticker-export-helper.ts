/**
 * Sticker Export Helper
 *
 * Utilities for rendering overlay stickers to canvas during video export.
 * Integrates with the export engine to composite stickers on top of video frames.
 */

import type { OverlaySticker } from "@/types/sticker-overlay";
import type { MediaItem } from "@/stores/media-store-types";
import { debugLog, debugError } from "@/lib/debug-config";

/**
 * Interface for sticker render options
 */
export interface StickerRenderOptions {
  canvasWidth: number;
  canvasHeight: number;
  currentTime?: number;
  opacity?: number;
}

/**
 * Helper class for rendering stickers during export
 */
export class StickerExportHelper {
  private imageCache = new Map<string, HTMLImageElement>();

  /**
   * Render stickers to canvas at specified time
   */
  async renderStickersToCanvas(
    ctx: CanvasRenderingContext2D,
    stickers: OverlaySticker[],
    mediaItems: Map<string, MediaItem>,
    options: StickerRenderOptions
  ): Promise<void> {
    const { canvasWidth, canvasHeight, currentTime = 0 } = options;

    // Filter stickers visible at current time
    const visibleStickers = stickers.filter((sticker) => {
      if (!sticker.timing) return true;
      const { startTime = 0, endTime = Infinity } = sticker.timing;
      return currentTime >= startTime && currentTime <= endTime;
    });

    // Sort by z-index to render in correct order
    const sortedStickers = visibleStickers.sort((a, b) => a.zIndex - b.zIndex);

    // Render each sticker
    for (const sticker of sortedStickers) {
      const mediaItem = mediaItems.get(sticker.mediaItemId);
      if (!mediaItem) {
        debugLog(
          `[StickerExport] Media item not found for sticker: ${sticker.id}`
        );
        continue;
      }

      try {
        await this.renderSticker(
          ctx,
          sticker,
          mediaItem,
          canvasWidth,
          canvasHeight
        );
      } catch (error) {
        debugError(
          `[StickerExport] Failed to render sticker ${sticker.id}:`,
          error
        );
      }
    }
  }

  /**
   * Render individual sticker to canvas
   */
  private async renderSticker(
    ctx: CanvasRenderingContext2D,
    sticker: OverlaySticker,
    mediaItem: MediaItem,
    canvasWidth: number,
    canvasHeight: number
  ): Promise<void> {
    // Skip if no URL
    if (!mediaItem.url) {
      debugLog(`[StickerExport] No URL for media item: ${mediaItem.id}`);
      return;
    }

    // Load image from cache or create new
    const img = await this.loadImage(mediaItem.url);

    // Calculate pixel position from percentage
    const x = (sticker.position.x / 100) * canvasWidth;
    const y = (sticker.position.y / 100) * canvasHeight;
    const width = (sticker.size.width / 100) * canvasWidth;
    const height = (sticker.size.height / 100) * canvasHeight;

    // Save context state
    ctx.save();

    // Apply transformations
    ctx.globalAlpha = sticker.opacity;

    // Translate to center of sticker for rotation
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    ctx.translate(centerX, centerY);

    // Apply rotation
    if (sticker.rotation !== 0) {
      ctx.rotate((sticker.rotation * Math.PI) / 180);
    }

    // Draw image centered at origin
    ctx.drawImage(img, -width / 2, -height / 2, width, height);

    // Restore context state
    ctx.restore();
  }

  /**
   * Load and cache image
   */
  private async loadImage(url: string): Promise<HTMLImageElement> {
    // Check cache first
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url)!;
    }

    // Load new image
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        this.imageCache.set(url, img);
        resolve(img);
      };

      img.onerror = (error) => {
        debugError(`[StickerExport] Failed to load image: ${url}`, error);
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.src = url;
    });
  }

  /**
   * Clear image cache to free memory
   */
  clearCache(): void {
    this.imageCache.clear();
  }

  /**
   * Pre-load sticker images for better performance
   */
  async preloadStickers(
    stickers: OverlaySticker[],
    mediaItems: Map<string, MediaItem>
  ): Promise<void> {
    const uniqueUrls = new Set<string>();

    for (const sticker of stickers) {
      const mediaItem = mediaItems.get(sticker.mediaItemId);
      if (mediaItem?.url) {
        uniqueUrls.add(mediaItem.url);
      }
    }

    // Load all images in parallel
    const loadPromises = Array.from(uniqueUrls).map((url) =>
      this.loadImage(url).catch((error) => {
        debugError(`[StickerExport] Failed to preload: ${url}`, error);
      })
    );

    await Promise.all(loadPromises);
    debugLog(`[StickerExport] Preloaded ${uniqueUrls.size} sticker images`);
  }
}

/**
 * Singleton instance for easy access
 */
let stickerExportHelper: StickerExportHelper | null = null;

/**
 * Get or create sticker export helper instance
 */
export function getStickerExportHelper(): StickerExportHelper {
  if (!stickerExportHelper) {
    stickerExportHelper = new StickerExportHelper();
  }
  return stickerExportHelper;
}

/**
 * Convenience function to render stickers to canvas
 */
export async function renderStickersToCanvas(
  ctx: CanvasRenderingContext2D,
  stickers: OverlaySticker[],
  mediaItems: Map<string, MediaItem>,
  options: StickerRenderOptions
): Promise<void> {
  const helper = getStickerExportHelper();
  await helper.renderStickersToCanvas(ctx, stickers, mediaItems, options);
}
