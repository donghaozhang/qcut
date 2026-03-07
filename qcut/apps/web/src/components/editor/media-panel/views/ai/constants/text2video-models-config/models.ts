/**
 * Text-to-Video Model Definitions
 * Single source of truth for all T2V model configurations.
 */

import type { AIModel } from "../../types/ai-types";

/**
 * Text-to-video model definitions.
 *
 * Models that generate videos from text prompts, including:
 * - Multiple quality tiers (standard, pro, turbo)
 * - Various resolutions (480p to 4K)
 * - Different duration options (2-20 seconds)
 * - Advanced features (audio generation, negative prompts, etc.)
 *
 * Single source of truth for all T2V model configurations.
 */
export const T2V_MODELS = {
	sora2_text_to_video: {
		id: "sora2_text_to_video",
		name: "Sora 2 Text-to-Video",
		description: "OpenAI's state-of-the-art text-to-video generation (720p)",
		price: "0.10/s",
		resolution: "720p",
		max_duration: 12,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/sora-2/text-to-video",
		},
		default_params: {
			duration: 4,
			resolution: "720p",
			aspect_ratio: "16:9",
		},
	},
	sora2_text_to_video_pro: {
		id: "sora2_text_to_video_pro",
		name: "Sora 2 Text-to-Video Pro",
		badge: "\u2B50 Recommended",
		description: "High-quality text-to-video with 1080p support",
		price: "0.30-0.50",
		resolution: "720p / 1080p",
		supportedResolutions: ["720p", "1080p"],
		max_duration: 12,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/sora-2/text-to-video/pro",
		},
		default_params: {
			duration: 4,
			resolution: "1080p",
			aspect_ratio: "16:9",
		},
	},
	kling_v3_pro_t2v: {
		id: "kling_v3_pro_t2v",
		name: "Kling v3 Pro T2V",
		description:
			"Top-tier text-to-video with cinematic visuals, fluid motion, and native audio generation with multi-shot support",
		price: "0.336",
		resolution: "1080p",
		max_duration: 15,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/kling-video/v3/pro/text-to-video",
		},
		default_params: {
			duration: 5,
			aspect_ratio: "16:9",
			generate_audio: true,
		},
		supportedDurations: [5, 10, 15],
		supportedAspectRatios: ["16:9", "9:16", "1:1"],
	},
	kling_v3_standard_t2v: {
		id: "kling_v3_standard_t2v",
		name: "Kling v3 Standard T2V",
		badge: "\uD83C\uDFBC Cinematic",
		description:
			"High-quality text-to-video with cinematic visuals and native audio generation, cost-effective option",
		price: "0.252",
		resolution: "1080p",
		max_duration: 15,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/kling-video/v3/standard/text-to-video",
		},
		default_params: {
			duration: 5,
			aspect_ratio: "16:9",
			generate_audio: true,
		},
		supportedDurations: [3, 5, 10, 15],
		supportedAspectRatios: ["16:9", "9:16", "1:1"],
	},
	kling_v26_pro_t2v: {
		id: "kling_v26_pro_t2v",
		name: "Kling v2.6 Pro T2V",
		description:
			"Top-tier text-to-video with cinematic visuals and native audio generation",
		price: "0.70",
		resolution: "1080p",
		max_duration: 10,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/kling-video/v2.6/pro/text-to-video",
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
	wan_26_t2v: {
		id: "wan_26_t2v",
		name: "WAN v2.6 T2V",
		badge: "\uD83D\uDCB0 Budget",
		description:
			"Latest WAN model with 15s duration, multi-shot support, and audio sync",
		price: "0.75",
		resolution: "720p / 1080p",
		max_duration: 15,
		category: "text",
		endpoints: {
			text_to_video: "wan/v2.6/text-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "1080p",
			aspect_ratio: "16:9",
			enable_prompt_expansion: true,
			multi_shots: false,
		},
		supportedResolutions: ["720p", "1080p"],
		supportedDurations: [5, 10, 15],
		supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
		perSecondPricing: {
			"720p": 0.1,
			"1080p": 0.15,
		},
	},
	ltxv2_pro_t2v: {
		id: "ltxv2_pro_t2v",
		name: "LTX Video 2.0 Pro T2V",
		description: "Text-to-video with audio generation (6-10s, up to 4K)",
		price: "0.06",
		resolution: "1080p",
		max_duration: 10,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/ltxv-2/text-to-video",
		},
		default_params: {
			duration: 6,
			resolution: "1080p",
			aspect_ratio: "16:9",
			fps: 25,
			generate_audio: true,
		},
		supportedResolutions: ["1080p", "1440p", "2160p"],
	},
	ltxv2_fast_t2v: {
		id: "ltxv2_fast_t2v",
		name: "LTX Video 2.0 Fast T2V",
		badge: "\u26A1 Fast",
		description: "Text-to-video with audio generation (6-20s, up to 4K)",
		price: "0.04-0.16",
		resolution: "1080p",
		max_duration: 20,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/ltxv-2/text-to-video/fast",
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
	ltx23_pro_t2v: {
		id: "ltx23_pro_t2v",
		name: "LTX Video 2.3 Pro T2V",
		description: "Text-to-video with native audio and 4K support (6-10s)",
		price: "0.06-0.24",
		resolution: "1080p",
		max_duration: 10,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/ltx-2.3/text-to-video",
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
		perSecondPricing: {
			"1080p": 0.06,
			"1440p": 0.12,
			"2160p": 0.24,
		},
	},
	ltx23_fast_t2v: {
		id: "ltx23_fast_t2v",
		name: "LTX Video 2.3 Fast T2V",
		badge: "\u26A1 Fast",
		description:
			"Fast text-to-video with 4K support and native audio, up to 20s",
		price: "0.04-0.16",
		resolution: "1080p",
		max_duration: 20,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/ltx-2.3/text-to-video/fast",
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
		perSecondPricing: {
			"1080p": 0.04,
			"1440p": 0.08,
			"2160p": 0.16,
		},
	},
	veo31_fast_text_to_video: {
		id: "veo31_fast_text_to_video",
		name: "Veo 3.1 Fast Text-to-Video",
		description:
			"Google's Veo 3.1 Fast - Generate videos from text prompts (faster, budget-friendly)",
		price: "1.20",
		resolution: "720p / 1080p",
		supportedResolutions: ["720p", "1080p"],
		max_duration: 8,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/veo3.1/fast",
		},
		default_params: {
			duration: 8,
			resolution: "720p",
			aspect_ratio: "16:9",
			generate_audio: true,
			enhance_prompt: true,
			auto_fix: true,
		},
	},
	veo31_text_to_video: {
		id: "veo31_text_to_video",
		name: "Veo 3.1 Text-to-Video",
		description:
			"Google's Veo 3.1 - Premium quality video generation from text prompts",
		price: "3.20",
		resolution: "720p / 1080p",
		supportedResolutions: ["720p", "1080p"],
		max_duration: 8,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/veo3.1",
		},
		default_params: {
			duration: 8,
			resolution: "720p",
			aspect_ratio: "16:9",
			generate_audio: true,
			enhance_prompt: true,
			auto_fix: true,
		},
	},
	hailuo23_standard_t2v: {
		id: "hailuo23_standard_t2v",
		name: "Hailuo 2.3 Standard T2V",
		description: "Budget-friendly text-to-video with 768p quality",
		price: "0.28-0.56",
		resolution: "768p",
		max_duration: 10,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/minimax/hailuo-2.3/standard/text-to-video",
		},
		default_params: {
			duration: 6,
			resolution: "768p",
			prompt_optimizer: true,
		},
	},
	hailuo23_pro_t2v: {
		id: "hailuo23_pro_t2v",
		name: "Hailuo 2.3 Pro T2V",
		description:
			"Premium 1080p text-to-video with cinematic camera control (use [Pan left], [Zoom in] in prompts)",
		price: "0.49",
		resolution: "1080p",
		max_duration: 10,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/minimax/hailuo-2.3/pro/text-to-video",
		},
		default_params: {
			duration: 6,
			resolution: "1080p",
			prompt_optimizer: true,
		},
	},
	seedance: {
		id: "seedance",
		name: "Seedance v1 Lite",
		description: "Fast and efficient text-to-video generation",
		price: "0.18",
		resolution: "720p",
		max_duration: 10,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/bytedance/seedance/v1/lite/text-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "720p",
		},
	},
	seedance_pro: {
		id: "seedance_pro",
		name: "Seedance v1 Pro",
		description: "High quality 1080p video generation",
		price: "0.62",
		resolution: "1080p",
		max_duration: 10,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/bytedance/seedance/v1/pro/text-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "1080p",
		},
	},
	wan_25_preview: {
		id: "wan_25_preview",
		name: "WAN v2.5 Preview",
		description: "Next-generation WAN model with improved quality",
		price: "0.12",
		resolution: "1080p",
		max_duration: 10,
		category: "text",
		endpoints: {
			text_to_video: "wan-25-preview/text-to-video",
			image_to_video: "wan-25-preview/image-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "1080p",
			quality: "high",
			style_preset: "cinematic",
		},
	},
	kling_v2_5_turbo: {
		id: "kling_v2_5_turbo",
		name: "Kling v2.5 Turbo Pro",
		description: "Latest Kling model with enhanced turbo performance",
		price: "0.18",
		resolution: "1080p",
		max_duration: 10,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video",
			image_to_video: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "1080p",
			cfg_scale: 0.5,
			aspect_ratio: "16:9",
			enhance_prompt: true,
		},
	},
	kling_v2_5_turbo_standard: {
		id: "kling_v2_5_turbo_standard",
		name: "Kling v2.5 Turbo Standard",
		description: "Standard Kling model for efficient text-to-video",
		price: "0.10",
		resolution: "720p",
		max_duration: 10,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/kling-video/v2.5-turbo/standard/text-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "720p",
			aspect_ratio: "16:9",
		},
	},
	vidu_q3_t2v: {
		id: "vidu_q3_t2v",
		name: "Vidu Q3 Text-to-Video",
		description:
			"High-quality text-to-video with audio generation and multi-resolution support",
		price: "0.07-0.154/s",
		resolution: "720p",
		max_duration: 16,
		category: "text",
		endpoints: {
			text_to_video: "fal-ai/vidu/q3/text-to-video",
		},
		default_params: {
			duration: 5,
			resolution: "720p",
			aspect_ratio: "16:9",
		},
		supportedResolutions: ["360p", "540p", "720p", "1080p"],
		supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
		supportedAspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1"],
		perSecondPricing: {
			"360p": 0.07,
			"540p": 0.07,
			"720p": 0.154,
			"1080p": 0.154,
		},
	},
} as const satisfies Record<string, AIModel>;

/**
 * Text-to-Video model identifier type derived from T2V_MODELS keys.
 * Ensures type safety when referencing T2V models throughout the application.
 */
export type T2VModelId = keyof typeof T2V_MODELS;
