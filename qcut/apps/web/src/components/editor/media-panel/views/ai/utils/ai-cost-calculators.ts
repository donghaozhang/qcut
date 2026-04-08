/**
 * AI Cost Calculators
 *
 * Centralized pricing logic for AI video generation and upscaling models.
 * Extracted from ai.tsx for reuse across components and tests.
 *
 * @see ai-tsx-refactoring.md for refactoring plan
 */

// ============================================
// Video Generation Cost Calculators
// ============================================

const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
	"480p": { width: 854, height: 480 },
	"720p": { width: 1280, height: 720 },
	"1080p": { width: 1920, height: 1080 },
};

const SEEDANCE_PRICING: Record<string, number> = {
	seedance2: 1.2,
	seedance2_i2v: 2.0,
	seedance2_ref2v: 2.5,
};

/**
 * Calculate Seedance video generation cost using token-based pricing
 * Formula: tokens = (height × width × FPS × duration) / 1024
 * @param modelId - seedance_pro_fast_i2v or seedance_pro_i2v
 * @param resolution - 480p, 720p, or 1080p
 * @param duration - Duration in seconds
 * @returns Estimated cost in dollars
 */
export function calculateSeedanceCost(
	modelId: string,
	resolution: string,
	duration: number
): number {
	const dimensions = RESOLUTION_MAP[resolution] ?? RESOLUTION_MAP["1080p"];
	const fps = 30; // Standard FPS for Seedance models

	// Calculate video tokens
	const tokens = (dimensions.height * dimensions.width * fps * duration) / 1024;

	const pricePerMillionTokens =
		SEEDANCE_PRICING[modelId] ??
		(modelId === "seedance_pro_fast_i2v" ? 1.0 : 2.5);

	// Calculate total cost
	const cost = (tokens * pricePerMillionTokens) / 1_000_000;

	return cost;
}

/**
 * Calculate Kling v2.5 Turbo Pro I2V cost using fixed duration-based pricing
 * @param duration - Duration in seconds (5 or 10)
 * @returns Estimated cost in dollars
 */
export function calculateKlingCost(duration: number): number {
	// Fixed pricing tiers
	if (duration <= 5) {
		return 0.35;
	}
	if (duration <= 10) {
		return 0.7;
	}
	// Fallback: $0.07 per second beyond 10s (not officially supported but reasonable)
	return 0.7 + (duration - 10) * 0.07;
}

/**
 * Calculate Kling v2.6 Pro cost with optional audio generation
 * @param duration - Duration in seconds (5 or 10)
 * @param generateAudio - Whether audio generation is enabled
 * @returns Estimated cost in dollars
 */
export function calculateKling26Cost(
	duration: number,
	generateAudio: boolean
): number {
	// Per-second pricing: $0.14/s with audio, $0.07/s without
	const perSecondRate = generateAudio ? 0.14 : 0.07;
	return duration * perSecondRate;
}

/**
 * Calculate Vidu Q2 cost based on resolution and duration
 * @param resolution - 720p or 1080p
 * @param duration - Duration in seconds (2-8)
 * @returns Estimated cost in dollars
 */
export function calculateViduQ2Cost(
	resolution: string,
	duration: number
): number {
	// Per-second pricing: $0.05/s for 720p, $0.10/s for 1080p
	const perSecondRate = resolution === "1080p" ? 0.1 : 0.05;
	return duration * perSecondRate;
}

/**
 * Calculate LTX Video 2.0 cost based on resolution and duration
 * @param resolution - 1080p, 1440p, or 2160p
 * @param duration - Duration in seconds
 * @param variant - 'pro' or 'fast'
 * @returns Estimated cost in dollars
 */
export function calculateLTXV2Cost(
	resolution: string,
	duration: number,
	variant: "pro" | "fast"
): number {
	// Fast variant per-second pricing by resolution
	const fastPricing: Record<string, number> = {
		"1080p": 0.04,
		"1440p": 0.08,
		"2160p": 0.16,
	};

	// Pro variant per-second pricing by resolution (matches fal.ai pricing)
	const proPricing: Record<string, number> = {
		"1080p": 0.06,
		"1440p": 0.12,
		"2160p": 0.24,
	};

	const perSecondRate =
		variant === "fast"
			? (fastPricing[resolution] ?? 0.04)
			: (proPricing[resolution] ?? 0.06);

	return duration * perSecondRate;
}

// ============================================
// Upscaler Cost Calculators
// ============================================

/**
 * Estimate the dollar cost to upscale a video using ByteDance per-second rates.
 *
 * @param resolution - Resolution identifier (e.g., "1080p", "2k", "4k")
 * @param fps - Frame rate identifier (e.g., "30fps", "60fps")
 * @param durationSeconds - Duration of the video segment in seconds
 * @returns Dollar cost as a string formatted with three decimal places (e.g., "$0.123"). Unknown resolution/fps combinations default to the 1080p_30fps rate.
 */
export function calculateByteDanceUpscaleCost(
	resolution: string,
	fps: string,
	durationSeconds: number
): string {
	const rateKey = `${resolution}_${fps}`.toLowerCase();
	const rates: Record<string, number> = {
		"1080p_30fps": 0.0072,
		"2k_30fps": 0.0144,
		"4k_30fps": 0.0288,
		"1080p_60fps": 0.0144,
		"2k_60fps": 0.0288,
		"4k_60fps": 0.0576,
	};

	const rate = rates[rateKey] ?? rates["1080p_30fps"];
	const totalCost = rate * durationSeconds;
	return `$${totalCost.toFixed(3)}`;
}

/**
 * Estimate the cost to upscale a video using FlashVSR.
 *
 * Calculates cost from the output resolution (input width/height multiplied by `upscaleFactor`) across all frames and returns a dollar amount formatted with three decimal places.
 *
 * @param width - Input frame width in pixels
 * @param height - Input frame height in pixels
 * @param frames - Number of frames to process
 * @param upscaleFactor - Multiplier applied to width and height for the output resolution
 * @returns The estimated cost as a dollar string formatted to three decimal places (for example, "$0.123")
 */
export function calculateFlashVSRUpscaleCost(
	width: number,
	height: number,
	frames: number,
	upscaleFactor: number
): string {
	if (!width || !height || !frames) {
		return "$0.000";
	}

	const outputWidth = width * upscaleFactor;
	const outputHeight = height * upscaleFactor;
	const megapixels = (outputWidth * outputHeight * frames) / 1_000_000;
	const totalCost = megapixels * 0.0005;
	return `$${totalCost.toFixed(3)}`;
}

/**
 * Compute the estimated Topaz upscaling cost for a requested upscale factor.
 *
 * @param factor - The requested upscale multiplier; if the exact factor is not supported, the nearest supported factor will be used.
 * @returns The estimated cost formatted as a dollar string (e.g., `$1.00`).
 */
export function calculateTopazUpscaleCost(factor: number): string {
	const TOPAZ_COST_TABLE: Record<number, number> = {
		2: 0.5,
		3: 1.0,
		4: 2.0,
		6: 3.5,
		8: 5.0,
	};

	const supportedFactors = Object.keys(TOPAZ_COST_TABLE).map(Number);
	const closestFactor = supportedFactors.reduce(
		(closest, current) =>
			Math.abs(current - factor) < Math.abs(closest - factor)
				? current
				: closest,
		supportedFactors[0]
	);

	return `$${TOPAZ_COST_TABLE[closestFactor].toFixed(2)}`;
}

/**
 * Calculate Kling Avatar v2 cost based on audio duration and model variant
 * @param audioDuration - Audio duration in seconds
 * @param variant - 'pro' or 'standard'
 * @returns Estimated cost in dollars
 */
export function calculateKlingAvatarV2Cost(
	audioDuration: number,
	variant: "pro" | "standard"
): number {
	// Per-second pricing: $0.115/s for Pro, $0.0562/s for Standard
	const perSecondRate = variant === "pro" ? 0.115 : 0.0562;
	return audioDuration * perSecondRate;
}

/**
 * Calculate WAN 2.5 cost based on resolution and duration
 * @param resolution - 480p, 720p, or 1080p
 * @param duration - Duration in seconds
 * @returns Estimated cost in dollars
 */
export function calculateWan25Cost(
	resolution: string,
	duration: number
): number {
	const perSecondPricing: Record<string, number> = {
		"480p": 0.05,
		"720p": 0.1,
		"1080p": 0.15,
	};

	const perSecondRate = perSecondPricing[resolution] ?? 0.15;
	return duration * perSecondRate;
}

/**
 * Calculate WAN v2.6 cost based on resolution and duration
 * @param resolution - 480p, 720p, or 1080p (I2V) or 720p, 1080p (T2V)
 * @param duration - Duration in seconds (5, 10, or 15)
 * @returns Estimated cost in dollars
 */
export function calculateWan26Cost(
	resolution: string,
	duration: number
): number {
	// WAN v2.6 only supports 720p and 1080p (no 480p)
	const perSecondPricing: Record<string, number> = {
		"720p": 0.1,
		"1080p": 0.15,
	};

	const perSecondRate = perSecondPricing[resolution] ?? 0.15;
	return duration * perSecondRate;
}

/**
 * Calculate LTX Video 2.3 cost based on resolution and duration
 * @param resolution - 1080p, 1440p, or 2160p
 * @param duration - Duration in seconds
 * @param variant - 'pro' or 'fast'
 * @returns Estimated cost in dollars
 */
export function calculateLTX23Cost(
	resolution: string,
	duration: number,
	variant: "pro" | "fast"
): number {
	const fastPricing: Record<string, number> = {
		"1080p": 0.04,
		"1440p": 0.08,
		"2160p": 0.16,
	};

	const proPricing: Record<string, number> = {
		"1080p": 0.06,
		"1440p": 0.12,
		"2160p": 0.24,
	};

	const perSecondRate =
		variant === "fast"
			? (fastPricing[resolution] ?? 0.04)
			: (proPricing[resolution] ?? 0.06);

	return duration * perSecondRate;
}

/**
 * Calculate Veo 3.1 extend-video cost
 * @param variant - "fast" or "standard"
 * @param generateAudio - Whether audio is generated
 * @returns Cost for 7-second extension as a string (e.g., "$1.05")
 */
export function calculateVeo31ExtendCost(
	variant: "fast" | "standard",
	generateAudio = true
): string {
	const duration = 7; // Always 7 seconds for extend-video

	// Price per second based on variant and audio setting
	const pricePerSecond =
		variant === "fast"
			? generateAudio
				? 0.15
				: 0.1
			: generateAudio
				? 0.4
				: 0.2;

	const cost = duration * pricePerSecond;
	return `$${cost.toFixed(2)}`;
}
