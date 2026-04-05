/**
 * Avatar model definitions
 * @module electron/native-pipeline/registry-data/avatar
 */

import { ModelRegistry } from "../infra/registry.js";

export function registerAvatarModels(): void {
	ModelRegistry.register({
		key: "omnihuman_v1_5",
		name: "OmniHuman v1.5 (ByteDance)",
		provider: "ByteDance",
		endpoint: "fal-ai/bytedance/omnihuman/v1.5",
		categories: ["avatar"],
		description: "High-quality audio-driven human animation",
		pricing: { per_second: 0.16 },
		resolutions: ["720p", "1080p"],
		defaults: { resolution: "1080p", turbo_mode: false },
		features: ["audio_driven", "high_quality"],
		maxDuration: 30,
		inputRequirements: {
			required: ["image_url", "audio_url"],
			optional: ["prompt", "turbo_mode", "resolution"],
		},
		modelInfo: { max_durations: { "1080p": 30, "720p": 60 } },
		costEstimate: 0.8,
		processingTime: 60,
	});

	ModelRegistry.register({
		key: "fabric_1_0",
		name: "VEED Fabric 1.0",
		provider: "VEED",
		endpoint: "veed/fabric-1.0",
		categories: ["avatar"],
		description: "Cost-effective lip-sync avatar generation",
		pricing: { "480p": 0.08, "720p": 0.15 },
		resolutions: ["480p", "720p"],
		defaults: { resolution: "720p" },
		features: ["lipsync", "cost_effective"],
		maxDuration: 120,
		inputRequirements: {
			required: ["image_url", "audio_url", "resolution"],
			optional: [],
		},
		costEstimate: 0.75,
		processingTime: 45,
	});

	ModelRegistry.register({
		key: "fabric_1_0_fast",
		name: "VEED Fabric 1.0 Fast",
		provider: "VEED",
		endpoint: "veed/fabric-1.0/fast",
		categories: ["avatar"],
		description: "Speed-optimized lip-sync avatar generation",
		pricing: { "480p": 0.1, "720p": 0.19 },
		resolutions: ["480p", "720p"],
		defaults: { resolution: "720p" },
		features: ["lipsync", "fast_processing"],
		maxDuration: 120,
		inputRequirements: {
			required: ["image_url", "audio_url", "resolution"],
			optional: [],
		},
		costEstimate: 0.94,
		processingTime: 30,
	});

	ModelRegistry.register({
		key: "fabric_1_0_text",
		name: "VEED Fabric 1.0 Text-to-Speech",
		provider: "VEED",
		endpoint: "veed/fabric-1.0/text",
		categories: ["avatar"],
		description: "Text-to-speech + lip-sync avatar generation",
		pricing: { "480p": 0.08, "720p": 0.15 },
		resolutions: ["480p", "720p"],
		defaults: { resolution: "720p" },
		features: ["text_to_speech", "lipsync"],
		maxDuration: 120,
		inputRequirements: {
			required: ["image_url", "text", "resolution"],
			optional: ["voice_description"],
		},
		costEstimate: 0.75,
		processingTime: 50,
	});

	ModelRegistry.register({
		key: "kling_ref_to_video",
		name: "Kling O1 Reference-to-Video",
		provider: "Kuaishou",
		endpoint: "fal-ai/kling-video/o1/standard/reference-to-video",
		categories: ["avatar"],
		description: "Character consistency with reference image",
		pricing: { per_second: 0.112 },
		durationOptions: ["5", "10"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		defaults: { duration: "5", aspect_ratio: "16:9" },
		features: ["character_consistency", "reference_image"],
		maxDuration: 10,
		inputRequirements: {
			required: ["prompt", "reference_images"],
			optional: ["duration", "aspect_ratio", "audio_url", "face_id"],
		},
		costEstimate: 0.56,
		processingTime: 90,
	});

	ModelRegistry.register({
		key: "kling_v2v_reference",
		name: "Kling O1 V2V Reference",
		provider: "Kuaishou",
		endpoint: "fal-ai/kling-video/o1/standard/video-to-video/reference",
		categories: ["avatar"],
		description: "Style-guided video transformation",
		pricing: { per_second: 0.168 },
		durationOptions: ["5", "10"],
		aspectRatios: ["16:9", "9:16", "1:1"],
		defaults: { duration: "5", aspect_ratio: "16:9" },
		features: ["style_transfer", "video_reference"],
		maxDuration: 10,
		inputRequirements: {
			required: ["prompt", "video_url"],
			optional: ["duration", "aspect_ratio", "audio_url", "face_id"],
		},
		costEstimate: 0.84,
		processingTime: 90,
	});

	ModelRegistry.register({
		key: "kling_v2v_edit",
		name: "Kling O1 V2V Edit",
		provider: "Kuaishou",
		endpoint: "fal-ai/kling-video/o1/standard/video-to-video/edit",
		categories: ["avatar"],
		description: "Targeted video editing with prompts",
		pricing: { per_second: 0.168 },
		aspectRatios: ["16:9", "9:16", "1:1"],
		defaults: { aspect_ratio: "16:9" },
		features: ["video_editing", "prompt_based"],
		maxDuration: 10,
		inputRequirements: {
			required: ["video_url", "prompt"],
			optional: ["mask_url"],
		},
		costEstimate: 0.84,
		processingTime: 60,
	});

	ModelRegistry.register({
		key: "kling_motion_control",
		name: "Kling v2.6 Motion Control",
		provider: "Kuaishou",
		endpoint: "fal-ai/kling-video/v2.6/standard/motion-control",
		categories: ["avatar", "motion_transfer"],
		description: "Motion transfer from video to image",
		pricing: { per_second: 0.06 },
		defaults: { character_orientation: "video", keep_original_sound: true },
		features: ["motion_transfer", "audio_preservation"],
		maxDuration: 30,
		inputRequirements: {
			required: ["image_url", "video_url"],
			optional: ["character_orientation", "keep_original_sound", "prompt"],
		},
		modelInfo: { max_durations: { video: 30, image: 10 } },
		costEstimate: 0.6,
		processingTime: 60,
	});

	ModelRegistry.register({
		key: "multitalk",
		name: "AI Avatar Multi (FAL)",
		provider: "FAL AI",
		endpoint: "fal-ai/ai-avatar/multi",
		categories: ["avatar"],
		description: "Multi-person conversational avatar generation",
		pricing: {
			base: 0.1,
			"720p_multiplier": 2.0,
			extended_frames_multiplier: 1.25,
		},
		resolutions: ["480p", "720p"],
		defaults: { num_frames: 81, resolution: "480p", acceleration: "regular" },
		features: ["multi_person", "conversation", "audio_driven"],
		maxDuration: 60,
		inputRequirements: {
			required: ["image_url", "first_audio_url", "prompt"],
			optional: [
				"second_audio_url",
				"num_frames",
				"resolution",
				"seed",
				"acceleration",
				"use_only_first_audio",
			],
		},
		costEstimate: 0.1,
		processingTime: 60,
	});

	ModelRegistry.register({
		key: "grok_video_edit",
		name: "xAI Grok Video Edit",
		provider: "xAI (via FAL)",
		endpoint: "xai/grok-imagine-video/edit-video",
		categories: ["avatar"],
		description: "Video editing with AI-powered prompts",
		pricing: { input_per_second: 0.01, output_per_second: 0.05 },
		resolutions: ["auto", "480p", "720p"],
		defaults: { resolution: "auto" },
		features: ["video_editing", "prompt_based", "colorize"],
		maxDuration: 8,
		inputRequirements: {
			required: ["video_url", "prompt"],
			optional: ["resolution"],
		},
		costEstimate: 0.36,
		processingTime: 45,
	});

	ModelRegistry.register({
		key: "grok_imagine_r2v",
		name: "xAI Grok Imagine Reference-to-Video",
		provider: "xAI (via FAL)",
		endpoint: "xai/grok-imagine-video/reference-to-video",
		categories: ["avatar"],
		description:
			"Reference-to-video using up to 7 images to guide generation with @Image syntax",
		pricing: 0.05,
		resolutions: ["480p", "720p"],
		defaults: { duration: 8, resolution: "480p", aspect_ratio: "16:9" },
		features: ["reference_images", "flexible_duration"],
		maxDuration: 10,
		inputRequirements: {
			required: ["reference_image_urls", "prompt"],
			optional: ["duration", "aspect_ratio", "resolution"],
		},
		costEstimate: 0.302,
		processingTime: 60,
	});
}
