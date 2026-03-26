/**
 * Platform-specific model definitions (Runway, HeyGen, D-ID, Synthesia, Phota)
 * @module electron/native-pipeline/registry-data/platform-models
 */

import { ModelRegistry } from "../infra/registry.js";

export function registerRunwayModels(): void {
	ModelRegistry.register({
		key: "runway_gen4",
		name: "Runway Gen-4",
		provider: "Runway",
		endpoint: "fal-ai/runway/gen4/turbo/image-to-video",
		categories: ["image_to_video", "text_to_video"],
		description: "Runway Gen-4 text/image to video with turbo mode",
		pricing: { per_second: 0.05 },
		defaults: { duration: 5 },
		features: ["text_to_video", "image_to_video", "turbo"],
		maxDuration: 10,
		costEstimate: 0.25,
		processingTime: 60,
	});
}

export function registerHeyGenModels(): void {
	ModelRegistry.register({
		key: "heygen_avatar",
		name: "HeyGen Avatar",
		provider: "HeyGen",
		endpoint: "fal-ai/heygen/v2/avatar",
		categories: ["avatar"],
		description: "AI avatar generation with customizable appearances",
		pricing: { per_second: 0.1 },
		defaults: { resolution: "1080p" },
		features: ["avatar_generation", "customizable", "lip_sync"],
		maxDuration: 60,
		costEstimate: 1.0,
		processingTime: 90,
	});

	ModelRegistry.register({
		key: "heygen_translate_speed",
		name: "HeyGen Translate (Speed)",
		provider: "HeyGen",
		endpoint: "fal-ai/heygen/v2/translate/speed",
		categories: ["translate"],
		description: "Translate video speech into another language with lip sync",
		pricing: { per_second: 0.05 },
		defaults: {},
		features: ["video_translation", "lip_sync", "multi_language"],
		maxDuration: 300,
		costEstimate: 0.5,
		processingTime: 120,
	});
}

export function registerDIDModels(): void {
	ModelRegistry.register({
		key: "did_studio",
		name: "D-ID Studio",
		provider: "D-ID",
		endpoint: "fal-ai/d-id/studio",
		categories: ["avatar"],
		description: "D-ID talking avatar with text or audio input",
		pricing: { per_second: 0.08 },
		defaults: { resolution: "1080p" },
		features: ["avatar_generation", "text_driven", "audio_driven"],
		maxDuration: 120,
		costEstimate: 0.8,
		processingTime: 60,
	});
}

export function registerPhotaModels(): void {
	ModelRegistry.register({
		key: "phota",
		name: "Phota",
		provider: "Photalabs (via FAL)",
		endpoint: "fal-ai/phota",
		categories: ["text_to_image"],
		description: "AI photo generation with identity preservation via profiles",
		pricing: { per_image: 0.05 },
		aspectRatios: ["auto", "1:1", "16:9", "4:3", "3:4", "9:16"],
		defaults: { resolution: "1K", aspect_ratio: "auto" },
		features: [
			"text_to_image",
			"identity_preservation",
			"profile_references",
			"4K_output",
		],
		costEstimate: 0.05,
		processingTime: 15,
	});

	ModelRegistry.register({
		key: "phota_edit",
		name: "Phota Edit",
		provider: "Photalabs (via FAL)",
		endpoint: "fal-ai/phota/edit",
		categories: ["image_to_image"],
		description:
			"AI photo editing with prompt-driven edits and identity preservation via profiles",
		pricing: { per_image: 0.05 },
		aspectRatios: ["auto", "1:1", "16:9", "4:3", "3:4", "9:16"],
		defaults: { resolution: "1K", aspect_ratio: "auto" },
		features: [
			"prompt_editing",
			"identity_preservation",
			"multi_image_input",
			"4K_output",
		],
		costEstimate: 0.05,
		processingTime: 15,
	});

	ModelRegistry.register({
		key: "phota_enhance",
		name: "Phota Enhance",
		provider: "Photalabs (via FAL)",
		endpoint: "fal-ai/phota/enhance",
		categories: ["image_to_image"],
		description:
			"One-click AI image enhancement with optional identity preservation",
		pricing: { per_image: 0.03 },
		defaults: {},
		features: ["image_enhancement", "identity_preservation"],
		costEstimate: 0.03,
		processingTime: 10,
	});

	ModelRegistry.register({
		key: "phota_create_profile",
		name: "Phota Create Profile",
		provider: "Photalabs (via FAL)",
		endpoint: "fal-ai/phota/create-profile",
		categories: ["image_to_image"],
		description:
			"Create a reusable identity profile from reference images for consistent generation",
		pricing: { per_run: 0.1 },
		defaults: {},
		features: ["profile_creation", "identity_training"],
		costEstimate: 0.1,
		processingTime: 60,
	});
}

export function registerSynthesiaModels(): void {
	ModelRegistry.register({
		key: "synthesia_avatar",
		name: "Synthesia Avatar",
		provider: "Synthesia",
		endpoint: "fal-ai/synthesia/avatar",
		categories: ["avatar"],
		description: "Enterprise avatar generation with multiple languages",
		pricing: { per_second: 0.12 },
		defaults: { resolution: "1080p" },
		features: ["avatar_generation", "enterprise", "multilingual"],
		maxDuration: 300,
		costEstimate: 1.2,
		processingTime: 120,
	});
}
