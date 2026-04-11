/**
 * Music generation model definitions
 * @module electron/native-pipeline/registry-data/music
 */

import { ModelRegistry } from "../infra/registry.js";

export function registerMusicModels(): void {
	ModelRegistry.register({
		key: "minimax_music_v2_6",
		name: "MiniMax Music v2.6",
		provider: "MiniMax (via FAL)",
		endpoint: "fal-ai/minimax-music/v2.6",
		categories: ["music"],
		description:
			"Full music tracks with vocals, lyrics, and arrangements from text prompts",
		pricing: { per_track: 0.1 },
		defaults: { is_instrumental: false },
		features: [
			"lyrics_support",
			"instrumental_mode",
			"structure_tags",
			"audio_quality_settings",
		],
		costEstimate: 0.1,
		processingTime: 60,
	});

	ModelRegistry.register({
		key: "minimax_music_v2_5",
		name: "MiniMax Music v2.5",
		provider: "MiniMax (via FAL)",
		endpoint: "fal-ai/minimax-music/v2.5",
		categories: ["music"],
		description:
			"Music generation with vocals and arrangements (previous generation)",
		pricing: { per_track: 0.08 },
		defaults: { is_instrumental: false },
		features: ["lyrics_support", "instrumental_mode"],
		costEstimate: 0.08,
		processingTime: 60,
	});
}
