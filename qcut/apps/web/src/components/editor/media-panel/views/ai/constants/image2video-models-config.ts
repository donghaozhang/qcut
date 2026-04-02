/**
 * Image-to-Video Model Configuration
 * Defines image-to-video models and their capabilities.
 */

import type { AIModel } from "../types/ai-types";
import { validateModelOrderInvariant } from "./model-config-validation";

/**
 * Image-to-video model definitions.
 *
 * Models that animate static images into dynamic videos, including:
 * - Standard image animation
 * - Frame-to-frame interpolation (first + last frame → video)
 * - Multi-resolution support (480p to 4K)
 * - Various duration options (2-20 seconds)
 *
 * Single source of truth for all I2V model configurations.
 */
export const I2V_MODELS = {
	sora2_image_to_video: {
		id: "sora2_image_to_video",
		name: "Sora 2 Image-to-Video",
		description: "Convert images to dynamic videos with Sora 2 (720p)",
		price: "0.10/s",
		resolution: "720p",
		max_duration: 12,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/sora-2/image-to-video",
		},
		default_params: {
			duration: 4,
			resolution: "auto",
			aspect_ratio: "auto",
		},
	},
	sora2_image_to_video_pro: {
		id: "sora2_image_to_video_pro",
		name: "Sora 2 Image-to-Video Pro",
		badge: "⭐ Recommended",
		description: "High-quality image-to-video with 1080p support",
		price: "0.30-0.50",
		resolution: "720p / 1080p",
		supportedResolutions: ["720p", "1080p"],
		max_duration: 12,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/sora-2/image-to-video/pro",
		},
		default_params: {
			duration: 4,
			resolution: "auto",
			aspect_ratio: "auto",
		},
	},
	kling_v3_pro_i2v: {
		id: "kling_v3_pro_i2v",
		name: "Kling v3 Pro I2V",
		description:
			"Professional image-to-video with cinematic visuals, fluid motion, native audio, and custom element support",
		price: "0.336",
		resolution: "1080p",
		max_duration: 12,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/kling-video/v3/pro/image-to-video",
		},
		default_params: {
			duration: 5,
			aspect_ratio: "16:9",
			cfg_scale: 0.5,
			generate_audio: true,
			negative_prompt: "blur, distort, and low quality",
		},
		supportedDurations: [5, 10, 12],
		supportedAspectRatios: ["16:9", "9:16", "1:1"],
	},
	kling_v3_standard_i2v: {
		id: "kling_v3_standard_i2v",
		name: "Kling v3 Standard I2V",
		badge: "🎬 Cinematic",
		description:
			"Quality image-to-video with cinematic motion and native audio, cost-effective option",
		price: "0.252",
		resolution: "1080p",
		max_duration: 12,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/kling-video/v3/standard/image-to-video",
		},
		default_params: {
			duration: 5,
			aspect_ratio: "16:9",
			cfg_scale: 0.5,
			generate_audio: true,
			negative_prompt: "blur, distort, and low quality",
		},
		supportedDurations: [5, 10, 12],
		supportedAspectRatios: ["16:9", "9:16", "1:1"],
	},
	kling_v26_pro_i2v: {
		id: "kling_v26_pro_i2v",
		name: "Kling v2.6 Pro I2V",
		description:
			"Top-tier image-to-video with cinematic visuals and native audio generation",
		price: "0.70",
		resolution: "1080p",
		max_duration: 10,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/kling-video/v2.6/pro/image-to-video",
		},
		default_params: {
			duration: 5,
			aspect_ratio: "16:9",
			cfg_scale: 0.5,
			generate_audio: true,
			negative_prompt: "blur, distort, and low quality",
		},
		supportedDurations: [5, 10],
		supportedAspectRatios: ["16:9", "9:16", "1:1"],
	},
	ltxv2_i2v: {
		id: "ltxv2_i2v",
		name: "LTX Video 2.0 I2V",
		description: "Image-to-video with audio generation (6-10s, up to 4K)",
		price: "0.36",
		resolution: "1080p",
		max_duration: 10,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/ltxv-2/image-to-video",
		},
		default_params: {
			duration: 6,
			resolution: "1080p",
			aspect_ratio: "16:9",
			fps: 25,
			generate_audio: true,
		},
		supportedResolutions: ["1080p", "1440p", "2160p"],
		supportedDurations: [6, 8, 10],
	},
	ltxv2_fast_i2v: {
		id: "ltxv2_fast_i2v",
		name: "LTX Video 2.0 Fast I2V",
		badge: "⚡ Fast",
		description: "Image-to-video with audio generation (6-20s, up to 4K)",
		price: "0.04-0.16",
		resolution: "1080p",
		max_duration: 20,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/ltxv-2/image-to-video/fast",
		},
		default_params: {
			duration: 6,
			resolution: "1080p",
			aspect_ratio: "16:9",
			fps: 25,
			generate_audio: true,
		},
		supportedResolutions: ["1080p", "1440p", "2160p"],
		supportedDurations: [6, 8, 10, 12, 14, 16, 18, 20],
	},
	ltx23_fast_i2v: {
		id: "ltx23_fast_i2v",
		name: "LTX Video 2.3 Fast I2V",
		description:
			"Image-to-video with 4K, audio, and end-frame transitions (6-20s)",
		price: "0.04-0.16",
		resolution: "1080p",
		max_duration: 20,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/ltx-2.3/image-to-video/fast",
		},
		default_params: {
			duration: 6,
			resolution: "1080p",
			aspect_ratio: "16:9",
			fps: 25,
			generate_audio: true,
		},
		supportedResolutions: ["1080p", "1440p", "2160p"],
		supportedDurations: [6, 8, 10, 12, 14, 16, 18, 20],
		supportedAspectRatios: ["16:9", "9:16", "auto"],
		perSecondPricing: {
			"1080p": 0.04,
			"1440p": 0.08,
			"2160p": 0.16,
		},
	},
	seedance_pro_fast_i2v: {
		id: "seedance_pro_fast_i2v",
		name: "Seedance v1 Pro Fast I2V",
		description:
			"Fast image-to-video generation with balanced quality and speed (2-12s)",
		price: "0.24",
		resolution: "480p / 720p / 1080p",
		max_duration: 12,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/bytedance/seedance/v1/pro/fast/image-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "1080p",
			aspect_ratio: "16:9",
			camera_fixed: false,
			enable_safety_checker: false,
		},
		supportedResolutions: ["480p", "720p", "1080p"],
		supportedDurations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
		supportedAspectRatios: [
			"21:9",
			"16:9",
			"4:3",
			"1:1",
			"3:4",
			"9:16",
			"auto",
		],
	},
	seedance_pro_i2v: {
		id: "seedance_pro_i2v",
		name: "Seedance v1 Pro I2V",
		description: "Premium quality image-to-video with highest fidelity (2-12s)",
		price: "0.62",
		resolution: "480p / 720p / 1080p",
		max_duration: 12,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "1080p",
			aspect_ratio: "16:9",
			camera_fixed: false,
			enable_safety_checker: false,
		},
		supportedResolutions: ["480p", "720p", "1080p"],
		supportedDurations: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
		supportedAspectRatios: [
			"21:9",
			"16:9",
			"4:3",
			"1:1",
			"3:4",
			"9:16",
			"auto",
		],
	},
	kling_v2_5_turbo_i2v: {
		id: "kling_v2_5_turbo_i2v",
		name: "Kling v2.5 Turbo Pro I2V",
		description:
			"Top-tier Kling model with cinematic motion and multi-ratio output",
		price: "0.35",
		resolution: "1080p",
		max_duration: 10,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "1080p",
			aspect_ratio: "16:9",
			cfg_scale: 0.5,
			enhance_prompt: true,
			negative_prompt: "blur, distort, low quality",
		},
		supportedResolutions: ["1080p"],
		supportedDurations: [5, 10],
		supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
	},
	wan_25_preview_i2v: {
		id: "wan_25_preview_i2v",
		name: "WAN v2.5 Preview I2V",
		description:
			"Animate images with WAN 2.5 Preview, optional music + prompt expansion",
		price: "0.05-0.15/s",
		resolution: "480p / 720p / 1080p",
		max_duration: 10,
		category: "image",
		endpoints: {
			image_to_video: "wan-25-preview/image-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "1080p",
			enable_prompt_expansion: true,
		},
		supportedResolutions: ["480p", "720p", "1080p"],
		supportedDurations: [5, 10],
		perSecondPricing: {
			"480p": 0.05,
			"720p": 0.1,
			"1080p": 0.15,
		},
	},
	wan_26_i2v: {
		id: "wan_26_i2v",
		name: "WAN v2.6 I2V",
		badge: "💰 Budget",
		description:
			"Animate images with WAN 2.6 - 15s duration, audio sync, multi-shot support",
		price: "0.10-0.15/s",
		resolution: "720p / 1080p",
		max_duration: 15,
		category: "image",
		endpoints: {
			image_to_video: "wan/v2.6/image-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "1080p",
			aspect_ratio: "16:9",
			enable_prompt_expansion: true,
		},
		supportedResolutions: ["720p", "1080p"],
		supportedDurations: [5, 10, 15],
		supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
		perSecondPricing: {
			"720p": 0.1,
			"1080p": 0.15,
		},
	},
	veo31_fast_image_to_video: {
		id: "veo31_fast_image_to_video",
		name: "Veo 3.1 Fast Image-to-Video",
		description:
			"Google's Veo 3.1 Fast - Animate static images with motion (faster, budget-friendly)",
		price: "1.20",
		resolution: "720p / 1080p",
		supportedResolutions: ["720p", "1080p"],
		max_duration: 8,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/veo3.1/fast/image-to-video",
		},
		default_params: {
			duration: 8,
			resolution: "720p",
			aspect_ratio: "16:9",
			generate_audio: true,
		},
	},
	veo31_fast_frame_to_video: {
		id: "veo31_fast_frame_to_video",
		name: "Veo 3.1 Fast Frame-to-Video",
		description:
			"Google's Veo 3.1 Fast - Animate between first and last frames (faster, budget-friendly)",
		price: "1.20",
		resolution: "720p / 1080p",
		supportedResolutions: ["720p", "1080p"],
		max_duration: 8,
		category: "image",
		requiredInputs: ["firstFrame", "lastFrame"],
		endpoints: {
			image_to_video: "fal-ai/veo3.1/fast/first-last-frame-to-video",
		},
		default_params: {
			duration: 8,
			resolution: "720p",
			aspect_ratio: "auto",
			generate_audio: true,
		},
	},
	veo31_image_to_video: {
		id: "veo31_image_to_video",
		name: "Veo 3.1 Image-to-Video",
		description:
			"Google's Veo 3.1 - Premium quality image animation with motion",
		price: "3.20",
		resolution: "720p / 1080p",
		supportedResolutions: ["720p", "1080p"],
		max_duration: 8,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/veo3.1/image-to-video",
		},
		default_params: {
			duration: 8,
			resolution: "720p",
			aspect_ratio: "16:9",
			generate_audio: true,
		},
	},
	veo31_frame_to_video: {
		id: "veo31_frame_to_video",
		name: "Veo 3.1 Frame-to-Video",
		description:
			"Google's Veo 3.1 - Premium quality animation between first and last frames",
		price: "3.20",
		resolution: "720p / 1080p",
		supportedResolutions: ["720p", "1080p"],
		max_duration: 8,
		category: "image",
		requiredInputs: ["firstFrame", "lastFrame"],
		endpoints: {
			image_to_video: "fal-ai/veo3.1/first-last-frame-to-video",
		},
		default_params: {
			duration: 8,
			resolution: "720p",
			aspect_ratio: "16:9",
			generate_audio: true,
		},
	},
	hailuo23_standard: {
		id: "hailuo23_standard",
		name: "Hailuo 2.3 Standard",
		description: "Budget-friendly image-to-video with 768p quality",
		price: "0.28-0.56",
		resolution: "768p",
		max_duration: 10,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/minimax/hailuo-2.3/standard/image-to-video",
		},
		default_params: {
			duration: 6,
			resolution: "768p",
			prompt_optimizer: true,
		},
	},
	hailuo23_fast_pro: {
		id: "hailuo23_fast_pro",
		name: "Hailuo 2.3 Fast Pro",
		description: "Balanced 1080p image-to-video with faster generation",
		price: "0.33",
		resolution: "1080p",
		max_duration: 10,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video",
		},
		default_params: {
			duration: 6,
			resolution: "1080p",
			prompt_optimizer: true,
		},
	},
	hailuo23_pro: {
		id: "hailuo23_pro",
		name: "Hailuo 2.3 Pro",
		description: "Premium 1080p image-to-video with highest fidelity",
		price: "0.49",
		resolution: "1080p",
		max_duration: 10,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/minimax/hailuo-2.3/pro/image-to-video",
		},
		default_params: {
			duration: 6,
			resolution: "1080p",
			prompt_optimizer: true,
		},
	},
	vidu_q2_turbo_i2v: {
		id: "vidu_q2_turbo_i2v",
		name: "Vidu Q2 Turbo I2V",
		description: "High-quality image-to-video with motion control (2-8s)",
		price: "0.05",
		resolution: "720p",
		max_duration: 8,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/vidu/q2/image-to-video/turbo",
		},
		default_params: {
			duration: 4,
			resolution: "720p",
			movement_amplitude: "auto",
		},
	},
	kling_o1_i2v: {
		id: "kling_o1_i2v",
		name: "Kling O1 Image-to-Video",
		description:
			"Animate transitions between start and end frames with cinematic motion",
		price: "0.112",
		resolution: "1080p",
		max_duration: 10,
		category: "image",
		requiredInputs: ["firstFrame"],
		endpoints: {
			image_to_video: "fal-ai/kling-video/o1/image-to-video",
		},
		default_params: {
			duration: 5,
		},
		supportedDurations: [5, 10],
	},
	vidu_q3_i2v: {
		id: "vidu_q3_i2v",
		name: "Vidu Q3 Image-to-Video",
		description:
			"Animate images with audio generation and multi-resolution support",
		price: "0.07-0.154/s",
		resolution: "720p",
		max_duration: 16,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/vidu/q3/image-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "720p",
			generate_audio: true,
		},
		supportedResolutions: ["360p", "540p", "720p", "1080p"],
		supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
		perSecondPricing: {
			"360p": 0.07,
			"540p": 0.07,
			"720p": 0.154,
			"1080p": 0.154,
		},
	},
	veo31_lite_image_to_video: {
		id: "veo31_lite_image_to_video",
		name: "Veo 3.1 Lite Image-to-Video",
		description:
			"Google's Veo 3.1 Lite — budget image animation with audio (4-8s)",
		price: "0.05-0.08/s",
		resolution: "720p / 1080p",
		supportedResolutions: ["720p", "1080p"],
		max_duration: 8,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/veo3.1/lite/image-to-video",
		},
		default_params: {
			duration: 8,
			resolution: "720p",
			aspect_ratio: "auto",
			generate_audio: true,
		},
		perSecondPricing: {
			"720p": 0.05,
			"1080p": 0.08,
		},
	},
	veo31_lite_frame_to_video: {
		id: "veo31_lite_frame_to_video",
		name: "Veo 3.1 Lite Frame-to-Video",
		description:
			"Google's Veo 3.1 Lite — budget first+last frame animation with audio",
		price: "0.05-0.08/s",
		resolution: "720p / 1080p",
		supportedResolutions: ["720p", "1080p"],
		max_duration: 8,
		category: "image",
		requiredInputs: ["firstFrame", "lastFrame"],
		endpoints: {
			image_to_video: "fal-ai/veo3.1/lite/first-last-frame-to-video",
		},
		default_params: {
			duration: 8,
			resolution: "720p",
			aspect_ratio: "auto",
			generate_audio: true,
		},
		perSecondPricing: {
			"720p": 0.05,
			"1080p": 0.08,
		},
	},
	pixverse_v6_i2v: {
		id: "pixverse_v6_i2v",
		name: "PixVerse v6",
		description:
			"Stylized image-to-video with audio generation and style presets (1-15s)",
		price: "0.045-0.09/s",
		resolution: "1080p",
		max_duration: 15,
		category: "image",
		endpoints: {
			image_to_video: "fal-ai/pixverse/v6/image-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "720p",
			thinking_type: "auto",
		},
		supportedResolutions: ["360p", "540p", "720p", "1080p"],
		supportedDurations: [5, 8, 10, 15],
		perSecondPricing: {
			"360p": 0.025,
			"540p": 0.035,
			"720p": 0.045,
			"1080p": 0.09,
		},
	},
} as const satisfies Record<string, AIModel>;

/**
 * Image-to-Video model identifier type derived from I2V_MODELS keys.
 * Ensures type safety when referencing I2V models throughout the application.
 */
export type I2VModelId = keyof typeof I2V_MODELS;

/**
 * Priority order for displaying I2V models in the UI.
 * Models are ordered by quality/capability (highest first) to guide user selection.
 */
export const I2V_MODEL_ORDER: readonly I2VModelId[] = [
	// Badged picks — always on top
	"sora2_image_to_video_pro", // ⭐ Recommended
	"ltxv2_fast_i2v", // ⚡ Fast
	"wan_26_i2v", // 💰 Budget
	"kling_v3_standard_i2v", // 🎬 Cinematic
	// Everything else
	"kling_v3_pro_i2v",
	"kling_v26_pro_i2v",
	"veo31_image_to_video",
	"ltx23_fast_i2v",
	"ltxv2_i2v",
	"hailuo23_pro",
	"seedance_pro_i2v",
	"veo31_fast_image_to_video",
	"kling_v2_5_turbo_i2v",
	"seedance_pro_fast_i2v",
	"hailuo23_fast_pro",
	"pixverse_v6_i2v",
	"sora2_image_to_video",
	"hailuo23_standard",
	"wan_25_preview_i2v",
	"vidu_q2_turbo_i2v",
	"vidu_q3_i2v",
	"veo31_lite_image_to_video",
	"veo31_frame_to_video",
	"veo31_fast_frame_to_video",
	"veo31_lite_frame_to_video",
	"kling_o1_i2v",
] as const;

validateModelOrderInvariant({
	category: "I2V",
	models: I2V_MODELS,
	order: I2V_MODEL_ORDER,
});

/**
 * Get I2V models in priority order for UI rendering.
 */
export function getI2VModelsInOrder(): Array<[I2VModelId, AIModel]> {
	return I2V_MODEL_ORDER.map((id) => [id, I2V_MODELS[id]]);
}
