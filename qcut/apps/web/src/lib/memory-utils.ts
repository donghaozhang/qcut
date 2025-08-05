import { ExportSettings } from "@/types/export";

// Memory calculation constants
const BYTES_PER_PIXEL = 4; // RGBA = 4 bytes per pixel
const MB = 1024 * 1024;
const GB = 1024 * MB;

// Memory warning thresholds
export const MEMORY_THRESHOLDS = {
  WARNING: 2 * GB, // 2GB - show warning
  CRITICAL: 4 * GB, // 4GB - suggest lower quality
  MAXIMUM: 8 * GB, // 8GB - block export
} as const;

// Quality recommendations for memory optimization
export const QUALITY_MEMORY_SAVINGS = {
  "1080p": { reduction: 0, description: "High quality" },
  "720p": { reduction: 0.56, description: "Medium quality - 56% less memory" },
  "480p": { reduction: 0.75, description: "Low quality - 75% less memory" },
} as const;

export interface MemoryEstimate {
  totalMemoryMB: number;
  totalMemoryGB: number;
  warningLevel: "none" | "warning" | "critical" | "maximum";
  canExport: boolean;
  recommendation?: {
    suggestedQuality: string;
    memoryReduction: number;
    description: string;
  };
}

/**
 * Calculate estimated memory usage for video export
 */
export function calculateMemoryUsage(
  settings: ExportSettings,
  duration: number,
  fps = 30
): MemoryEstimate {
  // Calculate frame dimensions
  const { width, height } = settings;
  const pixelsPerFrame = width * height;

  // Calculate total frames
  const totalFrames = Math.ceil(duration * fps);

  // Estimate memory usage
  // Each frame needs to be stored in memory during processing
  // We estimate 2x frame buffer (current + next frame) plus canvas overhead
  const frameMemory = pixelsPerFrame * BYTES_PER_PIXEL;
  const bufferMultiplier = 2.5; // Buffer overhead + canvas operations
  const totalMemoryBytes = frameMemory * bufferMultiplier;

  // Add MediaRecorder chunk storage (estimate 20% of video size)
  const videoSizeEstimate = totalFrames * (frameMemory * 0.1); // Compressed estimate
  const mediaRecorderMemory = videoSizeEstimate * 0.2;

  const finalMemoryBytes = totalMemoryBytes + mediaRecorderMemory;
  const totalMemoryMB = finalMemoryBytes / MB;
  const totalMemoryGB = finalMemoryBytes / GB;

  // Determine warning level
  let warningLevel: MemoryEstimate["warningLevel"] = "none";
  let canExport = true;
  let recommendation: MemoryEstimate["recommendation"] | undefined;

  if (finalMemoryBytes >= MEMORY_THRESHOLDS.MAXIMUM) {
    warningLevel = "maximum";
    canExport = false;
    recommendation = getBestQualityRecommendation(settings.quality);
  } else if (finalMemoryBytes >= MEMORY_THRESHOLDS.CRITICAL) {
    warningLevel = "critical";
    recommendation = getBestQualityRecommendation(settings.quality);
  } else if (finalMemoryBytes >= MEMORY_THRESHOLDS.WARNING) {
    warningLevel = "warning";
    recommendation = getBestQualityRecommendation(settings.quality);
  }

  return {
    totalMemoryMB,
    totalMemoryGB,
    warningLevel,
    canExport,
    recommendation,
  };
}

/**
 * Get the best quality recommendation for memory optimization
 */
function getBestQualityRecommendation(currentQuality: string) {
  // Recommend next lower quality level
  if (currentQuality === "1080p") {
    return {
      suggestedQuality: "720p",
      memoryReduction: QUALITY_MEMORY_SAVINGS["720p"].reduction,
      description: QUALITY_MEMORY_SAVINGS["720p"].description,
    };
  }
  if (currentQuality === "720p") {
    return {
      suggestedQuality: "480p",
      memoryReduction: QUALITY_MEMORY_SAVINGS["480p"].reduction,
      description: QUALITY_MEMORY_SAVINGS["480p"].description,
    };
  }

  // Already at lowest quality
  return {
    suggestedQuality: "480p",
    memoryReduction: 0,
    description: "Already at lowest quality",
  };
}

/**
 * Format memory size for display
 */
export function formatMemorySize(bytes: number): string {
  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(1)} GB`;
  }
  if (bytes >= MB) {
    return `${(bytes / MB).toFixed(0)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * Get memory warning message based on warning level
 */
export function getMemoryWarningMessage(estimate: MemoryEstimate): string {
  switch (estimate.warningLevel) {
    case "maximum":
      return `Export blocked - Very high memory usage (${estimate.totalMemoryGB.toFixed(1)} GB). This could crash your browser.`;
    case "critical":
      return `High memory usage (${estimate.totalMemoryGB.toFixed(1)} GB) may cause performance issues or crashes.`;
    case "warning":
      return `Moderate memory usage (${estimate.totalMemoryGB.toFixed(1)} GB) detected. Consider monitoring system performance.`;
    default:
      return "";
  }
}

/**
 * Check if system has enough available memory (rough estimate)
 */
export function checkSystemMemory(): {
  available: boolean;
  estimatedTotalGB: number;
  warning?: string;
} {
  // Try to estimate system memory using performance API
  let estimatedTotalGB = 8; // Default conservative estimate
  let warning: string | undefined;

  try {
    // Use device memory API if available (Chrome/Edge)
    if ("deviceMemory" in navigator) {
      estimatedTotalGB = (navigator as any).deviceMemory;
    } else {
      // Fallback: estimate based on user agent and other hints
      const isHighEnd = window.screen.width * window.screen.height > 2_073_600; // > 1920x1080
      estimatedTotalGB = isHighEnd ? 16 : 8;
      warning = "Memory estimate based on screen resolution";
    }
  } catch (error) {
    warning = "Could not detect system memory";
  }

  return {
    available: estimatedTotalGB >= 4, // Minimum 4GB recommended
    estimatedTotalGB,
    warning,
  };
}
