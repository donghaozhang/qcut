/**
 * FFmpeg Module - Barrel Exports
 *
 * Central export point for all FFmpeg-related types and utilities.
 * Import from this file for clean, organized imports.
 */

// Types
export type {
	AudioFile,
	VideoSource,
	StickerSource,
	ExportOptions,
	FrameProcessOptions,
	FrameData,
	ExportResult,
	QualitySettings,
	QualityMap,
	FFmpegProgress,
	FFmpegError,
	OpenFolderResult,
	ExtractAudioOptions,
	ExtractAudioResult,
	VideoProbeResult,
	FFmpegHandlers,
	FFmpegHealthResult,
} from "./types";

// Utilities
export {
	// Constants
	MAX_EXPORT_DURATION,
	QUALITY_SETTINGS,
	// Debug logging
	debugLog,
	debugWarn,
	debugError,
	// Path resolution
	getFFmpegPath,
	getFFprobePath,
	// Progress parsing
	parseProgress,
	// Video probing
	probeVideoFile,
	probeHasAudioStream,
	// Video normalization
	normalizeVideo,
	// Health check
	verifyFFmpegBinary,
} from "./utils";
