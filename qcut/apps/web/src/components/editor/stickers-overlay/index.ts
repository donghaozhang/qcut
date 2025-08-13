/**
 * Stickers Overlay Module
 * 
 * Central export point for all sticker overlay components and utilities.
 * This keeps imports clean and provides a clear API surface.
 */

export { StickerCanvas, StickerOverlay } from './StickerCanvas';

// Export types if needed by other components
export type { OverlaySticker, StickerOverlayState, StickerOverlayActions } from '@/types/sticker-overlay';