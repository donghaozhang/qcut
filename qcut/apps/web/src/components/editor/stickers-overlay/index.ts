/**
 * Stickers Overlay Module
 * 
 * Central export point for all sticker overlay components and utilities.
 * This keeps imports clean and provides a clear API surface.
 */

export { StickerCanvas, StickerOverlay } from './StickerCanvas';
export { StickerElement } from './StickerElement';
export { ResizeHandles } from './ResizeHandles';
export { StickerControls, SimpleStickerControls } from './StickerControls';
export { useStickerDrag } from './hooks/useStickerDrag';

// Export types if needed by other components
export type { OverlaySticker, StickerOverlayState, StickerOverlayActions } from '@/types/sticker-overlay';