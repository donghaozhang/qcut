/**
 * Export CLI Types
 *
 * Type definitions for the export engine CLI module.
 * Extracted from export-engine-cli.ts for reuse across filter and source modules.
 */

/**
 * Video source input for FFmpeg direct copy optimization.
 * Matches IPC handler expectations for video segment data.
 */
export interface VideoSourceInput {
	path: string;
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
}

/**
 * Audio file input for FFmpeg export.
 * Contains path, timing, and volume information for audio mixing.
 */
export interface AudioFileInput {
	path: string;
	startTime: number;
	volume: number;
	trimStart?: number;
	duration?: number;
}

/**
 * Image source input for FFmpeg overlay filter.
 * Contains path, timing, and dimension data for image compositing.
 */
export interface ImageSourceInput {
	path: string; // Local file path for FFmpeg
	startTime: number; // When image appears on timeline
	duration: number; // How long image is visible
	width?: number; // Original image width
	height?: number; // Original image height
	trimStart: number; // Trim start (usually 0 for images)
	trimEnd: number; // Trim end (usually 0 for images)
	elementId: string; // For debugging
}

/**
 * Sticker source for FFmpeg overlay filter.
 * Contains all positioning, sizing, timing, and effect data.
 */
export interface StickerSourceForFilter {
	id: string;
	path: string;
	x: number;
	y: number;
	width: number;
	height: number;
	startTime: number;
	endTime: number;
	zIndex: number;
	opacity?: number;
	rotation?: number;
	maintainAspectRatio?: boolean;
}

/**
 * Progress callback type for export progress reporting.
 */
export type ProgressCallback = (progress: number, message: string) => void;

/**
 * Font configuration return type for platform-specific resolution.
 * - useFontconfig: true for Linux/macOS (fontconfig name)
 * - useFontconfig: false for Windows (explicit file path)
 */
export type FontConfig =
	| { useFontconfig: true; fontName: string }
	| { useFontconfig: false; fontPath: string };

/**
 * Platform type from Electron API.
 */
export type Platform = "win32" | "darwin" | "linux";

/**
 * Re-export TextElement for use in filter modules (using export from).
 */
export type { TextElement } from "@/types/timeline";
