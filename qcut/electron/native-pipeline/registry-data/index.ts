/**
 * Registry data barrel export
 *
 * Re-exports all model registration functions from split modules.
 * Maintains backward compatibility with the original registry-data.ts and registry-data-2.ts.
 *
 * @module electron/native-pipeline/registry-data
 */

// Part 1 (originally registry-data.ts)
export { registerTextToVideoModels } from "./text-to-video.js";
export { registerImageToVideoModels } from "./image-to-video.js";
export { registerImageToImageModels } from "./image-to-image.js";

// Part 2 (originally registry-data-2.ts)
export { registerAvatarModels } from "./avatar.js";
export { registerVideoToVideoModels } from "./video-to-video.js";
export { registerTextToImageModels } from "./text-to-image.js";
export { registerTTSModels } from "./tts.js";
export { registerImageUnderstandingModels } from "./image-understanding.js";
export { registerPromptGenerationModels } from "./prompt-generation.js";
export { registerSpeechToTextModels } from "./speech-to-text.js";
export {
	registerRunwayModels,
	registerHeyGenModels,
	registerDIDModels,
	registerSynthesiaModels,
	registerPhotaModels,
} from "./platform-models.js";

// Part 2 aggregate function
import { registerAvatarModels } from "./avatar.js";
import { registerVideoToVideoModels } from "./video-to-video.js";
import { registerTextToImageModels } from "./text-to-image.js";
import { registerTTSModels } from "./tts.js";
import { registerImageUnderstandingModels } from "./image-understanding.js";
import { registerPromptGenerationModels } from "./prompt-generation.js";
import { registerSpeechToTextModels } from "./speech-to-text.js";
import {
	registerRunwayModels,
	registerHeyGenModels,
	registerDIDModels,
	registerSynthesiaModels,
	registerPhotaModels,
} from "./platform-models.js";

/** Register all Part 2 models. */
export function registerAllPart2Models(): void {
	registerAvatarModels();
	registerVideoToVideoModels();
	registerTextToImageModels();
	registerTTSModels();
	registerImageUnderstandingModels();
	registerPromptGenerationModels();
	registerSpeechToTextModels();
	registerRunwayModels();
	registerHeyGenModels();
	registerDIDModels();
	registerSynthesiaModels();
	registerPhotaModels();
}
