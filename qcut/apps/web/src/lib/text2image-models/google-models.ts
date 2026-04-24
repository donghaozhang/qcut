import type { Text2ImageModel } from "./types";

export const GOOGLE_MODELS: Record<string, Text2ImageModel> = {
	"imagen4-ultra": {
		id: "imagen4-ultra",
		name: "Imagen4 Ultra",
		description:
			"Google's latest high-quality model with exceptional photorealism",
		provider: "Google",
		endpoint: "https://fal.run/fal-ai/imagen4/preview/ultra",
		// Imagen4 Ultra generates typically take 30-60 s; queue submit keeps
		// each proxy round-trip inside the edge timeout.
		useQueue: true,

		qualityRating: 5,
		speedRating: 3,

		estimatedCost: "$0.08-0.12",
		costPerImage: 10, // cents

		maxResolution: "2048x2048",
		supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],

		defaultParams: {
			aspect_ratio: "1:1",
			num_images: 1,
		},

		availableParams: [
			{
				name: "aspect_ratio",
				type: "select",
				options: ["1:1", "4:3", "3:4", "16:9", "9:16"],
				default: "1:1",
				description: "Image aspect ratio",
			},
			{
				name: "num_images",
				type: "number",
				min: 1,
				max: 4,
				default: 1,
				description: "Number of images to generate",
			},
		],

		bestFor: [
			"Photorealistic images",
			"Product photography",
			"Architectural visualization",
			"Nature and landscapes",
			"Portrait photography",
		],

		strengths: [
			"Exceptional photorealism",
			"Excellent prompt adherence",
			"High detail and clarity",
			"Natural lighting and shadows",
			"Advanced understanding of complex prompts",
		],

		limitations: [
			"Slower generation time",
			"Higher cost per image",
			"May struggle with highly stylized art",
			"Limited creative interpretation",
		],
	},

	"nano-banana": {
		id: "nano-banana",
		name: "Nano Banana",
		description:
			"Google/Gemini-powered model for fast, cost-effective text-to-image generation with optional editing",
		provider: "Google",
		endpoint: "https://fal.run/fal-ai/nano-banana",

		qualityRating: 4,
		speedRating: 5,

		estimatedCost: "$0.039",
		costPerImage: 3.9, // cents

		maxResolution: "2048x2048",
		supportedAspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],

		defaultParams: {
			aspect_ratio: "1:1",
			num_images: 1,
			output_format: "png",
			sync_mode: false,
		},

		availableParams: [
			{
				name: "aspect_ratio",
				type: "select",
				options: ["1:1", "4:3", "3:4", "16:9", "9:16"],
				default: "1:1",
				description: "Image aspect ratio",
			},
			{
				name: "num_images",
				type: "number",
				min: 1,
				max: 4,
				default: 1,
				description: "Number of output images to generate",
			},
			{
				name: "output_format",
				type: "select",
				options: ["jpeg", "png"],
				default: "png",
				description: "Output image format",
			},
			{
				name: "sync_mode",
				type: "boolean",
				default: false,
				description: "Return images as data URIs immediately",
			},
		],

		bestFor: [
			"Cost-effective image editing",
			"Smart content understanding",
			"Quick image modifications",
			"Format-specific outputs",
		],

		strengths: [
			"Google/Gemini AI technology",
			"Very cost effective ($0.039/image)",
			"Multiple output formats",
			"Smart contextual understanding",
			"Provides edit descriptions",
		],

		limitations: [
			"Less advanced than SeedDream V4",
			"No flexible sizing options",
			"Standard prompt length limits",
		],
	},

	"gemini-3-pro": {
		id: "gemini-3-pro",
		name: "Gemini 3 Pro",
		description:
			"Google's state-of-the-art image generation with exceptional photorealism and long prompt support",
		provider: "Google",
		endpoint: "https://fal.run/fal-ai/gemini-3-pro-image-preview",

		qualityRating: 5,
		speedRating: 3,

		estimatedCost: "$0.15-0.30",
		costPerImage: 15, // cents (4K costs 2x)

		maxResolution: "4096x4096",
		supportedAspectRatios: [
			"1:1",
			"4:3",
			"3:4",
			"16:9",
			"9:16",
			"21:9",
			"9:21",
			"3:2",
			"2:3",
			"5:4",
			"4:5",
		],

		defaultParams: {
			aspect_ratio: "1:1",
			num_images: 1,
			resolution: "1K",
			output_format: "png",
		},

		availableParams: [
			{
				name: "aspect_ratio",
				type: "select",
				options: [
					"auto",
					"1:1",
					"4:3",
					"3:4",
					"16:9",
					"9:16",
					"21:9",
					"9:21",
					"3:2",
					"2:3",
					"5:4",
					"4:5",
				],
				default: "1:1",
				description: "Image aspect ratio (auto matches input for editing)",
			},
			{
				name: "resolution",
				type: "select",
				options: ["1K", "2K", "4K"],
				default: "1K",
				description: "Output resolution (4K costs 2x)",
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
			"Photorealistic images",
			"Long detailed prompts (up to 50K chars)",
			"High-resolution outputs",
			"Commercial photography",
			"Product visualization",
		],

		strengths: [
			"Exceptional photorealism (Google's latest)",
			"Supports extremely long prompts (50,000 chars)",
			"Multiple resolution options (1K/2K/4K)",
			"Wide aspect ratio support (11 options)",
			"Consistent quality across styles",
		],

		limitations: [
			"Higher cost than budget models ($0.15/image)",
			"4K outputs double the cost",
			"Slower generation (quality focus)",
			"No seed control for reproducibility",
		],
	},
};
