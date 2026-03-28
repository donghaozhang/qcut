/**
 * Audio Export Configuration Module
 *
 * Manages audio export settings separately from main export config
 * to ensure backward compatibility and maintainability.
 *
 * Design decisions:
 * - Singleton pattern for global state management
 * - Immutable config updates via spread operator
 * - Format-based codec selection for automatic compatibility
 * - Default settings optimized for quality/size balance
 */

import type { ExportFormat, AudioCodec } from "@/types/export";

export interface AudioExportConfig {
	enabled: boolean;
	codec?: "aac" | "opus" | "mp3";
	bitrate?: number; // in kbps
	sampleRate?: number; // in Hz
	channels?: 1 | 2; // mono or stereo
}

// Default configuration optimized for web delivery
const DEFAULT_AUDIO_CONFIG: AudioExportConfig = {
	enabled: true,
	codec: "aac",
	bitrate: 128,
	sampleRate: 44_100,
	channels: 2,
};

// Private state management
let audioConfig: AudioExportConfig = { ...DEFAULT_AUDIO_CONFIG };

/**
 * Update audio export configuration
 * @param config Partial configuration to merge
 */
export const setAudioExportConfig = (
	config: Partial<AudioExportConfig>
): void => {
	audioConfig = { ...audioConfig, ...config };
};

/**
 * Get current audio export configuration
 * @returns Immutable copy of current config
 */
export const getAudioExportConfig = (): AudioExportConfig => ({
	...audioConfig,
});

/**
 * Reset audio configuration to defaults
 */
export const resetAudioExportConfig = (): void => {
	audioConfig = { ...DEFAULT_AUDIO_CONFIG };
};

/**
 * Auto-select codec based on export format
 * @param format Export format (mp4, webm, mov)
 * @returns Recommended audio codec
 */
export const getCodecForFormat = (format: ExportFormat): AudioCodec => {
	const formatCodecMap: Record<ExportFormat | "default", AudioCodec> = {
		mp4: "aac", // MP4 works best with AAC
		webm: "opus", // WebM prefers Opus (better compression)
		mov: "aac", // MOV works with AAC
		gif: "aac", // GIF has no audio, but satisfy the type
		default: "aac", // Safe default
	};
	return formatCodecMap[format] ?? formatCodecMap.default;
};

/**
 * Get recommended bitrate based on quality setting
 * @param quality Export quality (1080p, 720p, 480p)
 * @returns Recommended audio bitrate in kbps
 */
export const getBitrateForQuality = (quality: string): number => {
	const qualityBitrateMap: Record<string, number> = {
		"1080p": 192, // Higher quality for HD
		"720p": 128, // Standard quality
		"480p": 96, // Lower bitrate for smaller files
		default: 128, // Safe default
	};

	return qualityBitrateMap[quality] || qualityBitrateMap.default;
};

/**
 * Validate audio configuration
 * @param config Configuration to validate
 * @returns True if valid, false otherwise
 */
export const validateAudioConfig = (
	config: Partial<AudioExportConfig>
): boolean => {
	if (config.bitrate && (config.bitrate < 32 || config.bitrate > 320)) {
		console.warn(
			`Invalid audio bitrate: ${config.bitrate}. Must be between 32 and 320 kbps.`
		);
		return false;
	}

	if (
		config.sampleRate &&
		![22_050, 44_100, 48_000, 96_000].includes(config.sampleRate)
	) {
		console.warn(
			`Unusual sample rate: ${config.sampleRate}. Common rates are 22050, 44100, 48000, 96000 Hz.`
		);
	}

	return true;
};

/**
 * Get human-readable audio settings description
 * @returns Formatted string describing current settings
 */
export const getAudioSettingsDescription = (): string => {
	const config = getAudioExportConfig();
	if (!config.enabled) return "Audio disabled";

	const codec = config.codec || "default";
	const bitrate = config.bitrate || 128;
	const channels = config.channels === 1 ? "Mono" : "Stereo";

	return `${codec.toUpperCase()} ${bitrate}kbps ${channels}`;
};

// Export default config for reference
export const DEFAULT_AUDIO_EXPORT_CONFIG = DEFAULT_AUDIO_CONFIG;
