// Export format types - MVP supports MP4 only
export enum ExportFormat {
  MP4 = "mp4",
  // Future formats
  // WEBM = "webm",
  // MOV = "mov"
}

// Export quality presets
export enum ExportQuality {
  HIGH = "1080p",
  MEDIUM = "720p", 
  LOW = "480p"
}

// Export settings configuration
export interface ExportSettings {
  format: ExportFormat;
  quality: ExportQuality;
  filename: string;
  width: number;
  height: number;
}

// Export progress tracking
export interface ExportProgress {
  isExporting: boolean;
  progress: number; // 0-100
  currentFrame: number;
  totalFrames: number;
  estimatedTimeRemaining: number; // seconds
  status: string; // User-friendly status message
}

// Resolution presets for each quality
export const QUALITY_RESOLUTIONS = {
  [ExportQuality.HIGH]: { width: 1920, height: 1080, label: "1920×1080" },
  [ExportQuality.MEDIUM]: { width: 1280, height: 720, label: "1280×720" },
  [ExportQuality.LOW]: { width: 854, height: 480, label: "854×480" },
} as const;

// File size estimates per minute
export const QUALITY_SIZE_ESTIMATES = {
  [ExportQuality.HIGH]: "~50-100 MB/min",
  [ExportQuality.MEDIUM]: "~25-50 MB/min",
  [ExportQuality.LOW]: "~15-25 MB/min",
} as const;

// Helper function to validate filename
export const isValidFilename = (filename: string): boolean => {
  return filename.trim().length > 0 && !/[<>:"/\\|?*]/.test(filename);
};

// Helper function to get default filename with timestamp
export const getDefaultFilename = (): string => {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
  return `export_${timestamp}`;
};