/**
 * Export CLI Sources - Barrel Export
 *
 * Re-exports all source extraction utilities for convenient imports.
 */

// Video source extraction
export { extractVideoSources, extractVideoInputPath } from "./video-sources";
export { extractVideoTransitions } from "./video-transitions";

// Image source extraction
export { extractImageSources } from "./image-sources";

// Sticker source extraction
export { extractStickerSources } from "./sticker-sources";

// Audio source detection (shared between dialog UI and export pipeline)
export { detectAudioSources, type AudioSourceInfo } from "./audio-detection";

// Audio source extraction for CLI FFmpeg export
export {
	extractAudioCrossfadeInputs,
	extractAudioMixConfig,
	extractAudioFileInputs,
	type AudioSourceAPI,
} from "./audio-sources";
