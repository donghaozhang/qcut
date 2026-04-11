/**
 * Credit cost mapping for AI operations.
 * 1 credit ≈ $0.10 of AI compute.
 *
 * Costs are derived from electron/native-pipeline/infra/cost-calculator.ts
 * pricing and rounded to simple values for user-facing display.
 *
 * To adjust pricing, update this config — no code changes needed.
 */

export interface CreditCost {
	/** Credits consumed per operation */
	credits: number;
	/** Human-readable label */
	label: string;
	/** Unit for display (e.g. "per image", "per 5s video") */
	unit: string;
}

/** Fixed-cost operations (per invocation) */
const FIXED_COSTS: Record<string, CreditCost> = {
	// Text-to-Image
	"flux-schnell": { credits: 0.1, label: "FLUX.1 Schnell", unit: "per image" },
	"flux-dev": { credits: 0.3, label: "FLUX.1 Dev", unit: "per image" },
	"seedream-v3": { credits: 0.2, label: "Seedream v3", unit: "per image" },
	"imagen-4": { credits: 0.4, label: "Google Imagen 4", unit: "per image" },
	"reve-t2i": { credits: 0.5, label: "Reve T2I", unit: "per image" },

	// Image-to-Video (fixed price models)
	"kling-v2.1-i2v": { credits: 0.5, label: "Kling v2.1", unit: "per video" },
	"minimax-hailuo-02": {
		credits: 0.5,
		label: "MiniMax Hailuo-02",
		unit: "per video",
	},
	"minimax-hailuo-02-pro": {
		credits: 1,
		label: "Hailuo-02 Pro",
		unit: "per video",
	},
	"kling-v3-pro-i2v": {
		credits: 3.5,
		label: "Kling v3 Pro I2V",
		unit: "per video",
	},
	"kling-v3-std-i2v": {
		credits: 2.5,
		label: "Kling v3 Std I2V",
		unit: "per video",
	},

	// Avatar (fixed price models)
	"kling-avatar-v2-std": {
		credits: 0.6,
		label: "Kling Avatar v2 Std",
		unit: "per video",
	},
	"kling-avatar-v2-pro": {
		credits: 1,
		label: "Kling Avatar v2 Pro",
		unit: "per video",
	},

	// Video Upscale
	"bytedance-upscaler": {
		credits: 0.5,
		label: "ByteDance Upscaler",
		unit: "per video",
	},
	flashvsr: { credits: 0.3, label: "FlashVSR", unit: "per video" },

	// Image Edit
	"flux-kontext": { credits: 0.3, label: "FLUX Kontext", unit: "per image" },
	"luma-photon": { credits: 0.2, label: "Luma Photon", unit: "per image" },

	// Prompt Generation
	"openrouter-prompt": {
		credits: 0.1,
		label: "Prompt Generation",
		unit: "per request",
	},

	// Image Understanding
	"gemini-describe": {
		credits: 0.1,
		label: "Gemini Describe",
		unit: "per request",
	},

	// GMI Cloud LLM models
	"gmi-glm-5.1": { credits: 0.1, label: "GLM 5.1", unit: "per request" },
	"gmi-gemini-3.1-pro": {
		credits: 0.2,
		label: "Gemini 3.1 Pro",
		unit: "per request",
	},
	"gmi-gpt-5.4": { credits: 0.3, label: "GPT-5.4", unit: "per request" },
};

/** Per-second costs (multiply by duration) */
const PER_SECOND_COSTS: Record<string, CreditCost> = {
	// Text-to-Video
	"ltxv2-fast-1080p": {
		credits: 0.4,
		label: "LTX V2 Fast 1080p",
		unit: "per second",
	},
	"ltx23-pro-1080p": {
		credits: 0.6,
		label: "LTX 2.3 Pro 1080p",
		unit: "per second",
	},
	"ltx23-fast-1080p": {
		credits: 0.4,
		label: "LTX 2.3 Fast 1080p",
		unit: "per second",
	},
	"kling-v2.6-pro": {
		credits: 0.7,
		label: "Kling v2.6 Pro",
		unit: "per second",
	},
	"wan-v2.6-1080p": {
		credits: 1.5,
		label: "WAN v2.6 1080p",
		unit: "per second",
	},
	"veo-3": { credits: 5, label: "Google Veo 3", unit: "per second" },
	"veo-3-fast": { credits: 3, label: "Google Veo 3 Fast", unit: "per second" },
	"sora-2": { credits: 1, label: "Sora 2", unit: "per second" },

	// Avatar per-second
	"omnihuman-v1.5": {
		credits: 1.6,
		label: "OmniHuman v1.5",
		unit: "per second",
	},
	"veed-fabric-1.0": {
		credits: 1,
		label: "VEED Fabric 1.0",
		unit: "per second",
	},
};

/** Per-character costs (for TTS) */
const PER_CHARACTER_COSTS: Record<string, CreditCost> = {
	"elevenlabs-tts": {
		credits: 0.001,
		label: "ElevenLabs TTS",
		unit: "per character",
	},
};

/** Per-minute costs (for transcription) */
const PER_MINUTE_COSTS: Record<string, CreditCost> = {
	"elevenlabs-scribe": {
		credits: 0.1,
		label: "ElevenLabs Scribe",
		unit: "per minute",
	},
};

/**
 * Estimate credit cost for an AI operation.
 * Returns the credit amount to deduct.
 */
export function estimateCreditCost(
	modelKey: string,
	params?: {
		durationSeconds?: number;
		characterCount?: number;
		minutes?: number;
	}
): number {
	const fixed = FIXED_COSTS[modelKey];
	if (fixed) return fixed.credits;

	const perSecond = PER_SECOND_COSTS[modelKey];
	if (perSecond && params?.durationSeconds) {
		return perSecond.credits * params.durationSeconds;
	}

	const perChar = PER_CHARACTER_COSTS[modelKey];
	if (perChar && params?.characterCount) {
		return perChar.credits * params.characterCount;
	}

	const perMinute = PER_MINUTE_COSTS[modelKey];
	if (perMinute && params?.minutes) {
		return perMinute.credits * params.minutes;
	}

	// Unknown model — return a safe default
	return 1;
}

/** Get the cost entry for display purposes */
export function getCreditCostInfo(modelKey: string): CreditCost | null {
	return (
		FIXED_COSTS[modelKey] ??
		PER_SECOND_COSTS[modelKey] ??
		PER_CHARACTER_COSTS[modelKey] ??
		PER_MINUTE_COSTS[modelKey] ??
		null
	);
}
