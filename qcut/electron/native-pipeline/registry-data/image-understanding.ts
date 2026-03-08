/**
 * Image understanding model definitions
 * @module electron/native-pipeline/registry-data/image-understanding
 */

import { ModelRegistry } from "../infra/registry.js";

export function registerImageUnderstandingModels(): void {
	ModelRegistry.register({
		key: "gemini_describe",
		name: "Gemini Describe",
		provider: "Google",
		endpoint: "google/gemini/describe",
		categories: ["image_understanding"],
		description: "Basic image description",
		pricing: { per_request: 0.001 },
		defaults: {},
		features: ["image_description", "basic"],
		costEstimate: 0.001,
		processingTime: 3,
	});

	ModelRegistry.register({
		key: "gemini_detailed",
		name: "Gemini Detailed",
		provider: "Google",
		endpoint: "google/gemini/detailed",
		categories: ["image_understanding"],
		description: "Detailed image analysis",
		pricing: { per_request: 0.002 },
		defaults: {},
		features: ["image_analysis", "detailed"],
		costEstimate: 0.002,
		processingTime: 5,
	});

	ModelRegistry.register({
		key: "gemini_classify",
		name: "Gemini Classify",
		provider: "Google",
		endpoint: "google/gemini/classify",
		categories: ["image_understanding"],
		description: "Image classification and categorization",
		pricing: { per_request: 0.001 },
		defaults: {},
		features: ["classification", "categorization"],
		costEstimate: 0.001,
		processingTime: 3,
	});

	ModelRegistry.register({
		key: "gemini_objects",
		name: "Gemini Objects",
		provider: "Google",
		endpoint: "google/gemini/objects",
		categories: ["image_understanding"],
		description: "Object detection and identification",
		pricing: { per_request: 0.002 },
		defaults: {},
		features: ["object_detection", "identification"],
		costEstimate: 0.002,
		processingTime: 4,
	});

	ModelRegistry.register({
		key: "gemini_ocr",
		name: "Gemini OCR",
		provider: "Google",
		endpoint: "google/gemini/ocr",
		categories: ["image_understanding"],
		description: "Text extraction (OCR)",
		pricing: { per_request: 0.001 },
		defaults: {},
		features: ["ocr", "text_extraction"],
		costEstimate: 0.001,
		processingTime: 3,
	});

	ModelRegistry.register({
		key: "gemini_composition",
		name: "Gemini Composition",
		provider: "Google",
		endpoint: "google/gemini/composition",
		categories: ["image_understanding"],
		description: "Artistic and technical composition analysis",
		pricing: { per_request: 0.002 },
		defaults: {},
		features: ["composition_analysis", "artistic"],
		costEstimate: 0.002,
		processingTime: 5,
	});

	ModelRegistry.register({
		key: "gemini_qa",
		name: "Gemini Q&A",
		provider: "Google",
		endpoint: "google/gemini/qa",
		categories: ["image_understanding"],
		description: "Question and answer system for images",
		pricing: { per_request: 0.001 },
		defaults: {},
		features: ["qa", "interactive"],
		costEstimate: 0.001,
		processingTime: 4,
	});

	ModelRegistry.register({
		key: "fal_video_qa",
		name: "FAL Video Q&A",
		provider: "fal",
		endpoint: "openrouter/router/video/enterprise",
		categories: ["image_understanding"],
		description:
			"Video analysis via FAL-hosted OpenRouter VLM (Gemini 2.5 Flash)",
		pricing: { per_request: 0.003 },
		defaults: { model: "google/gemini-2.5-flash" },
		features: ["qa", "video_analysis", "interactive"],
		costEstimate: 0.003,
		processingTime: 15,
	});

	ModelRegistry.register({
		key: "doubao_video_understanding",
		name: "Doubao Video Understanding",
		provider: "Volcengine",
		endpoint: "volcengine/chat/completions",
		categories: ["image_understanding"],
		description:
			"Video understanding via Volcengine Ark Doubao Seed 1.6 (Chat API), supports URL input up to 50MB",
		pricing: { per_request: 0.005 },
		defaults: {
			model: "doubao-seed-1-6-251015",
			ark_api: "chat",
			fps: 1,
			max_tokens: 4096,
		},
		features: [
			"qa",
			"video_analysis",
			"interactive",
			"temporal_awareness",
			"timestamped_events",
		],
		costEstimate: 0.005,
		processingTime: 20,
	});

	ModelRegistry.register({
		key: "doubao_seed_2_pro",
		name: "Doubao Seed 2.0 Pro",
		provider: "Volcengine",
		endpoint: "volcengine/responses",
		categories: ["image_understanding"],
		description:
			"Doubao Seed 2.0 Pro via Responses API — high-capability video/image understanding with deep thinking, up to 1280 frames",
		pricing: { per_request: 0.008 },
		defaults: {
			model: "doubao-seed-2-0-pro-260215",
			ark_api: "responses",
			fps: 1,
		},
		features: [
			"qa",
			"video_analysis",
			"image_analysis",
			"interactive",
			"temporal_awareness",
			"timestamped_events",
			"deep_thinking",
		],
		costEstimate: 0.008,
		processingTime: 25,
	});

	ModelRegistry.register({
		key: "doubao_seed_2_lite",
		name: "Doubao Seed 2.0 Lite",
		provider: "Volcengine",
		endpoint: "volcengine/responses",
		categories: ["image_understanding"],
		description:
			"Doubao Seed 2.0 Lite via Responses API — fast, cost-effective video/image understanding, up to 1280 frames",
		pricing: { per_request: 0.003 },
		defaults: {
			model: "doubao-seed-2-0-lite-260215",
			ark_api: "responses",
			fps: 1,
		},
		features: [
			"qa",
			"video_analysis",
			"image_analysis",
			"interactive",
			"temporal_awareness",
			"timestamped_events",
		],
		costEstimate: 0.003,
		processingTime: 15,
	});
}
