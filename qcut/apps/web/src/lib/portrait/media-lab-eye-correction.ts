import { normalizeMediaPortraitAdjustments } from "@qcut/editor-core";
import type { MediaPortraitAdjustments } from "@/types/timeline";

const MAXIMUM_STRENGTH = 100;
const MAXIMUM_BRIGHT_EYE = 24;
const MAXIMUM_EYE_BAG_REDUCTION = 18;

function clampStrength({ strength }: { strength: number }) {
	if (Number.isNaN(strength)) return 0;
	return Math.min(MAXIMUM_STRENGTH, Math.max(0, strength));
}

function scaledAdjustment({
	maximum,
	strength,
}: {
	maximum: number;
	strength: number;
}) {
	return (maximum * strength) / MAXIMUM_STRENGTH;
}

function preserveStrongerValue({
	experimentalValue,
	userValue,
}: {
	experimentalValue: number;
	userValue: number | undefined;
}) {
	if (
		userValue !== undefined &&
		Math.abs(userValue) >= Math.abs(experimentalValue)
	) {
		return userValue;
	}
	return experimentalValue;
}

/**
 * Experimental Media Lab eye-detail treatment built from QCut's local portrait
 * controls. It brightens eye detail and softens eye bags; it does not detect,
 * estimate, or redirect gaze and must not be presented as gaze-to-camera.
 */
export function applyMediaLabEyeCorrection({
	adjustments,
	strength,
}: {
	adjustments: Partial<MediaPortraitAdjustments>;
	strength: number;
}): MediaPortraitAdjustments {
	const normalized = normalizeMediaPortraitAdjustments({ adjustments });
	const clampedStrength = clampStrength({ strength });
	if (clampedStrength === 0) return normalized;

	const brightEye = scaledAdjustment({
		maximum: MAXIMUM_BRIGHT_EYE,
		strength: clampedStrength,
	});
	const eyeBagReduction = scaledAdjustment({
		maximum: MAXIMUM_EYE_BAG_REDUCTION,
		strength: clampedStrength,
	});

	return normalizeMediaPortraitAdjustments({
		adjustments: {
			...normalized,
			enabled: true,
			values: {
				...normalized.values,
				face_adjust_BrightEye: preserveStrongerValue({
					experimentalValue: brightEye,
					userValue: normalized.values.face_adjust_BrightEye,
				}),
				face_adjust_Pouch: preserveStrongerValue({
					experimentalValue: eyeBagReduction,
					userValue: normalized.values.face_adjust_Pouch,
				}),
			},
		},
	});
}
