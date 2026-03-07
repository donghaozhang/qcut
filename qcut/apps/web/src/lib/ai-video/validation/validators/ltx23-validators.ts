/**
 * LTX Video 2.3 validators and constants.
 */

import {
	ERROR_MESSAGES,
	LTX23_CONFIG,
} from "@/components/editor/media-panel/views/ai/constants/ai-constants";

// ============================================
// Duration/Resolution Constants
// ============================================

export const LTX23_PRO_DURATIONS = LTX23_CONFIG.PRO_DURATIONS;
export const LTX23_FAST_DURATIONS = LTX23_CONFIG.FAST_DURATIONS;
export const LTX23_RESOLUTIONS = LTX23_CONFIG.RESOLUTIONS.STANDARD;
export const LTX23_EXTENDED_THRESHOLD =
	LTX23_CONFIG.EXTENDED_DURATION_THRESHOLD;
export const LTX23_EXTENDED_RESOLUTIONS = LTX23_CONFIG.RESOLUTIONS.EXTENDED;
export const LTX23_EXTENDED_FPS = LTX23_CONFIG.FPS_OPTIONS.EXTENDED;
export const LTX23_FPS = LTX23_CONFIG.FPS_OPTIONS.STANDARD;
export const LTX23_A2V_DURATIONS = LTX23_CONFIG.AUDIO_TO_VIDEO.DURATIONS;

// ============================================
// Model Detection
// ============================================

const LTX23_MODEL_IDS = new Set([
	"ltx23_pro_t2v",
	"ltx23_fast_t2v",
	"ltx23_fast_i2v",
]);

export function isLTX23Model(modelId: string): boolean {
	return LTX23_MODEL_IDS.has(modelId);
}

export function isLTX23FastModel(modelId: string): boolean {
	return modelId === "ltx23_fast_t2v" || modelId === "ltx23_fast_i2v";
}

export function isLTX23ProModel(modelId: string): boolean {
	return modelId === "ltx23_pro_t2v";
}

// ============================================
// LTX Video 2.3 Validators
// ============================================

export function validateLTX23Resolution(resolution: string): void {
	if (
		!LTX23_RESOLUTIONS.includes(
			resolution as (typeof LTX23_RESOLUTIONS)[number]
		)
	) {
		throw new Error(ERROR_MESSAGES.LTX23_INVALID_RESOLUTION);
	}
}

export function validateLTX23Duration(duration: number, modelId: string): void {
	const isPro = isLTX23ProModel(modelId);

	if (isPro) {
		if (
			!LTX23_PRO_DURATIONS.includes(
				duration as (typeof LTX23_PRO_DURATIONS)[number]
			)
		) {
			throw new Error(ERROR_MESSAGES.LTX23_PRO_INVALID_DURATION);
		}
	} else {
		if (
			!LTX23_FAST_DURATIONS.includes(
				duration as (typeof LTX23_FAST_DURATIONS)[number]
			)
		) {
			throw new Error(ERROR_MESSAGES.LTX23_FAST_INVALID_DURATION);
		}
	}
}

export function validateLTX23FastExtendedConstraints(
	duration: number,
	resolution: string,
	fps: number
): void {
	if (duration <= LTX23_EXTENDED_THRESHOLD) {
		return;
	}

	const hasAllowedResolution = LTX23_EXTENDED_RESOLUTIONS.includes(
		resolution as (typeof LTX23_EXTENDED_RESOLUTIONS)[number]
	);

	const hasAllowedFps = LTX23_EXTENDED_FPS.includes(
		fps as (typeof LTX23_EXTENDED_FPS)[number]
	);

	if (!hasAllowedResolution || !hasAllowedFps) {
		throw new Error(ERROR_MESSAGES.LTX23_EXTENDED_DURATION_CONSTRAINT);
	}
}

export function validateLTX23A2VDuration(duration: number): void {
	if (
		!LTX23_A2V_DURATIONS.includes(
			duration as (typeof LTX23_A2V_DURATIONS)[number]
		)
	) {
		throw new Error(ERROR_MESSAGES.LTX23_A2V_INVALID_DURATION);
	}
}
