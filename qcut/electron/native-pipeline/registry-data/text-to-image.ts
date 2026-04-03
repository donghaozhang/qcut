/**
 * Text-to-image model definitions
 * @module electron/native-pipeline/registry-data/text-to-image
 */

import { ModelRegistry } from "../infra/registry.js";

/** Register all text-to-image models in the pipeline registry. */
export function registerTextToImageModels(): void {
	ModelRegistry.register({
		key: "flux_dev",
		name: "FLUX.1 Dev",
		provider: "Black Forest Labs",
		endpoint: "fal-ai/flux/dev",
		categories: ["text_to_image"],
		description: "Highest quality 12B parameter text-to-image model",
		pricing: { per_image: 0.003 },
		aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
		defaults: { aspect_ratio: "16:9", style: "cinematic" },
		features: ["high_quality", "12B_parameters"],
		costEstimate: 0.003,
		processingTime: 15,
	});

	ModelRegistry.register({
		key: "flux_schnell",
		name: "FLUX.1 Schnell",
		provider: "Black Forest Labs",
		endpoint: "fal-ai/flux/schnell",
		categories: ["text_to_image"],
		description: "Fastest inference speed text-to-image model",
		pricing: { per_image: 0.001 },
		aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
		defaults: { aspect_ratio: "16:9" },
		features: ["fast_inference", "cost_effective"],
		costEstimate: 0.001,
		processingTime: 5,
	});

	ModelRegistry.register({
		key: "imagen4",
		name: "Google Imagen 4",
		provider: "Google (via FAL)",
		endpoint: "fal-ai/imagen4/preview",
		categories: ["text_to_image"],
		description: "Google's photorealistic text-to-image model",
		pricing: { per_image: 0.004 },
		aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
		defaults: { aspect_ratio: "16:9" },
		features: ["photorealistic", "high_quality"],
		costEstimate: 0.004,
		processingTime: 20,
	});

	ModelRegistry.register({
		key: "seedream_v3",
		name: "Seedream v3",
		provider: "ByteDance",
		endpoint: "fal-ai/seedream-3",
		categories: ["text_to_image"],
		description: "Multilingual text-to-image model",
		pricing: { per_image: 0.002 },
		aspectRatios: ["1:1", "16:9", "9:16"],
		defaults: { aspect_ratio: "16:9" },
		features: ["multilingual", "cost_effective"],
		costEstimate: 0.002,
		processingTime: 10,
	});

	ModelRegistry.register({
		key: "seedream3",
		name: "Seedream-3",
		provider: "ByteDance (via Replicate)",
		endpoint: "replicate/seedream-3",
		categories: ["text_to_image"],
		description: "High-resolution text-to-image model",
		pricing: { per_image: 0.003 },
		aspectRatios: ["1:1", "16:9", "9:16"],
		defaults: { aspect_ratio: "16:9" },
		features: ["high_resolution"],
		costEstimate: 0.003,
		processingTime: 15,
	});

	ModelRegistry.register({
		key: "gen4",
		name: "Runway Gen-4",
		provider: "Runway (via Replicate)",
		endpoint: "replicate/gen4",
		categories: ["text_to_image"],
		description: "Multi-reference guided image generation",
		pricing: { per_image: 0.08 },
		aspectRatios: ["1:1", "16:9", "9:16"],
		defaults: { aspect_ratio: "16:9" },
		features: ["reference_guided", "cinematic"],
		costEstimate: 0.08,
		processingTime: 20,
	});

	ModelRegistry.register({
		key: "nano_banana_pro",
		name: "Nano Banana Pro",
		provider: "FAL AI",
		endpoint: "fal-ai/nano-banana-pro",
		categories: ["text_to_image"],
		description: "Fast, high-quality text-to-image generation",
		pricing: { per_image: 0.002 },
		aspectRatios: ["1:1", "16:9", "9:16"],
		defaults: { aspect_ratio: "16:9" },
		features: ["fast_processing", "high_quality"],
		costEstimate: 0.002,
		processingTime: 5,
	});

	ModelRegistry.register({
		key: "gpt_image_1_5",
		name: "GPT Image 1.5",
		provider: "OpenAI (via FAL)",
		endpoint: "fal-ai/gpt-image-1.5",
		categories: ["text_to_image"],
		description: "GPT-powered image generation with strong prompt adherence",
		pricing: { per_image: 0.04 },
		aspectRatios: ["1:1", "16:9", "9:16"],
		defaults: { image_size: "1536x1024", quality: "high", output_format: "png" },
		features: ["gpt_powered", "natural_language", "high_quality"],
		costEstimate: 0.04,
		processingTime: 45,
	});

	ModelRegistry.register({
		key: "phota",
		name: "Phota",
		provider: "Photalabs (via FAL)",
		endpoint: "fal-ai/phota",
		categories: ["text_to_image"],
		description: "Photorealistic text-to-image generation",
		pricing: { per_image: 0.03 },
		aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
		defaults: { image_size: "landscape_16_9", enable_safety_checker: true },
		features: ["photorealistic", "high_quality"],
		costEstimate: 0.03,
		processingTime: 15,
	});

	ModelRegistry.register({
		key: "seedream_v4_5",
		name: "SeedDream v4.5",
		provider: "ByteDance (via FAL)",
		endpoint: "fal-ai/bytedance/seedream/v4.5/text-to-image",
		categories: ["text_to_image"],
		description: "ByteDance's latest unified image generation, up to 4K",
		pricing: { per_image: 0.05 },
		aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
		defaults: { image_size: "auto_2K", enable_safety_checker: true },
		features: ["high_resolution", "4K_output", "fast_processing"],
		costEstimate: 0.05,
		processingTime: 15,
	});

	ModelRegistry.register({
		key: "seedream_v4_5_edit",
		name: "SeedDream v4.5 Edit",
		provider: "ByteDance (via FAL)",
		endpoint: "fal-ai/bytedance/seedream/v4.5/edit",
		categories: ["text_to_image"],
		description: "ByteDance image editing with multi-image compositing (up to 10)",
		pricing: { per_image: 0.05 },
		aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
		defaults: { image_size: "auto_2K", enable_safety_checker: true },
		features: ["image_editing", "multi_reference", "4K_output"],
		costEstimate: 0.05,
		processingTime: 15,
	});

	ModelRegistry.register({
		key: "nano_banana_2",
		name: "Nano Banana 2",
		provider: "FAL AI",
		endpoint: "fal-ai/nano-banana-2",
		categories: ["text_to_image"],
		description: "Fast high-quality text-to-image generation (v2)",
		pricing: { per_image: 0.002 },
		aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
		defaults: { aspect_ratio: "16:9" },
		features: ["fast_processing", "high_quality"],
		costEstimate: 0.002,
		processingTime: 5,
	});

	// Wan 2.7 text-to-image models
	ModelRegistry.register({
		key: "wan_v2_7_t2i",
		name: "Wan 2.7 T2I",
		provider: "Wan (via FAL)",
		endpoint: "fal-ai/wan/v2.7/text-to-image",
		categories: ["text_to_image"],
		description: "Bilingual (Chinese/English) text-to-image model",
		pricing: { per_image: 0.05 },
		aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
		defaults: { image_size: "square_hd", enable_safety_checker: true },
		features: ["bilingual", "cost_effective"],
		costEstimate: 0.05,
		processingTime: 15,
	});

	ModelRegistry.register({
		key: "wan_v2_7_pro_t2i",
		name: "Wan 2.7 Pro T2I",
		provider: "Wan (via FAL)",
		endpoint: "fal-ai/wan/v2.7/pro/text-to-image",
		categories: ["text_to_image"],
		description: "Higher quality bilingual text-to-image model",
		pricing: { per_image: 0.08 },
		aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
		defaults: { image_size: "square_hd", enable_safety_checker: true },
		features: ["bilingual", "high_quality"],
		costEstimate: 0.08,
		processingTime: 20,
	});

	ModelRegistry.register({
		key: "wan_v2_7_edit",
		name: "Wan 2.7 Edit",
		provider: "Wan (via FAL)",
		endpoint: "fal-ai/wan/v2.7/edit",
		categories: ["text_to_image"],
		description: "Image editing with 1-4 reference images and text prompts",
		pricing: { per_image: 0.05 },
		aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
		defaults: {
			image_size: "square_hd",
			enable_prompt_expansion: true,
			enable_safety_checker: true,
		},
		features: ["image_editing", "multi_reference", "bilingual"],
		costEstimate: 0.05,
		processingTime: 15,
	});

	ModelRegistry.register({
		key: "wan_v2_7_pro_edit",
		name: "Wan 2.7 Pro Edit",
		provider: "Wan (via FAL)",
		endpoint: "fal-ai/wan/v2.7/pro/edit",
		categories: ["text_to_image"],
		description: "Higher quality image editing with 1-4 reference images",
		pricing: { per_image: 0.08 },
		aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
		defaults: {
			image_size: "square_hd",
			enable_prompt_expansion: true,
			enable_safety_checker: true,
		},
		features: ["image_editing", "multi_reference", "high_quality"],
		costEstimate: 0.08,
		processingTime: 20,
	});
}
