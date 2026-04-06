/**
 * Avatar Model Configuration
 * Defines avatar/talking-head models and video transformation models.
 */

import type { AIModel } from "../types/ai-types";
import { validateModelOrderInvariant } from "./model-config-validation";

/**
 * Avatar and video transformation model definitions.
 *
 * Includes models for:
 * - Talking head/avatar generation (character image + audio → video)
 * - Video-to-video transformation and editing
 * - Reference-based video generation
 * - Video extension and continuation
 *
 * Single source of truth for all avatar model configurations.
 */
export const AVATAR_MODELS = {
	wan_26_ref2v: {
		id: "wan_26_ref2v",
		name: "WAN v2.6 Ref2V",
		description:
			"Generate videos guided by reference video clips - transfers motion/style to new content",
		price: "0.10-0.15/s",
		resolution: "720p / 1080p",
		max_duration: 15,
		category: "avatar",
		requiredInputs: ["sourceVideo"],
		endpoints: {
			reference_to_video: "wan/v2.6/reference-to-video",
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
	wan_animate_replace: {
		id: "wan_animate_replace",
		name: "WAN Animate/Replace",
		description: "Replace characters in existing videos",
		price: "0.075",
		resolution: "480p-720p",
		max_duration: 30,
		category: "avatar",
		requiredInputs: ["characterImage", "sourceVideo"],
		endpoints: {
			text_to_video: "wan/v2.2-14b/animate/replace",
		},
		default_params: {
			resolution: "480p",
			video_quality: "high",
		},
	},
	kling_avatar_v2_standard: {
		id: "kling_avatar_v2_standard",
		name: "Kling Avatar v2 Standard",
		badge: "⚡ Fast",
		description:
			"Create talking avatar videos with realistic humans, animals, cartoons, or stylized characters. Audio-synchronized lip-sync.",
		price: "0.0562",
		resolution: "1080p",
		max_duration: 60,
		category: "avatar",
		requiredInputs: ["characterImage", "audioFile"],
		endpoints: {
			text_to_video: "fal-ai/kling-video/ai-avatar/v2/standard",
		},
		default_params: {
			prompt: "",
			resolution: "1080p",
		},
		perSecondPricing: {
			"1080p": 0.0562,
		},
		audioConstraints: {
			minDurationSec: 2,
			maxDurationSec: 60,
			maxFileSizeBytes: 5 * 1024 * 1024,
		},
	},
	kling_avatar_v2_pro: {
		id: "kling_avatar_v2_pro",
		name: "Kling Avatar v2 Pro",
		badge: "⭐ Recommended",
		description:
			"Premium avatar video generation with enhanced quality and realism. Ideal for professional productions.",
		price: "0.115",
		resolution: "1080p",
		max_duration: 60,
		category: "avatar",
		requiredInputs: ["characterImage", "audioFile"],
		endpoints: {
			text_to_video: "fal-ai/kling-video/ai-avatar/v2/pro",
		},
		default_params: {
			prompt: "",
			resolution: "1080p",
		},
		perSecondPricing: {
			"1080p": 0.115,
		},
		audioConstraints: {
			minDurationSec: 2,
			maxDurationSec: 60,
			maxFileSizeBytes: 5 * 1024 * 1024,
		},
	},
	sync_lipsync_react1: {
		id: "sync_lipsync_react1",
		name: "Sync Lipsync React-1",
		badge: "💰 Budget",
		description:
			"Emotion-aware lip-sync: sync video to audio with expressions (happy, sad, angry, etc.)",
		price: "0.10",
		resolution: "Preserves source",
		max_duration: 15,
		category: "avatar",
		requiredInputs: ["sourceVideo", "audioFile"],
		endpoints: {
			text_to_video: "fal-ai/sync-lipsync/react-1",
		},
		default_params: {
			emotion: "neutral",
			model_mode: "face",
			lipsync_mode: "bounce",
			temperature: 0.5,
		},
		supportedEmotions: [
			"happy",
			"angry",
			"sad",
			"neutral",
			"disgusted",
			"surprised",
		],
		supportedModelModes: ["lips", "face", "head"],
		supportedLipsyncModes: ["cut_off", "loop", "bounce", "silence", "remap"],
	},
	kling_o1_v2v_reference: {
		id: "kling_o1_v2v_reference",
		name: "Kling O1 Video Reference",
		description:
			"Generate new shots guided by input reference video, preserving motion and camera style",
		price: "0.112",
		resolution: "1080p",
		max_duration: 10,
		category: "avatar",
		requiredInputs: ["sourceVideo"],
		endpoints: {
			image_to_video: "fal-ai/kling-video/o1/video-to-video/reference",
		},
		default_params: {
			duration: 5,
			aspect_ratio: "auto",
		},
		supportedDurations: [5, 10],
		supportedAspectRatios: ["auto", "16:9", "9:16", "1:1"],
	},
	kling_o1_v2v_edit: {
		id: "kling_o1_v2v_edit",
		name: "Kling O1 Video Edit",
		description:
			"Edit videos through natural language instructions while preserving motion structure",
		price: "0.168",
		resolution: "1080p",
		max_duration: 10,
		category: "avatar",
		requiredInputs: ["sourceVideo"],
		endpoints: {
			image_to_video: "fal-ai/kling-video/o1/video-to-video/edit",
		},
		default_params: {
			duration: 5,
		},
		supportedDurations: [5, 10],
	},
	kling_o1_ref2video: {
		id: "kling_o1_ref2video",
		name: "Kling O1 Reference-to-Video",
		description:
			"Transform reference images and elements into consistent video scenes",
		price: "0.112",
		resolution: "1080p",
		max_duration: 10,
		category: "avatar",
		requiredInputs: ["referenceImages"],
		endpoints: {
			image_to_video: "fal-ai/kling-video/o1/reference-to-video",
		},
		default_params: {
			duration: 5,
			aspect_ratio: "16:9",
			cfg_scale: 0.5,
			negative_prompt: "blur, distort, low quality",
		},
		supportedDurations: [5, 10],
		supportedAspectRatios: ["16:9", "9:16", "1:1"],
	},
	grok_imagine_r2v: {
		id: "grok_imagine_r2v",
		name: "Grok Imagine Reference-to-Video",
		description:
			"xAI's reference-to-video — guide video generation with up to 7 reference images using @Image1..@Image7 syntax",
		price: "0.30",
		resolution: "480p / 720p",
		max_duration: 10,
		category: "avatar",
		requiredInputs: ["referenceImages"],
		endpoints: {
			image_to_video: "xai/grok-imagine-video/reference-to-video",
		},
		default_params: {
			duration: 8,
			resolution: "480p",
			aspect_ratio: "16:9",
		},
		supportedResolutions: ["480p", "720p"],
		supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
		supportedAspectRatios: ["16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16"],
	},
	bytedance_omnihuman_v1_5: {
		id: "bytedance_omnihuman_v1_5",
		name: "ByteDance OmniHuman v1.5",
		badge: "🎬 Cinematic",
		description: "Realistic human avatar with emotion-synced audio",
		price: "0.20",
		resolution: "1080p",
		max_duration: 30,
		category: "avatar",
		requiredInputs: ["characterImage", "audioFile"],
		endpoints: {
			text_to_video: "fal-ai/bytedance/omnihuman/v1.5",
		},
		default_params: {
			resolution: "1080p",
		},
	},
	veo31_fast_extend_video: {
		id: "veo31_fast_extend_video",
		name: "Veo 3.1 Fast Extend",
		description:
			"Extend videos by 7s with motion continuation (faster, budget-friendly)",
		price: "0.15/s",
		resolution: "720p",
		max_duration: 7,
		category: "avatar",
		requiredInputs: ["sourceVideo"],
		endpoints: {
			image_to_video: "fal-ai/veo3.1/fast/extend-video",
		},
		default_params: {
			duration: 7,
			resolution: "720p",
			aspect_ratio: "auto",
			generate_audio: true,
			auto_fix: false,
		},
		supportedAspectRatios: ["auto", "16:9", "9:16"],
	},
	veo31_extend_video: {
		id: "veo31_extend_video",
		name: "Veo 3.1 Extend",
		description: "Extend videos by 7s with premium quality motion continuation",
		price: "0.40/s",
		resolution: "720p",
		max_duration: 7,
		category: "avatar",
		requiredInputs: ["sourceVideo"],
		endpoints: {
			image_to_video: "fal-ai/veo3.1/extend-video",
		},
		default_params: {
			duration: 7,
			resolution: "720p",
			aspect_ratio: "auto",
			generate_audio: true,
			auto_fix: false,
		},
		supportedAspectRatios: ["auto", "16:9", "9:16"],
	},
	kling_avatar_pro: {
		id: "kling_avatar_pro",
		name: "Kling Avatar Pro",
		description: "Premium avatar video generation from image + audio",
		price: "0.25",
		resolution: "1080p",
		max_duration: 10,
		category: "avatar",
		requiredInputs: ["characterImage", "audioFile"],
		endpoints: {
			text_to_video: "fal-ai/kling-video/v1/pro/ai-avatar",
		},
		default_params: {
			resolution: "1080p",
		},
	},
	kling_avatar_standard: {
		id: "kling_avatar_standard",
		name: "Kling Avatar Standard",
		description: "Standard avatar video generation from image + audio",
		price: "0.15",
		resolution: "720p",
		max_duration: 10,
		category: "avatar",
		requiredInputs: ["characterImage", "audioFile"],
		endpoints: {
			text_to_video: "fal-ai/kling-video/v1/standard/ai-avatar",
		},
		default_params: {
			resolution: "720p",
		},
	},
	sora2_video_to_video_remix: {
		id: "sora2_video_to_video_remix",
		name: "Sora 2 Video-to-Video Remix",
		description:
			"Transform Sora-generated videos with style changes (requires existing Sora video)",
		price: "0.00",
		resolution: "Preserves source",
		max_duration: 12,
		category: "avatar",
		requiredInputs: ["videoId"],
		endpoints: {
			text_to_video: "fal-ai/sora-2/video-to-video/remix",
		},
		default_params: {},
	},
} as const satisfies Record<string, AIModel>;

/**
 * Avatar model identifier type derived from AVATAR_MODELS keys.
 * Ensures type safety when referencing avatar models throughout the application.
 */
export type AvatarModelId = keyof typeof AVATAR_MODELS;

/**
 * Priority order for displaying avatar models in the UI.
 * Models are ordered by quality/capability and use-case popularity.
 */
export const AVATAR_MODEL_ORDER: readonly AvatarModelId[] = [
	// Badged picks — always on top
	"kling_avatar_v2_pro", // ⭐ Recommended
	"kling_avatar_v2_standard", // ⚡ Fast
	"sync_lipsync_react1", // 💰 Budget
	"bytedance_omnihuman_v1_5", // 🎬 Cinematic
	// Everything else
	"wan_26_ref2v",
	"kling_o1_v2v_reference",
	"kling_o1_v2v_edit",
	"kling_o1_ref2video",
	"grok_imagine_r2v",
	"veo31_extend_video",
	"veo31_fast_extend_video",
	"wan_animate_replace",
	"kling_avatar_pro",
	"kling_avatar_standard",
	"sora2_video_to_video_remix",
] as const;

validateModelOrderInvariant({
	category: "AVATAR",
	models: AVATAR_MODELS,
	order: AVATAR_MODEL_ORDER,
});

/**
 * Get Avatar models in priority order for UI rendering.
 */
export function getAvatarModelsInOrder(): Array<[AvatarModelId, AIModel]> {
	return AVATAR_MODEL_ORDER.map((id) => [id, AVATAR_MODELS[id]]);
}
