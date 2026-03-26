import type { Text2ImageModel } from "./types";

export const OTHER_MODELS: Record<string, Text2ImageModel> = {
	"wan-v2-2": {
		id: "wan-v2-2",
		name: "WAN v2.2",
		description:
			"High-resolution photorealistic model with powerful prompt understanding",
		provider: "fal.ai",
		endpoint: "https://fal.run/fal-ai/wan/v2.2-a14b/text-to-image",

		qualityRating: 5,
		speedRating: 3,

		estimatedCost: "$0.06-0.10",
		costPerImage: 8, // cents

		maxResolution: "2048x2048",
		supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],

		defaultParams: {
			num_inference_steps: 27,
			image_size: "square_hd",
			guidance_scale: 3.5,
		},

		availableParams: [
			{
				name: "image_size",
				type: "select",
				options: [
					"square_hd",
					"square",
					"portrait_3_4",
					"portrait_9_16",
					"landscape_4_3",
					"landscape_16_9",
				],
				default: "square_hd",
				description: "Output image resolution and aspect ratio",
			},
			{
				name: "num_inference_steps",
				type: "number",
				min: 10,
				max: 50,
				default: 27,
				description: "Number of inference steps (quality vs. speed trade-off)",
			},
			{
				name: "guidance_scale",
				type: "number",
				min: 1,
				max: 10,
				default: 3.5,
				description: "How closely to follow the prompt (1-10)",
			},
			{
				name: "seed",
				type: "number",
				min: 0,
				max: 2_147_483_647,
				default: null,
				description: "Random seed for reproducible results",
			},
		],

		bestFor: [
			"High-resolution photorealistic images",
			"Detailed character portraits",
			"Professional photography-style images",
			"Complex scene generation",
			"Commercial content creation",
		],

		strengths: [
			"Exceptional photorealism",
			"Powerful prompt understanding",
			"High-resolution output",
			"Excellent detail preservation",
			"Good at complex compositions",
		],

		limitations: [
			"Slower generation time",
			"Higher computational cost",
			"May struggle with highly abstract concepts",
			"Less creative interpretation than artistic models",
		],
	},

	"qwen-image": {
		id: "qwen-image",
		name: "Qwen Image",
		description:
			"Alibaba's versatile image generation model with excellent prompt understanding",
		provider: "Alibaba",
		endpoint: "https://fal.run/fal-ai/qwen-image",

		qualityRating: 4,
		speedRating: 4,

		estimatedCost: "$0.04-0.08",
		costPerImage: 6, // cents

		maxResolution: "2048x2048",
		supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],

		defaultParams: {
			image_size: "landscape_4_3",
			num_inference_steps: 30,
			guidance_scale: 2.5,
			num_images: 1,
			output_format: "png",
			negative_prompt: " ",
		},

		availableParams: [
			{
				name: "image_size",
				type: "select",
				options: [
					"square_hd",
					"square",
					"portrait_3_4",
					"portrait_9_16",
					"landscape_4_3",
					"landscape_16_9",
				],
				default: "landscape_4_3",
				description: "Output image resolution and aspect ratio",
			},
			{
				name: "num_inference_steps",
				type: "number",
				min: 2,
				max: 50,
				default: 30,
				description: "Number of inference steps (quality vs. speed trade-off)",
			},
			{
				name: "guidance_scale",
				type: "number",
				min: 0,
				max: 20,
				default: 2.5,
				description: "How closely to follow the prompt (0-20)",
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
				name: "output_format",
				type: "select",
				options: ["png", "jpeg", "webp"],
				default: "png",
				description: "Output image format",
			},
			{
				name: "negative_prompt",
				type: "string",
				default: " ",
				description: "What to avoid in the generated image",
			},
			{
				name: "seed",
				type: "number",
				min: 0,
				max: 2_147_483_647,
				default: null,
				description: "Random seed for reproducible results",
			},
		],

		bestFor: [
			"Versatile image generation",
			"Natural scene composition",
			"Character and object generation",
			"Cultural and artistic themes",
			"Balanced realism and creativity",
		],

		strengths: [
			"Strong prompt understanding",
			"Good balance of speed and quality",
			"Versatile across different styles",
			"Cost-effective generation",
			"Supports negative prompts",
		],

		limitations: [
			"Not as photorealistic as specialized models",
			"May require prompt engineering for best results",
			"Less detailed than ultra-high-end models",
			"Limited creative interpretation for abstract concepts",
		],
	},

	"reve-text-to-image": {
		id: "reve-text-to-image",
		name: "Reve Text-to-Image",
		description:
			"Cost-effective AI image generation with strong aesthetic quality and accurate text rendering",
		provider: "fal.ai",
		endpoint: "https://fal.run/fal-ai/reve/text-to-image",

		qualityRating: 4,
		speedRating: 4,

		estimatedCost: "$0.04",
		costPerImage: 4, // cents

		maxResolution: "Auto (aspect-ratio dependent)",
		supportedAspectRatios: ["16:9", "9:16", "3:2", "2:3", "4:3", "3:4", "1:1"],

		defaultParams: {
			aspect_ratio: "3:2",
			num_images: 1,
			output_format: "png",
		},

		availableParams: [
			{
				name: "aspect_ratio",
				type: "select",
				options: ["16:9", "9:16", "3:2", "2:3", "4:3", "3:4", "1:1"],
				default: "3:2",
				description: "Output image aspect ratio",
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
				name: "output_format",
				type: "select",
				options: ["png", "jpeg", "webp"],
				default: "png",
				description: "Output image format",
			},
		],

		bestFor: [
			"Cost-effective image generation",
			"Text rendering in images",
			"General-purpose image creation",
			"Aesthetic quality outputs",
			"Multiple aspect ratios",
		],

		strengths: [
			"Very affordable ($0.04 per image)",
			"Strong aesthetic quality",
			"Accurate text rendering",
			"Flexible aspect ratios (7 options)",
			"Multiple output formats",
			"Fast generation speed",
		],

		limitations: [
			"Lower resolution than premium models",
			"Limited customization parameters",
			"No guidance scale control",
			"No seed control for reproducibility",
		],
	},

	"z-image-turbo": {
		id: "z-image-turbo",
		name: "Z-Image Turbo",
		description:
			"Super fast 6B parameter text-to-image model by Tongyi-MAI, optimized for speed",
		provider: "Tongyi-MAI",
		endpoint: "https://fal.run/fal-ai/z-image/turbo",

		qualityRating: 4,
		speedRating: 5,

		estimatedCost: "$0.03-0.05",
		costPerImage: 4, // cents

		maxResolution: "2048x2048",
		supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],

		defaultParams: {
			image_size: "landscape_4_3",
			num_inference_steps: 8,
			num_images: 1,
			enable_safety_checker: true,
		},

		availableParams: [
			{
				name: "image_size",
				type: "select",
				options: [
					"square_hd",
					"square",
					"portrait_4_3",
					"portrait_16_9",
					"landscape_4_3",
					"landscape_16_9",
				],
				default: "landscape_4_3",
				description: "Output image size preset",
			},
			{
				name: "num_inference_steps",
				type: "number",
				min: 1,
				max: 30,
				default: 8,
				description: "Number of inference steps (higher = better quality)",
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
				name: "output_format",
				type: "select",
				options: ["jpeg", "png", "webp"],
				default: "png",
				description: "Output image format",
			},
			{
				name: "enable_safety_checker",
				type: "boolean",
				default: true,
				description: "Enable content safety filtering",
			},
			{
				name: "seed",
				type: "number",
				min: 0,
				max: 2_147_483_647,
				default: null,
				description: "Random seed for reproducible results",
			},
		],

		bestFor: [
			"Fast generation",
			"Quick iterations",
			"Prototyping",
			"Cost-effective generation",
		],

		strengths: [
			"Very fast generation speed",
			"6B parameter model",
			"H100 GPU acceleration",
			"Cost-effective",
			"Good for rapid prototyping",
		],

		limitations: [
			"Newer model with less community testing",
			"May not match photorealistic models",
			"Limited advanced customization",
		],
	},

	"phota-edit": {
		id: "phota-edit",
		name: "Phota Edit",
		description:
			"AI photo editing with identity preservation — supports prompt-based editing and profile references",
		provider: "Photalabs",
		endpoint: "https://fal.run/fal-ai/phota/edit",

		qualityRating: 4,
		speedRating: 3,

		estimatedCost: "$0.05",
		costPerImage: 5, // cents

		maxResolution: "4K",
		supportedAspectRatios: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"],

		defaultParams: {
			num_images: 1,
			resolution: "1K",
			aspect_ratio: "auto",
			output_format: "jpeg",
		},

		availableParams: [
			{
				name: "aspect_ratio",
				type: "select",
				options: ["auto", "1:1", "16:9", "4:3", "3:4", "9:16"],
				default: "auto",
				description: "Output aspect ratio",
			},
			{
				name: "resolution",
				type: "select",
				options: ["1K", "4K"],
				default: "1K",
				description: "Output resolution (1K or 4K)",
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
				name: "output_format",
				type: "select",
				options: ["jpeg", "png", "webp"],
				default: "jpeg",
				description: "Output image format",
			},
		],

		bestFor: [
			"Photo editing with identity preservation",
			"Face-consistent edits across images",
			"Prompt-driven photo manipulation",
			"Profile-based character consistency",
		],

		strengths: [
			"Identity preservation via profiles",
			"Multi-image input support (up to 10)",
			"4K output option",
			"Profile references (@Profile1, @Profile2)",
			"Flexible aspect ratios",
		],

		limitations: [
			"Requires profile creation for identity features",
			"Slower than simple generation models",
			"Image editing focus (not pure text-to-image)",
		],
	},

	"gpt-image-1-5": {
		id: "gpt-image-1-5",
		name: "GPT Image 1.5",
		description:
			"OpenAI's GPT Image 1.5 for high-fidelity image generation with strong prompt adherence",
		provider: "OpenAI",
		endpoint: "https://fal.run/fal-ai/gpt-image-1.5",

		qualityRating: 5,
		speedRating: 4,

		estimatedCost: "$0.04-0.08",
		costPerImage: 4, // cents

		maxResolution: "1536x1536",
		supportedAspectRatios: ["1:1", "3:2", "2:3"],

		defaultParams: {
			image_size: "1024x1024",
			background: "auto",
			quality: "high",
			num_images: 1,
			output_format: "png",
			sync_mode: false,
		},

		availableParams: [
			{
				name: "image_size",
				type: "select",
				options: ["1024x1024", "1536x1024", "1024x1536"],
				default: "1024x1024",
				description: "Output image resolution",
			},
			{
				name: "background",
				type: "select",
				options: ["auto", "transparent", "opaque"],
				default: "auto",
				description: "Background type (transparent for compositing)",
			},
			{
				name: "quality",
				type: "select",
				options: ["low", "medium", "high"],
				default: "high",
				description: "Output quality level",
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
				name: "output_format",
				type: "select",
				options: ["jpeg", "png", "webp"],
				default: "png",
				description: "Output image format",
			},
		],

		bestFor: [
			"High-fidelity image generation",
			"Strong prompt adherence",
			"Transparent backgrounds for compositing",
			"Commercial content creation",
		],

		strengths: [
			"Excellent prompt adherence",
			"Transparent background support",
			"Multiple output formats (png, jpeg, webp)",
			"Consistent quality across styles",
		],

		limitations: [
			"Limited resolution options (3 sizes)",
			"No guidance scale control",
			"No seed for reproducibility",
		],
	},
};
