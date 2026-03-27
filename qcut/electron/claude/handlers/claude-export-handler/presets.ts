/**
 * Export preset data and lookup.
 * @module electron/claude/handlers/claude-export-handler/presets
 */

import type { ExportPreset } from "../../../types/claude-api";

// Platform-specific export presets
export const PRESETS: ExportPreset[] = [
	{
		id: "youtube-4k",
		name: "YouTube 4K",
		platform: "youtube",
		width: 3840,
		height: 2160,
		fps: 60,
		bitrate: "45Mbps",
		format: "mp4",
	},
	{
		id: "youtube-1080p",
		name: "YouTube 1080p",
		platform: "youtube",
		width: 1920,
		height: 1080,
		fps: 30,
		bitrate: "8Mbps",
		format: "mp4",
	},
	{
		id: "youtube-720p",
		name: "YouTube 720p",
		platform: "youtube",
		width: 1280,
		height: 720,
		fps: 30,
		bitrate: "5Mbps",
		format: "mp4",
	},
	{
		id: "tiktok",
		name: "TikTok",
		platform: "tiktok",
		width: 1080,
		height: 1920,
		fps: 30,
		bitrate: "6Mbps",
		format: "mp4",
	},
	{
		id: "instagram-reel",
		name: "Instagram Reel",
		platform: "instagram",
		width: 1080,
		height: 1920,
		fps: 30,
		bitrate: "5Mbps",
		format: "mp4",
	},
	{
		id: "instagram-post",
		name: "Instagram Post (Square)",
		platform: "instagram",
		width: 1080,
		height: 1080,
		fps: 30,
		bitrate: "5Mbps",
		format: "mp4",
	},
	{
		id: "instagram-landscape",
		name: "Instagram Post (Landscape)",
		platform: "instagram",
		width: 1080,
		height: 566,
		fps: 30,
		bitrate: "5Mbps",
		format: "mp4",
	},
	{
		id: "twitter",
		name: "Twitter/X",
		platform: "twitter",
		width: 1920,
		height: 1080,
		fps: 30,
		bitrate: "6Mbps",
		format: "mp4",
	},
	{
		id: "linkedin",
		name: "LinkedIn",
		platform: "linkedin",
		width: 1920,
		height: 1080,
		fps: 30,
		bitrate: "8Mbps",
		format: "mp4",
	},
	{
		id: "discord",
		name: "Discord (8MB limit)",
		platform: "discord",
		width: 1280,
		height: 720,
		fps: 30,
		bitrate: "2Mbps",
		format: "mp4",
	},
	{
		id: "gif-medium",
		name: "GIF Medium (720p)",
		platform: "web",
		width: 1280,
		height: 720,
		fps: 20,
		bitrate: "0",
		format: "gif",
	},
	{
		id: "gif-large",
		name: "GIF Large (1080p)",
		platform: "web",
		width: 1920,
		height: 1080,
		fps: 15,
		bitrate: "0",
		format: "gif",
	},
];

export function findPresetById({
	presetId,
}: {
	presetId: string;
}): ExportPreset | null {
	try {
		return PRESETS.find((preset) => preset.id === presetId) ?? null;
	} catch {
		return null;
	}
}
