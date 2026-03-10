/**
 * Platform capability detection and helpers.
 *
 * @module @qcut/platform-core/capabilities
 */

import { PlatformCapability, type PlatformAPI } from "./types.js";

/**
 * Error thrown when a platform adapter does not support a requested capability.
 */
export class PlatformUnsupportedError extends Error {
	constructor(
		public readonly capability: PlatformCapability,
		public readonly platform: string
	) {
		super(
			`Capability "${capability}" is not supported on platform "${platform}"`
		);
		this.name = "PlatformUnsupportedError";
	}
}

/**
 * Capabilities available on each platform.
 * Used by adapters to declare what they support.
 */
export const PLATFORM_CAPABILITIES: Record<
	PlatformAPI["platform"],
	Set<PlatformCapability>
> = {
	desktop: new Set(Object.values(PlatformCapability)),
	web: new Set([
		PlatformCapability.Storage,
		PlatformCapability.Theme,
		PlatformCapability.FileSystem, // via File System Access API (partial)
		PlatformCapability.FFmpeg, // WASM only
		PlatformCapability.Transcription, // direct API
		PlatformCapability.ApiKeys,
		PlatformCapability.Shell, // window.open only
		PlatformCapability.License, // direct HTTP
		PlatformCapability.GeminiChat, // direct API
		PlatformCapability.AiPipeline, // direct API
		PlatformCapability.FalUpload, // direct API (if CORS allows)
		PlatformCapability.ScreenRecording, // MediaRecorder API (partial)
		PlatformCapability.Screenshot, // Canvas API
	]),
	ios: new Set([
		PlatformCapability.Storage,
		PlatformCapability.Theme,
		PlatformCapability.FileSystem, // limited
		PlatformCapability.FFmpeg, // WASM only
		PlatformCapability.Transcription,
		PlatformCapability.ApiKeys,
		PlatformCapability.Shell,
		PlatformCapability.License,
		PlatformCapability.GeminiChat,
		PlatformCapability.AiPipeline,
		PlatformCapability.FalUpload,
		PlatformCapability.Screenshot,
	]),
};

/**
 * Check whether a given platform supports a specific capability.
 */
export function isPlatformCapable(
	platform: PlatformAPI["platform"],
	capability: PlatformCapability
): boolean {
	return PLATFORM_CAPABILITIES[platform]?.has(capability) ?? false;
}

/**
 * Get all capabilities missing on a platform compared to desktop.
 */
export function getMissingCapabilities(
	platform: PlatformAPI["platform"]
): PlatformCapability[] {
	const desktop = PLATFORM_CAPABILITIES.desktop;
	const target = PLATFORM_CAPABILITIES[platform];
	if (!target) return [...desktop];
	return [...desktop].filter((cap) => !target.has(cap));
}
