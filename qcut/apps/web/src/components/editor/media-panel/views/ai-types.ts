/**
 * AI View Types and Interfaces
 *
 * Extracted from ai.tsx as part of safe refactoring process.
 * This file contains all TypeScript interfaces and types used by the AI video generation feature.
 *
 * @see ai-view-refactoring-guide.md for refactoring plan
 * @see ai-refactoring-subtasks.md for implementation tracking
 */

import { AIVideoOutputManager } from "@/lib/ai-video-output";
import type { TProject } from "@/types/project";

// Core AI Model Interface
export interface AIModel {
  id: string;
  name: string;
  description: string;
  price: string;
  resolution: string;
}

// Generated Video Interfaces
export interface GeneratedVideo {
  jobId: string;
  videoUrl: string;
  videoPath?: string;
  fileSize?: number;
  duration?: number;
  prompt: string;
  model: string;
}

export interface GeneratedVideoResult {
  modelId: string;
  video: GeneratedVideo;
}

// ⚠️ CRITICAL ADDITION: Polling state interface (identified in validation)
export interface PollingState {
  interval: NodeJS.Timeout | null;
  jobId: string | null;
  isPolling: boolean;
}

// ⚠️ CRITICAL ADDITION: Service manager interface (identified in validation)
export interface AIServiceManager {
  outputManager: AIVideoOutputManager;
  cleanup: () => void;
}

// Hook Interface Definitions (Enhanced based on validation findings)

// ⚠️ ENHANCED: Include ALL state variables identified in source validation
export interface UseAIGenerationProps {
  prompt: string;
  selectedModels: string[];
  selectedImage: File | null;
  activeTab: "text" | "image";
  activeProject: TProject | null;
  onProgress: (progress: number, message: string) => void;
  onError: (error: string) => void;
  onComplete: (videos: GeneratedVideoResult[]) => void;
  // ⚠️ CRITICAL ADDITIONS: Include missing dependencies from validation
  onJobIdChange?: (jobId: string | null) => void;
  onGeneratedVideoChange?: (video: GeneratedVideo | null) => void;
}

// ⚠️ ENHANCED: Complete generation state interface
export interface AIGenerationState {
  // Core generation state
  isGenerating: boolean;
  generationProgress: number;
  statusMessage: string;
  elapsedTime: number;
  estimatedTime?: number;
  currentModelIndex: number;
  progressLogs: string[];
  generationStartTime: number | null;

  // ⚠️ CRITICAL ADDITIONS: Missing state variables from validation
  jobId: string | null;
  generatedVideo: GeneratedVideo | null;
  generatedVideos: GeneratedVideoResult[];

  // ⚠️ CRITICAL: Polling state management
  pollingInterval: NodeJS.Timeout | null;
}

export type UseAIHistoryProps = Record<string, never>;

export interface AIHistoryState {
  generationHistory: GeneratedVideo[];
  isHistoryPanelOpen: boolean;
}

// UI State Types
export type AIActiveTab = "text" | "image";

// Progress callback type from original source
export type ProgressCallback = (progress: number, message: string) => void;

// Image handling types
export interface ImageUploadState {
  selectedImage: File | null;
  imagePreview: string | null;
  isValidImage: boolean;
  uploadError?: string;
}

// Generation status types (from API client)
export interface GenerationStatus {
  progress?: number;
  status?: string;
  completed?: boolean;
  error?: string;
  videoUrl?: string;
}

// API Configuration types
export interface APIConfiguration {
  falApiKey?: string;
  falApiBase: string;
  maxRetries: number;
  timeoutMs: number;
}

// Error types
export type AIError = string | null;

// Export all as named exports for easy importing
export type {
  // Re-export main interfaces for convenience
  AIModel as Model,
  GeneratedVideo as Video,
  GeneratedVideoResult as VideoResult,
  PollingState as Polling,
  AIServiceManager as ServiceManager,
  AIGenerationState as GenerationState,
  AIHistoryState as HistoryState,
};
