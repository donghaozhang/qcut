/**
 * Image edit model definitions and metadata
 * Extracted from image-edit-client.ts for modularity
 */

/** Get the list of available image editing models with metadata. */
export function getImageEditModels() {
	return [
		{
			id: "gemini-3-pro-edit",
			name: "Gemini 3 Pro Edit",
			description:
				"Google's advanced image editing with exceptional context understanding",
			provider: "Google",
			estimatedCost: "$0.15",
			features: [
				"Long prompt support (50K chars)",
				"Resolution options (1K/2K/4K)",
				"Smart context understanding",
				"Multiple aspect ratios",
			],
			parameters: {
				numImages: { min: 1, max: 4, default: 1, step: 1 },
				resolution: {
					type: "select",
					options: ["1K", "2K", "4K"],
					default: "1K",
				},
				aspectRatio: {
					type: "select",
					options: [
						"auto",
						"1:1",
						"4:3",
						"3:4",
						"16:9",
						"9:16",
						"21:9",
						"3:2",
						"2:3",
						"5:4",
						"4:5",
					],
					default: "auto",
				},
				outputFormat: {
					type: "select",
					options: ["jpeg", "png", "webp"],
					default: "png",
				},
				syncMode: { type: "boolean", default: false },
			},
		},
		{
			id: "nano-banana",
			name: "Nano Banana",
			description: "Smart AI-powered editing with Google/Gemini technology",
			provider: "Google",
			estimatedCost: "$0.039",
			features: [
				"Smart understanding",
				"Cost effective",
				"Multiple formats",
				"Edit descriptions",
			],
			parameters: {
				numImages: { min: 1, max: 4, default: 1, step: 1 },
				outputFormat: {
					type: "select",
					options: ["jpeg", "png"],
					default: "png",
				},
				syncMode: { type: "boolean", default: false },
			},
		},
		{
			id: "nano-banana-2",
			name: "Nano Banana 2",
			description:
				"Google's state-of-the-art image editing with resolution control and web search",
			provider: "Google",
			estimatedCost: "$0.08",
			features: [
				"Up to 4K resolution",
				"11 aspect ratio options",
				"Optional web search enhancement",
				"Multi-image input (up to 4)",
			],
			parameters: {
				numImages: { min: 1, max: 4, default: 1, step: 1 },
				resolution: {
					type: "select",
					options: ["0.5K", "1K", "2K", "4K"],
					default: "1K",
				},
				aspectRatio: {
					type: "select",
					options: [
						"auto",
						"1:1",
						"4:3",
						"3:4",
						"16:9",
						"9:16",
						"21:9",
						"3:2",
						"2:3",
						"5:4",
						"4:5",
					],
					default: "auto",
				},
				outputFormat: {
					type: "select",
					options: ["jpeg", "png", "webp"],
					default: "png",
				},
				safetyTolerance: { min: 1, max: 6, default: 4, step: 1 },
				enableWebSearch: { type: "boolean", default: false },
				syncMode: { type: "boolean", default: true },
			},
		},
		{
			id: "seeddream-v4-5-edit",
			name: "SeedDream v4.5 Edit",
			description:
				"ByteDance's latest image editing with up to 4K resolution and multi-image compositing",
			provider: "ByteDance",
			estimatedCost: "$0.04-0.08",
			features: [
				"Up to 4K resolution",
				"Multi-image compositing (up to 10)",
				"Auto 2K/4K presets",
				"Commercial license",
			],
			parameters: {
				imageSize: {
					type: "select",
					options: [
						"square_hd",
						"square",
						"portrait_4_3",
						"portrait_16_9",
						"landscape_4_3",
						"landscape_16_9",
						"auto_2K",
						"auto_4K",
					],
					default: "auto_2K",
				},
				maxImages: { min: 1, max: 10, default: 1, step: 1 },
				numImages: { min: 1, max: 6, default: 1, step: 1 },
				syncMode: { type: "boolean", default: false },
				enableSafetyChecker: { type: "boolean", default: true },
				seed: { optional: true },
			},
		},
		{
			id: "reve-edit",
			name: "Reve Edit",
			description: "Cost-effective image editing with strong aesthetic quality",
			provider: "fal.ai",
			estimatedCost: "$0.04",
			features: [
				"Cost-effective editing",
				"Strong aesthetics",
				"Fast processing",
				"Multiple formats",
			],
			parameters: {
				numImages: { min: 1, max: 4, default: 1, step: 1 },
				outputFormat: {
					type: "select",
					options: ["png", "jpeg", "webp"],
					default: "png",
				},
				syncMode: { type: "boolean", default: false },
			},
		},
		{
			id: "seeddream-v4",
			name: "SeedDream v4",
			description: "Advanced multi-image editing with unified architecture",
			provider: "ByteDance",
			estimatedCost: "$0.04-0.08",
			features: [
				"Multi-image processing",
				"Flexible sizing",
				"Enhanced prompts",
				"Advanced controls",
			],
			parameters: {
				imageSize: {
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
					customRange: { min: 1024, max: 4096, step: 64 },
				},
				maxImages: { min: 1, max: 6, default: 1, step: 1 },
				numImages: { min: 1, max: 4, default: 1, step: 1 },
				syncMode: { type: "boolean", default: false },
				enableSafetyChecker: { type: "boolean", default: true },
				seed: { optional: true },
			},
		},
		{
			id: "seededit",
			name: "SeedEdit v3",
			description: "Precise photo editing with content preservation",
			provider: "ByteDance",
			estimatedCost: "$0.05-0.10",
			features: ["Photo retouching", "Object modification", "Realistic edits"],
			parameters: {
				guidanceScale: { min: 1, max: 10, default: 1.0, step: 0.1 },
				seed: { optional: true },
			},
		},
		{
			id: "flux-kontext",
			name: "FLUX Pro Kontext",
			description: "Context-aware editing with scene transformations",
			provider: "FLUX",
			estimatedCost: "$0.15-0.25",
			features: ["Style changes", "Object replacement", "Scene modification"],
			parameters: {
				guidanceScale: { min: 1, max: 20, default: 3.5, step: 0.5 },
				steps: { min: 1, max: 50, default: 28, step: 1 },
				safetyTolerance: { min: 1, max: 6, default: 2, step: 1 },
				numImages: { min: 1, max: 4, default: 1, step: 1 },
			},
		},
		{
			id: "flux-kontext-max",
			name: "FLUX Pro Kontext Max",
			description: "Advanced editing for complex tasks and typography",
			provider: "FLUX",
			estimatedCost: "$0.25-0.40",
			features: ["Complex edits", "Typography", "Professional adjustments"],
			parameters: {
				guidanceScale: { min: 1, max: 20, default: 3.5, step: 0.5 },
				steps: { min: 1, max: 50, default: 28, step: 1 },
				safetyTolerance: { min: 1, max: 6, default: 2, step: 1 },
				numImages: { min: 1, max: 4, default: 1, step: 1 },
			},
		},
		{
			id: "flux-2-flex-edit",
			name: "FLUX 2 Flex Edit",
			description:
				"Flexible image editing with adjustable parameters and enhanced control",
			provider: "Black Forest Labs",
			estimatedCost: "$0.06/MP",
			features: [
				"Auto image size detection",
				"Adjustable inference steps",
				"Prompt expansion",
				"Fine-tuned guidance control",
			],
			parameters: {
				guidanceScale: { min: 1.5, max: 10, default: 3.5, step: 0.1 },
				steps: { min: 2, max: 50, default: 28, step: 1 },
				safetyTolerance: { min: 1, max: 5, default: 2, step: 1 },
				numImages: { min: 1, max: 1, default: 1, step: 1 },
				outputFormat: {
					type: "select",
					options: ["jpeg", "png"],
					default: "jpeg",
				},
				enablePromptExpansion: { type: "boolean", default: true },
			},
		},
		{
			id: "phota-edit",
			name: "Phota Edit",
			description:
				"AI photo editing with identity preservation via profiles — supports prompt-based editing with @Profile references",
			provider: "Photalabs",
			estimatedCost: "$0.05",
			features: [
				"Identity preservation via profiles",
				"Multi-image input (up to 10)",
				"4K resolution output",
				"Profile references (@Profile1, @Profile2)",
			],
			parameters: {
				numImages: { min: 1, max: 4, default: 1, step: 1 },
				resolution: {
					type: "select",
					options: ["1K", "4K"],
					default: "1K",
				},
				aspectRatio: {
					type: "select",
					options: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"],
					default: "auto",
				},
				outputFormat: {
					type: "select",
					options: ["jpeg", "png", "webp"],
					default: "jpeg",
				},
			},
		},
		{
			id: "wan-v2-7-edit",
			name: "Wan 2.7 Edit",
			description:
				"Wan 2.7 image editing with 1-4 reference images and bilingual prompts",
			provider: "Wan",
			estimatedCost: "$0.04-0.06",
			features: [
				"1-4 reference images",
				"Order-aware references",
				"Prompt expansion",
				"Bilingual prompts (Chinese/English)",
			],
			parameters: {
				imageSize: {
					type: "select",
					options: [
						"square_hd",
						"square",
						"portrait_4_3",
						"portrait_16_9",
						"landscape_4_3",
						"landscape_16_9",
					],
					default: "square_hd",
				},
				numImages: { min: 1, max: 4, default: 1, step: 1 },
				enablePromptExpansion: { type: "boolean", default: true },
				enableSafetyChecker: { type: "boolean", default: true },
				seed: { optional: true },
			},
		},
		{
			id: "wan-v2-7-pro-edit",
			name: "Wan 2.7 Pro Edit",
			description:
				"Wan 2.7 Pro image editing — higher quality multi-image editing with bilingual prompts",
			provider: "Wan",
			estimatedCost: "$0.06-0.10",
			features: [
				"Higher quality output",
				"1-4 reference images",
				"Order-aware references",
				"Prompt expansion",
			],
			parameters: {
				imageSize: {
					type: "select",
					options: [
						"square_hd",
						"square",
						"portrait_4_3",
						"portrait_16_9",
						"landscape_4_3",
						"landscape_16_9",
					],
					default: "square_hd",
				},
				numImages: { min: 1, max: 4, default: 1, step: 1 },
				enablePromptExpansion: { type: "boolean", default: true },
				enableSafetyChecker: { type: "boolean", default: true },
				seed: { optional: true },
			},
		},
		{
			id: "gpt-image-1-5-edit",
			name: "GPT Image 1.5 Edit",
			description:
				"OpenAI's GPT Image 1.5 for high-fidelity image editing with strong prompt adherence",
			provider: "OpenAI",
			estimatedCost: "$0.04-0.08",
			features: [
				"High prompt adherence",
				"Transparent background support",
				"Input fidelity control",
				"Multiple output formats",
			],
			parameters: {
				imageSize: {
					type: "select",
					options: ["auto", "1024x1024", "1536x1024", "1024x1536"],
					default: "auto",
				},
				background: {
					type: "select",
					options: ["auto", "transparent", "opaque"],
					default: "auto",
				},
				quality: {
					type: "select",
					options: ["low", "medium", "high"],
					default: "high",
				},
				inputFidelity: {
					type: "select",
					options: ["low", "high"],
					default: "high",
				},
				numImages: { min: 1, max: 4, default: 1, step: 1 },
				outputFormat: {
					type: "select",
					options: ["jpeg", "png", "webp"],
					default: "png",
				},
				syncMode: { type: "boolean", default: false },
			},
		},
	];
}
