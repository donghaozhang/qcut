import { describe, expect, it } from "vitest";
import {
	hasMediaPortraitAdjustments,
	normalizeMediaPortraitAdjustments,
} from "../portrait-adjustments.js";

describe("media portrait adjustments", () => {
	it("keeps finite supported values and drops neutral or unknown input", () => {
		const normalized = normalizeMediaPortraitAdjustments({
			adjustments: {
				enabled: true,
				values: {
					face_adjust_TotalFace: 60,
					face_adjust_Nose: 0,
					unknown: 90,
				} as never,
			},
		});
		expect(normalized).toEqual({
			enabled: true,
			values: { face_adjust_TotalFace: 60 },
		});
		expect(hasMediaPortraitAdjustments({ adjustments: normalized })).toBe(true);
	});

	it("requires both the master switch and a non-neutral value", () => {
		expect(
			hasMediaPortraitAdjustments({
				adjustments: {
					enabled: false,
					values: { body_adjust_SlimWaist: 80 },
				},
			})
		).toBe(false);
		expect(
			hasMediaPortraitAdjustments({
				adjustments: { enabled: true, values: {} },
			})
		).toBe(false);
	});

	it("normalizes face targeting and makeup selections", () => {
		const normalized = normalizeMediaPortraitAdjustments({
			adjustments: {
				enabled: true,
				values: {},
				faceTarget: { mode: "single", faceId: 2 },
				makeup: {
					lip: { cardId: "lip-soft-pink", intensity: 75 },
					contacts: { cardId: "bad card", intensity: 80 },
				},
			},
		});
		expect(normalized).toEqual({
			enabled: true,
			values: {},
			faceTarget: { mode: "single", faceId: 2 },
			makeup: {
				lip: { cardId: "lip-soft-pink", intensity: 75 },
			},
		});
		expect(hasMediaPortraitAdjustments({ adjustments: normalized })).toBe(true);
	});

	it("drops invalid face IDs and clamps makeup intensity", () => {
		expect(
			normalizeMediaPortraitAdjustments({
				adjustments: {
					enabled: true,
					values: {},
					faceTarget: { mode: "single", faceId: 12 },
					makeup: {
						blush: { cardId: "blush-baby-pink", intensity: 140 },
					},
				},
			})
		).toEqual({
			enabled: true,
			values: {},
			makeup: {
				blush: { cardId: "blush-baby-pink", intensity: 100 },
			},
		});
	});
});
