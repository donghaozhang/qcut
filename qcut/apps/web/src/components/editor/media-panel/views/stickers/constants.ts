// Stickers feature constants
export const STICKERS_CONSTANTS = {
  // Search
  SEARCH_DEBOUNCE_MS: 300,
  
  // Collection display
  MAX_ICONS_PER_COLLECTION: 20,
  MAX_CATEGORIES_FLATTEN: 30,
  
  // Grid layout
  GRID_COLS: {
    BASE: 6,
    SM: 8,
    MD: 10,
    LG: 12,
  },
  
  // SVG settings
  ICON_PREVIEW_SIZE: 32,
  ICON_DOWNLOAD_SIZE: 512,
  
  // Storage
  MAX_RECENT_STICKERS: 50,
} as const;

// Error messages
export const STICKERS_ERRORS = {
  NO_PROJECT: "No project selected",
  ADD_FAILED: "Failed to add sticker to project",
  SEARCH_FAILED: "Failed to search icons",
  LOAD_FAILED: "Failed to load stickers",
  COLLECTION_LOAD_FAILED: "Failed to load collection",
} as const;