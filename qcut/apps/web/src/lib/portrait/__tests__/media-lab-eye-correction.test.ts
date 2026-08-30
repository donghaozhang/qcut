import { normalizeMediaPortraitAdjustments } from "@qcut/editor-core";
import { describe, expect, it } from "vitest";
import { applyMediaLabEyeCorrection } from "../media-lab-eye-correction";

describe("experimental Media Lab eye correction", () => {
	it("applies a conservative local eye-detail treatment", () => {
		expect(
			applyMediaLabEyeCorrection({
				adjustments: { enabled: false, values: {} },
				strength: 100,
			})
		).toEqual({
			enabled: true,
			values: {
				face_adjust_BrightEye: 24,
				face_adjust_Pouch: 18,
			},
		});
	});

	it("scales the treatment continuously within the portrait control range", () => {
		const result = applyMediaLabEyeCorrection({
			adjustments: { enabled: true, values: {} },
			strength: 37.5,
		});

		expect(result.values.face_adjust_BrightEye).toBe(9);
		expect(result.values.face_adjust_Pouch).toBe(6.75);
	});

	it("returns the normalized input unchanged at zero strength", () => {
		const adjustments = {
			enabled: false,
			values: {
				face_adjust_BrightEye: 42,
				face_adjust_Pouch: 0,
				face_adjust_Whiten: Number.NaN,
			},
		};
		const expected = normalizeMediaPortraitAdjustments({ adjustments });

		expect(applyMediaLabEyeCorrection({ adjustments, strength: 0 })).toEqual(
			expected
		);
	});

	it("clamps out-of-range strength and treats NaN as disabled", () => {
		const adjustments = { enabled: false, values: {} } as const;

		expect(applyMediaLabEyeCorrection({ adjustments, strength: -20 })).toEqual({
			enabled: false,
			values: {},
		});
		expect(
			applyMediaLabEyeCorrection({ adjustments, strength: Number.NaN })
		).toEqual({ enabled: false, values: {} });
		expect(
			applyMediaLabEyeCorrection({ adjustments, strength: 140 }).values
		).toEqual({
			face_adjust_BrightEye: 24,
			face_adjust_Pouch: 18,
		});
		expect(
			applyMediaLabEyeCorrection({
				adjustments,
				strength: Number.POSITIVE_INFINITY,
			}).values
		).toEqual({
			face_adjust_BrightEye: 24,
			face_adjust_Pouch: 18,
		});
	});

	it("preserves stronger explicit eye-detail values", () => {
		const result = applyMediaLabEyeCorrection({
			adjustments: {
				enabled: true,
				values: {
					face_adjust_BrightEye: 70,
					face_adjust_Pouch: -40,
				},
			},
			strength: 100,
		});

		expect(result.values).toEqual({
			face_adjust_BrightEye: 70,
			face_adjust_Pouch: -40,
		});
	});

	it("raises weaker eye-detail values without changing unrelated values", () => {
		const result = applyMediaLabEyeCorrection({
			adjustments: {
				enabled: true,
				values: {
					face_adjust_BrightEye: 4,
					face_adjust_Pouch: 5,
					face_adjust_Clarity: 55,
					body_adjust_SlimWaist: 30,
				},
			},
			strength: 50,
		});

		expect(result.values).toEqual({
			face_adjust_BrightEye: 12,
			face_adjust_Pouch: 9,
			face_adjust_Clarity: 55,
			body_adjust_SlimWaist: 30,
		});
	});

	it("preserves normalized face, makeup, and manual-edit state", () => {
		const adjustments = {
			enabled: true,
			values: { face_adjust_Smooth: 20 },
			faceTarget: { mode: "single" as const, faceId: 2 },
			makeup: {
				contacts: { cardId: "contacts-natural", intensity: 65 },
			},
			faces: [
				{
					trackId: 3,
					values: { face_adjust_Chin: 12 },
					makeup: {
						eyeliner: { cardId: "eyeliner-soft", intensity: 45 },
					},
				},
			],
			manualRetouch: {
				strokes: [
					{
						id: "eye-detail-stroke",
						tool: "smooth" as const,
						mode: "paint" as const,
						size: 12,
						intensity: 30,
						points: [
							{ x: 0.2, y: 0.3 },
							{ x: 0.25, y: 0.35 },
						],
					},
				],
			},
			manualBody: {
				zoom: { intensity: 15, x: 0.5, y: 0.6, radius: 0.2 },
			},
		};
		const normalized = normalizeMediaPortraitAdjustments({ adjustments });
		const result = applyMediaLabEyeCorrection({ adjustments, strength: 50 });

		expect(result.faceTarget).toEqual(normalized.faceTarget);
		expect(result.makeup).toEqual(normalized.makeup);
		expect(result.faces).toEqual(normalized.faces);
		expect(result.manualRetouch).toEqual(normalized.manualRetouch);
		expect(result.manualBody).toEqual(normalized.manualBody);
	});

	it("does not mutate the caller's nested adjustment state", () => {
		const adjustments = {
			enabled: true,
			values: { face_adjust_BrightEye: 5 },
			makeup: {
				eyeshadow: { cardId: "eyeshadow-soft", intensity: 55 },
			},
			faces: [{ trackId: 1, values: { face_adjust_Pouch: 60 } }],
		};
		const snapshot = structuredClone(adjustments);

		const result = applyMediaLabEyeCorrection({ adjustments, strength: 80 });

		expect(adjustments).toEqual(snapshot);
		expect(result).not.toBe(adjustments);
		expect(result.values).not.toBe(adjustments.values);
		expect(result.makeup).not.toBe(adjustments.makeup);
		expect(result.faces).not.toBe(adjustments.faces);
	});

	it("is idempotent for a fixed strength and always returns normalized data", () => {
		const once = applyMediaLabEyeCorrection({
			adjustments: {
				enabled: false,
				values: {
					face_adjust_BrightEye: 0,
					face_adjust_Nose: Number.POSITIVE_INFINITY,
				},
			},
			strength: 65,
		});
		const twice = applyMediaLabEyeCorrection({
			adjustments: once,
			strength: 65,
		});

		expect(twice).toEqual(once);
		expect(normalizeMediaPortraitAdjustments({ adjustments: once })).toEqual(
			once
		);
	});
});
