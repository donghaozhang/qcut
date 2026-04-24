import type { Text2ImageModel } from "./types";

/** Shared image_size presets for Wan 2.7 endpoints. */
export const WAN_27_IMAGE_SIZE_OPTIONS = [
	"square_hd",
	"square",
	"portrait_4_3",
	"portrait_16_9",
	"landscape_4_3",
	"landscape_16_9",
];

export const WAN_MODELS: Record<string, Text2ImageModel> = {
	"wan-v2-7-t2i": {
		id: "wan-v2-7-t2i",
		name: "Wan 2.7 T2I",
		description:
			"Wan 2.7 text-to-image model with bilingual prompt support (Chinese/English)",
		provider: "Wan",
		endpoint: "https://fal.run/fal-ai/wan/v2.7/text-to-image",

		qualityRating: 4,
		speedRating: 4,

		estimatedCost: "$0.04-0.06",
		costPerImage: 5,

		maxResolution: "2048x2048",
		supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],

		defaultParams: {
			image_size: "square_hd",
			max_images: 1,
			enable_safety_checker: true,
		},

		availableParams: [
			{
				name: "image_size",
				type: "select",
				options: WAN_27_IMAGE_SIZE_OPTIONS,
				default: "square_hd",
				description: "Output image resolution and aspect ratio",
			},
			{
				name: "negative_prompt",
				type: "string",
				default: "",
				description: "Content to avoid in generated image (max 500 chars)",
			},
			{
				name: "max_images",
				type: "number",
				min: 1,
				max: 5,
				default: 1,
				description: "Number of images to generate",
			},
			{
				name: "seed",
				type: "number",
				min: 0,
				max: 2_147_483_647,
				default: null,
				description: "Random seed for reproducible results",
			},
			{
				name: "enable_safety_checker",
				type: "boolean",
				default: true,
				description: "Enable content moderation for input/output",
			},
		],

		bestFor: [
			"General-purpose image generation",
			"Bilingual prompts (Chinese/English)",
			"Cost-effective high-quality images",
		],

		strengths: [
			"Bilingual prompt support",
			"Good balance of speed and quality",
			"Flexible image sizes",
			"Commercial use supported",
		],

		limitations: [
			"Negative prompt limited to 500 characters",
			"No guidance scale control",
		],
	},

	"wan-v2-7-pro-t2i": {
		id: "wan-v2-7-pro-t2i",
		name: "Wan 2.7 Pro T2I",
		description:
			"Wan 2.7 Pro text-to-image — higher quality output with bilingual prompts",
		provider: "Wan",
		endpoint: "https://fal.run/fal-ai/wan/v2.7/pro/text-to-image",
		// Pro tier routinely spans 40-90 s; routed through queue to avoid
		// tripping the proxy edge timeout.
		useQueue: true,

		qualityRating: 5,
		speedRating: 3,

		estimatedCost: "$0.06-0.10",
		costPerImage: 8,

		maxResolution: "2048x2048",
		supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],

		defaultParams: {
			image_size: "square_hd",
			max_images: 1,
			enable_safety_checker: true,
		},

		availableParams: [
			{
				name: "image_size",
				type: "select",
				options: WAN_27_IMAGE_SIZE_OPTIONS,
				default: "square_hd",
				description: "Output image resolution and aspect ratio",
			},
			{
				name: "negative_prompt",
				type: "string",
				default: "",
				description: "Content to avoid in generated image (max 500 chars)",
			},
			{
				name: "max_images",
				type: "number",
				min: 1,
				max: 5,
				default: 1,
				description: "Number of images to generate",
			},
			{
				name: "seed",
				type: "number",
				min: 0,
				max: 2_147_483_647,
				default: null,
				description: "Random seed for reproducible results",
			},
			{
				name: "enable_safety_checker",
				type: "boolean",
				default: true,
				description: "Enable content moderation for input/output",
			},
		],

		bestFor: [
			"High-quality photorealistic images",
			"Professional content creation",
			"Bilingual prompts (Chinese/English)",
		],

		strengths: [
			"Higher quality than standard Wan 2.7",
			"Bilingual prompt support",
			"Excellent detail and coherence",
			"Commercial use supported",
		],

		limitations: [
			"Slower than standard variant",
			"Higher cost per image",
			"Negative prompt limited to 500 characters",
		],
	},

	"wan-v2-7-edit": {
		id: "wan-v2-7-edit",
		name: "Wan 2.7 Edit",
		description:
			"Wan 2.7 image editing — transform 1-4 reference images with text prompts",
		provider: "Wan",
		endpoint: "https://fal.run/fal-ai/wan/v2.7/edit",

		qualityRating: 4,
		speedRating: 4,

		estimatedCost: "$0.04-0.06",
		costPerImage: 5,

		maxResolution: "2048x2048",
		supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],

		defaultParams: {
			image_size: "square_hd",
			num_images: 1,
			enable_prompt_expansion: true,
			enable_safety_checker: true,
		},

		availableParams: [
			{
				name: "image_size",
				type: "select",
				options: WAN_27_IMAGE_SIZE_OPTIONS,
				default: "square_hd",
				description: "Output image resolution and aspect ratio",
			},
			{
				name: "negative_prompt",
				type: "string",
				default: "",
				description: "Content to avoid in generated image (max 500 chars)",
			},
			{
				name: "num_images",
				type: "number",
				min: 1,
				max: 4,
				default: 1,
				description: "Number of images to generate",
			},
			{
				name: "enable_prompt_expansion",
				type: "boolean",
				default: true,
				description: "Enable DashScope prompt expansion for better edits",
			},
			{
				name: "seed",
				type: "number",
				min: 0,
				max: 2_147_483_647,
				default: null,
				description: "Random seed for reproducible results",
			},
			{
				name: "enable_safety_checker",
				type: "boolean",
				default: true,
				description: "Enable content moderation for input/output",
			},
		],

		bestFor: [
			"Image editing with reference images",
			"Multi-image compositing",
			"Style transfer between images",
			"Background and object manipulation",
		],

		strengths: [
			"Supports 1-4 reference images",
			"Order-aware references (image 1, 2, 3, 4 in prompt)",
			"Prompt expansion for better edits",
			"Bilingual prompt support",
		],

		limitations: [
			"Requires image upload to FAL storage",
			"Negative prompt limited to 500 characters",
		],
	},

	"wan-v2-7-pro-edit": {
		id: "wan-v2-7-pro-edit",
		name: "Wan 2.7 Pro Edit",
		description:
			"Wan 2.7 Pro image editing — higher quality multi-image editing with text prompts",
		provider: "Wan",
		endpoint: "https://fal.run/fal-ai/wan/v2.7/pro/edit",

		qualityRating: 5,
		speedRating: 3,

		estimatedCost: "$0.06-0.10",
		costPerImage: 8,

		maxResolution: "2048x2048",
		supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],

		defaultParams: {
			image_size: "square_hd",
			num_images: 1,
			enable_prompt_expansion: true,
			enable_safety_checker: true,
		},

		availableParams: [
			{
				name: "image_size",
				type: "select",
				options: WAN_27_IMAGE_SIZE_OPTIONS,
				default: "square_hd",
				description: "Output image resolution and aspect ratio",
			},
			{
				name: "negative_prompt",
				type: "string",
				default: "",
				description: "Content to avoid in generated image (max 500 chars)",
			},
			{
				name: "num_images",
				type: "number",
				min: 1,
				max: 4,
				default: 1,
				description: "Number of images to generate",
			},
			{
				name: "enable_prompt_expansion",
				type: "boolean",
				default: true,
				description: "Enable DashScope prompt expansion for better edits",
			},
			{
				name: "seed",
				type: "number",
				min: 0,
				max: 2_147_483_647,
				default: null,
				description: "Random seed for reproducible results",
			},
			{
				name: "enable_safety_checker",
				type: "boolean",
				default: true,
				description: "Enable content moderation for input/output",
			},
		],

		bestFor: [
			"High-quality image editing",
			"Professional multi-image compositing",
			"Detailed style and content manipulation",
		],

		strengths: [
			"Higher quality than standard edit",
			"Supports 1-4 reference images",
			"Order-aware references",
			"Prompt expansion for better edits",
			"Commercial use supported",
		],

		limitations: [
			"Slower than standard variant",
			"Higher cost per image",
			"Requires image upload to FAL storage",
		],
	},
};
