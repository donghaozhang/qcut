/**
 * AI View Constants
 * 
 * Extracted from ai.tsx as part of safe refactoring process.
 * This file contains all constants and configuration used by the AI video generation feature.
 * 
 * @see ai-view-refactoring-guide.md for refactoring plan
 * @see ai-refactoring-subtasks.md for implementation tracking
 */

import type { AIModel, APIConfiguration } from "./ai-types";

// FAL API Configuration
export const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;
export const FAL_API_BASE = "https://fal.run";

// API Configuration
export const API_CONFIG: APIConfiguration = {
  falApiKey: FAL_API_KEY,
  falApiBase: FAL_API_BASE,
  maxRetries: 3,
  timeoutMs: 30000, // 30 seconds
};

// AI Models Configuration (Extracted from original source)
export const AI_MODELS: AIModel[] = [
  {
    id: "kling_v2",
    name: "Kling v2.1",
    description: "Premium model with unparalleled motion fluidity",
    price: "0.15",
    resolution: "1080p",
  },
  {
    id: "seedance",
    name: "Seedance v1 Lite",
    description: "Fast and efficient text-to-video generation",
    price: "0.18",
    resolution: "720p",
  },
  {
    id: "hailuo",
    name: "Hailuo 02",
    description: "Standard quality with realistic physics",
    price: "0.27",
    resolution: "768p",
  },
  {
    id: "hailuo_pro",
    name: "Hailuo 02 Pro",
    description: "Premium 1080p with ultra-realistic physics",
    price: "0.48",
    resolution: "1080p",
  },
  {
    id: "seedance_pro",
    name: "Seedance v1 Pro",
    description: "High quality 1080p video generation",
    price: "0.62",
    resolution: "1080p",
  },
  {
    id: "veo3_fast",
    name: "Veo3 Fast",
    description: "High quality, faster generation",
    price: "2.00",
    resolution: "1080p",
  },
  {
    id: "veo3",
    name: "Veo3",
    description: "Highest quality, slower generation",
    price: "3.00",
    resolution: "1080p",
  },
  {
    id: "wan_turbo",
    name: "WAN v2.2 Turbo",
    description: "High-speed photorealistic video generation",
    price: "0.10",
    resolution: "720p",
  },
];

// UI Constants
export const UI_CONSTANTS = {
  MAX_PROMPT_CHARS: 500,
  MAX_IMAGE_SIZE_MB: 10,
  MAX_HISTORY_ITEMS: 10,
  POLLING_INTERVAL_MS: 2000,
  GENERATION_TIMEOUT_MS: 300000, // 5 minutes
} as const;

// File Upload Constants
export const UPLOAD_CONSTANTS = {
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  SUPPORTED_FORMATS: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
} as const;

// Progress Constants
export const PROGRESS_CONSTANTS = {
  INITIAL_PROGRESS: 0,
  POLLING_START_PROGRESS: 10,
  DOWNLOAD_START_PROGRESS: 90,
  COMPLETE_PROGRESS: 100,
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  GENERATION_HISTORY: "ai-generation-history",
  USER_PREFERENCES: "ai-user-preferences",
  LAST_USED_MODELS: "ai-last-used-models",
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  INVALID_FILE_TYPE: "Please select a valid image file",
  FILE_TOO_LARGE: "Image file too large (max 10MB)",
  NO_MODELS_SELECTED: "Please select at least one AI model",
  EMPTY_PROMPT: "Please enter a prompt for video generation",
  GENERATION_FAILED: "Video generation failed. Please try again.",
  DOWNLOAD_FAILED: "Failed to download video. Please try again.",
  HISTORY_SAVE_FAILED: "Failed to save generation history",
  HISTORY_LOAD_FAILED: "Failed to load generation history",
} as const;

// Status Messages
export const STATUS_MESSAGES = {
  STARTING: "Starting generation...",
  PROCESSING: "Processing video...",
  DOWNLOADING: "Downloading video...",
  COMPLETE: "Generation complete!",
  CANCELLED: "Generation cancelled",
  FAILED: "Generation failed",
} as const;

// Default Values
export const DEFAULTS = {
  PROMPT: "",
  SELECTED_MODELS: [] as string[],
  ACTIVE_TAB: "text" as const,
  GENERATION_PROGRESS: 0,
  STATUS_MESSAGE: "",
  ELAPSED_TIME: 0,
  CURRENT_MODEL_INDEX: 0,
  PROGRESS_LOGS: [] as string[],
} as const;

// Model Helper Functions
export const MODEL_HELPERS = {
  /**
   * Get model by ID
   */
  getModelById: (id: string): AIModel | undefined => {
    return AI_MODELS.find(model => model.id === id);
  },

  /**
   * Get models by resolution
   */
  getModelsByResolution: (resolution: string): AIModel[] => {
    return AI_MODELS.filter(model => model.resolution === resolution);
  },

  /**
   * Get models by price range
   */
  getModelsByPriceRange: (min: number, max: number): AIModel[] => {
    return AI_MODELS.filter(model => {
      const price = parseFloat(model.price);
      return price >= min && price <= max;
    });
  },

  /**
   * Sort models by price (ascending)
   */
  sortModelsByPrice: (): AIModel[] => {
    return [...AI_MODELS].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
  },

  /**
   * Get model display name with price
   */
  getModelDisplayName: (model: AIModel): string => {
    return `${model.name} ($${model.price})`;
  },
} as const;

// Export individual constants for convenience
export {
  AI_MODELS as MODELS,
  UI_CONSTANTS as UI,
  UPLOAD_CONSTANTS as UPLOAD,
  PROGRESS_CONSTANTS as PROGRESS,
  STORAGE_KEYS as STORAGE,
  ERROR_MESSAGES as ERRORS,
  STATUS_MESSAGES as STATUS,
};

// Export default configuration object
export const AI_CONFIG = {
  api: API_CONFIG,
  ui: UI_CONSTANTS,
  upload: UPLOAD_CONSTANTS,
  progress: PROGRESS_CONSTANTS,
  storage: STORAGE_KEYS,
  errors: ERROR_MESSAGES,
  status: STATUS_MESSAGES,
  defaults: DEFAULTS,
  models: AI_MODELS,
  helpers: MODEL_HELPERS,
} as const;

export default AI_CONFIG;