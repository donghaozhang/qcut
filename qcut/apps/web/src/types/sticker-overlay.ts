/**
 * Sticker Overlay Types
 *
 * These types define the structure for overlay stickers that appear
 * on top of the video preview. Overlay stickers are separate from
 * timeline elements to maintain simplicity and avoid timeline complexity.
 */

/**
 * Represents a single sticker in the overlay system
 * Position and size are stored as percentages for responsive scaling
 */
export interface OverlaySticker {
  /** Unique identifier for the overlay sticker instance */
  id: string;

  /** Reference to the media item in the media store */
  mediaItemId: string;

  /** Position relative to canvas (0-100%) */
  position: {
    x: number; // Percentage from left (0-100)
    y: number; // Percentage from top (0-100)
  };

  /** Size relative to canvas (0-100%) */
  size: {
    width: number; // Percentage of canvas width
    height: number; // Percentage of canvas height
  };

  /** Rotation in degrees (0-360) */
  rotation: number;

  /** Opacity level (0-1) where 0 is transparent and 1 is opaque */
  opacity: number;

  /** Layer order - higher values appear on top */
  zIndex: number;

  /** Whether the sticker maintains aspect ratio when resizing */
  maintainAspectRatio: boolean;

  /** Optional timing for animated stickers or timed appearances */
  timing?: {
    startTime?: number; // In seconds
    endTime?: number; // In seconds
    duration?: number; // For animated stickers
  };

  /** Metadata for tracking and debugging */
  metadata?: {
    addedAt: number; // Timestamp when added
    lastModified: number; // Timestamp of last change
    source?: "library" | "upload" | "media"; // Where it came from
  };
}

/**
 * State interface for the overlay store
 */
export interface StickerOverlayState {
  /** Map of all overlay stickers by ID for efficient lookups */
  overlayStickers: Map<string, OverlaySticker>;

  /** Currently selected sticker ID for editing */
  selectedStickerId: string | null;

  /** UI state flags */
  isDragging: boolean;
  isResizing: boolean;
  isRotating: boolean;

  /** History for undo/redo functionality */
  history: {
    past: OverlaySticker[][];
    future: OverlaySticker[][];
  };
}

/**
 * Actions interface for the overlay store
 */
export interface StickerOverlayActions {
  // CRUD Operations
  addOverlaySticker: (
    mediaItemId: string,
    options?: Partial<OverlaySticker>
  ) => string;
  removeOverlaySticker: (id: string) => void;
  updateOverlaySticker: (id: string, updates: Partial<OverlaySticker>) => void;
  clearAllStickers: () => void;

  // Selection
  selectSticker: (id: string | null) => void;

  // Layering
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;

  // UI State
  setIsDragging: (isDragging: boolean) => void;
  setIsResizing: (isResizing: boolean) => void;
  setIsRotating: (isRotating: boolean) => void;

  // History
  undo: () => void;
  redo: () => void;

  // Persistence
  saveToProject: (projectId: string) => Promise<void>;
  loadFromProject: (projectId: string) => Promise<void>;
  cleanupInvalidStickers: (availableMediaIds: string[]) => void;

  // Export
  getStickersForExport: () => OverlaySticker[];
  getVisibleStickersAtTime: (time: number) => OverlaySticker[];
}

/**
 * Combined type for the complete store
 */
export type StickerOverlayStore = StickerOverlayState & StickerOverlayActions;

/**
 * Helper type for sticker updates with validation
 */
export type ValidatedStickerUpdate = Partial<
  Omit<OverlaySticker, "id" | "mediaItemId">
>;

/**
 * Constants for overlay stickers
 */
export const STICKER_DEFAULTS = {
  position: { x: 50, y: 50 },
  size: { width: 20, height: 20 },
  rotation: 0,
  opacity: 1,
  maintainAspectRatio: true,
  minSize: { width: 5, height: 5 },
  maxSize: { width: 100, height: 100 },
} as const;

/**
 * Z-index management constants
 */
export const Z_INDEX = {
  MIN: 1,
  MAX: 9999,
  INCREMENT: 10,
} as const;
