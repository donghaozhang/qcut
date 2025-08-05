// Export format types - supports multiple formats
export enum ExportFormat {
  WEBM = "webm",
  MP4 = "mp4",
  MOV = "mov",
}

// Export quality presets
export enum ExportQuality {
  HIGH = "1080p",
  MEDIUM = "720p",
  LOW = "480p",
}

// Export purpose types
export enum ExportPurpose {
  FINAL = "final",
  PREVIEW = "preview",
}

// Export settings configuration
export interface ExportSettings {
  format: ExportFormat;
  quality: ExportQuality;
  filename: string;
  width: number;
  height: number;
  purpose?: ExportPurpose; // Optional, defaults to FINAL
}

// Export progress tracking
export interface ExportProgress {
  isExporting: boolean;
  progress: number; // 0-100
  currentFrame: number;
  totalFrames: number;
  estimatedTimeRemaining: number; // seconds
  status: string; // User-friendly status message

  // Advanced progress info
  encodingSpeed?: number; // frames per second
  processedFrames?: number; // frames successfully processed
  startTime?: Date; // export start time
  elapsedTime?: number; // seconds since start
  averageFrameTime?: number; // average milliseconds per frame
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

// Format information and codecs
export const FORMAT_INFO = {
  [ExportFormat.WEBM]: {
    label: "WebM",
    description: "Modern web format with excellent compression",
    mimeTypes: ["video/webm;codecs=vp9", "video/webm;codecs=vp8"],
    extension: ".webm",
  },
  [ExportFormat.MP4]: {
    label: "MP4",
    description: "Universal format compatible with all devices",
    mimeTypes: ["video/mp4;codecs=h264", "video/mp4"],
    extension: ".mp4",
  },
  [ExportFormat.MOV]: {
    label: "MOV",
    description: "Apple QuickTime format for professional editing",
    mimeTypes: ["video/quicktime", "video/mp4;codecs=h264"],
    extension: ".mov",
  },
} as const;

// Get supported formats based on browser capabilities
export const getSupportedFormats = (): ExportFormat[] => {
  const supported: ExportFormat[] = [];

  Object.entries(FORMAT_INFO).forEach(([format, info]) => {
    const isSupported = info.mimeTypes.some((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType)
    );
    if (isSupported) {
      supported.push(format as ExportFormat);
    }
  });

  // Always include WebM as fallback since it's widely supported
  if (supported.length === 0) {
    supported.push(ExportFormat.WEBM);
  }

  return supported;
};

// Export presets for common platforms
export interface ExportPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  quality: ExportQuality;
  format: ExportFormat;
  aspectRatio?: number;
  tags: string[];
}

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "youtube-hd",
    name: "YouTube HD",
    description: "1080p HD video optimized for YouTube",
    icon: "🎬",
    quality: ExportQuality.HIGH,
    format: ExportFormat.MP4,
    aspectRatio: 16 / 9,
    tags: ["social", "video", "hd"],
  },
  {
    id: "instagram-story",
    name: "Instagram Story",
    description: "1080p vertical format for Instagram Stories",
    icon: "📱",
    quality: ExportQuality.HIGH,
    format: ExportFormat.MP4,
    aspectRatio: 9 / 16,
    tags: ["social", "mobile", "vertical"],
  },
  {
    id: "instagram-post",
    name: "Instagram Post",
    description: "1080p square format for Instagram feed",
    icon: "📷",
    quality: ExportQuality.HIGH,
    format: ExportFormat.MP4,
    aspectRatio: 1 / 1,
    tags: ["social", "square"],
  },
  {
    id: "tiktok",
    name: "TikTok",
    description: "1080p vertical format for TikTok",
    icon: "🎵",
    quality: ExportQuality.HIGH,
    format: ExportFormat.MP4,
    aspectRatio: 9 / 16,
    tags: ["social", "mobile", "vertical", "short-form"],
  },
  {
    id: "twitter",
    name: "Twitter/X",
    description: "720p optimized for Twitter video",
    icon: "🐦",
    quality: ExportQuality.MEDIUM,
    format: ExportFormat.MP4,
    aspectRatio: 16 / 9,
    tags: ["social", "compressed"],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "1080p professional format for LinkedIn",
    icon: "💼",
    quality: ExportQuality.HIGH,
    format: ExportFormat.MP4,
    aspectRatio: 16 / 9,
    tags: ["professional", "business"],
  },
  {
    id: "web-optimized",
    name: "Web Optimized",
    description: "720p WebM for web embedding",
    icon: "🌐",
    quality: ExportQuality.MEDIUM,
    format: ExportFormat.WEBM,
    aspectRatio: 16 / 9,
    tags: ["web", "compressed", "fast-load"],
  },
  {
    id: "high-quality",
    name: "High Quality",
    description: "1080p maximum quality for archival",
    icon: "⭐",
    quality: ExportQuality.HIGH,
    format: ExportFormat.MOV,
    aspectRatio: 16 / 9,
    tags: ["archival", "editing", "quality"],
  },
];

// Helper function to validate filename
export const isValidFilename = (filename: string): boolean => {
  return filename.trim().length > 0 && !/[<>:"/\\|?*]/.test(filename);
};

// Helper function to get default filename with timestamp
export const getDefaultFilename = (): string => {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .slice(0, 16)
    .replace("T", "_")
    .replace(/:/g, "-");
  return `export_${timestamp}`;
};
