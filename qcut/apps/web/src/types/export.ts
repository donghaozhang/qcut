// Export format types - supports multiple formats
export const ExportFormat = {
	WEBM: "webm",
	MP4: "mp4",
	MOV: "mov",
	GIF: "gif",
} as const;

export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

// Export quality presets
export const ExportQuality = {
	HIGH: "1080p",
	MEDIUM: "720p",
	LOW: "480p",
} as const;

export type ExportQuality = (typeof ExportQuality)[keyof typeof ExportQuality];

// Export purpose types
export const ExportPurpose = {
	FINAL: "final",
	PREVIEW: "preview",
} as const;

export type ExportPurpose = (typeof ExportPurpose)[keyof typeof ExportPurpose];

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

// ============================================================================
// AUDIO EXPORT EXTENSIONS (Non-breaking additions)
// ============================================================================

/**
 * Supported audio codec types for export
 */
export type AudioCodec = "aac" | "opus" | "mp3";

/**
 * Audio export options interface
 * These are optional extensions that don't affect existing ExportSettings
 */
export interface AudioExportOptions {
	includeAudio?: boolean;
	audioCodec?: AudioCodec;
	audioBitrate?: number; // in kbps
	audioSampleRate?: number; // in Hz
	audioChannels?: 1 | 2; // mono or stereo
}

/**
 * Extended export settings that include audio options
 * Use this for components that support audio export
 */
export interface ExportSettingsWithAudio
	extends ExportSettings,
		AudioExportOptions {}

/**
 * Type guard to check if settings include audio options
 */
export const hasAudioOptions = (
	settings: ExportSettings | ExportSettingsWithAudio
): settings is ExportSettingsWithAudio => {
	return "includeAudio" in settings;
};

/**
 * Helper to safely get audio inclusion status
 * Defaults to true for backward compatibility
 */
export const shouldIncludeAudio = (
	settings: ExportSettings | ExportSettingsWithAudio
): boolean => {
	if (hasAudioOptions(settings)) {
		return settings.includeAudio ?? true;
	}
	return true; // Default: include audio for backward compatibility
};

/**
 * Get audio codec for format
 * Maps export formats to their recommended audio codecs
 */
export const getAudioCodecForFormat = (format: ExportFormat): AudioCodec => {
	switch (format) {
		case ExportFormat.MP4:
		case ExportFormat.MOV:
			return "aac";
		case ExportFormat.WEBM:
			return "opus";
		default:
			return "aac";
	}
};

/**
 * Default audio export options
 */
export const DEFAULT_AUDIO_OPTIONS: AudioExportOptions = {
	includeAudio: true,
	audioCodec: "aac",
	audioBitrate: 128,
	audioSampleRate: 44_100,
	audioChannels: 2,
};

/**
 * Merge audio options with export settings
 * Safe helper to combine settings without breaking existing code
 */
export const mergeAudioSettings = (
	baseSettings: ExportSettings,
	audioOptions?: AudioExportOptions
): ExportSettingsWithAudio => {
	return {
		...baseSettings,
		...DEFAULT_AUDIO_OPTIONS,
		...audioOptions,
	};
};

// ============================================================================
// GIF EXPORT EXTENSIONS
// ============================================================================

/** Valid GIF frame rates */
export type GifFrameRate = 15 | 20 | 25 | 30;

/** GIF size presets */
export type GifSizePreset = "medium" | "large" | "original";

/** GIF export configuration */
export interface GifExportConfig {
	frameRate: GifFrameRate;
	loop: boolean;
	sizePreset: GifSizePreset;
	quality: number; // gif.js quality (1=best, 20=fastest)
}

/** Default GIF export config */
export const DEFAULT_GIF_CONFIG: GifExportConfig = {
	frameRate: 20,
	loop: true,
	sizePreset: "medium",
	quality: 10,
};

/** GIF size preset dimensions */
export const GIF_SIZE_PRESETS: Record<
	GifSizePreset,
	{ maxHeight: number; label: string }
> = {
	medium: { maxHeight: 720, label: "Medium (720p)" },
	large: { maxHeight: 1080, label: "Large (1080p)" },
	original: { maxHeight: Infinity, label: "Original" },
};

/** GIF frame rate options with labels */
export const GIF_FRAME_RATES: { value: GifFrameRate; label: string }[] = [
	{ value: 15, label: "15 FPS — Balanced" },
	{ value: 20, label: "20 FPS — Smooth" },
	{ value: 25, label: "25 FPS — Very smooth" },
	{ value: 30, label: "30 FPS — Maximum" },
];

/** Valid GIF frame rates for validation */
export const VALID_GIF_FRAME_RATES: readonly GifFrameRate[] = [
	15, 20, 25, 30,
] as const;

/** Type guard for valid GIF frame rate */
export function isValidGifFrameRate(rate: number): rate is GifFrameRate {
	return (VALID_GIF_FRAME_RATES as readonly number[]).includes(rate);
}

/**
 * Calculate output dimensions for GIF based on size preset.
 * Preserves aspect ratio and ensures even pixel counts.
 */
export function calculateGifDimensions(
	sourceWidth: number,
	sourceHeight: number,
	sizePreset: GifSizePreset
): { width: number; height: number } {
	const preset = GIF_SIZE_PRESETS[sizePreset];

	if (sourceHeight <= preset.maxHeight || sizePreset === "original") {
		return { width: sourceWidth, height: sourceHeight };
	}

	const aspectRatio = sourceWidth / sourceHeight;
	const newHeight = preset.maxHeight;
	const newWidth = Math.round(newHeight * aspectRatio);

	return {
		width: newWidth % 2 === 0 ? newWidth : newWidth + 1,
		height: newHeight % 2 === 0 ? newHeight : newHeight + 1,
	};
}

/** GIF format info (extends FORMAT_INFO pattern) */
export const GIF_FORMAT_INFO = {
	label: "GIF",
	description: "Animated image for sharing (Slack, GitHub, docs)",
	extension: ".gif",
} as const;
