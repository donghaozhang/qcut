import { describe, expect, it } from "vitest";
import {
	applyPortraitAdjustments,
	applyPortraitMakeup,
	applyWholeFrameBodyAdjustments,
	projectPortraitAdjustments,
} from "../portrait-face-scope";

const bindingAnchor = {
	rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
	frameNumber: 12,
};

function faceScope({ trackId }: { trackId: number }) {
	return {
		mode: "face" as const,
		trackId,
		personBindingId: `portrait-person:${trackId}`,
		bindingAnchor,
	};
}

const base = {
	enabled: true,
	values: { face_adjust_TotalFace: 40 },
	faceTarget: { mode: "single" as const, faceId: 0 },
	faces: [
		{
			trackId: 3,
			personBindingId: "portrait-person:3",
			bindingAnchor,
			values: { face_adjust_Chin: -20 },
		},
	],
};

describe("portrait face scope", () => {
	it("projects the legacy layer unchanged for the all scope", () => {
		expect(
			projectPortraitAdjustments({ adjustments: base, scope: { mode: "all" } })
		).toBe(base);
	});

	it("projects a face entry's values as the editable set", () => {
		const projected = projectPortraitAdjustments({
			adjustments: base,
			scope: faceScope({ trackId: 3 }),
		});
		expect(projected.values).toEqual({ face_adjust_Chin: -20 });
		expect(projected.faceTarget).toEqual({ mode: "single", faceId: 0 });
	});

	it("projects an empty set for a face with no entry yet", () => {
		expect(
			projectPortraitAdjustments({
				adjustments: base,
				scope: faceScope({ trackId: 7 }),
			}).values
		).toEqual({});
	});

	it("folds an edit back without touching the legacy layer", () => {
		const next = applyPortraitAdjustments({
			adjustments: base,
			scope: faceScope({ trackId: 7 }),
			edited: { enabled: true, values: { face_adjust_VFace: 60 } },
		});
		expect(next.values).toEqual({ face_adjust_TotalFace: 40 });
		expect(next.faceTarget).toEqual({ mode: "single", faceId: 0 });
		expect(next.faces).toEqual([
			base.faces[0],
			{
				trackId: 7,
				personBindingId: "portrait-person:7",
				bindingAnchor,
				values: { face_adjust_VFace: 60 },
			},
		]);
	});

	it("drops an emptied face entry", () => {
		const next = applyPortraitAdjustments({
			adjustments: base,
			scope: faceScope({ trackId: 3 }),
			edited: { enabled: true, values: { face_adjust_Chin: 0 } },
		});
		expect(next.faces).toBeUndefined();
	});

	it("round-trips a projection through an unmodified apply", () => {
		const scope = faceScope({ trackId: 3 });
		const projected = projectPortraitAdjustments({ adjustments: base, scope });
		expect(
			applyPortraitAdjustments({ adjustments: base, scope, edited: projected })
		).toEqual(base);
	});

	it("preserves per-face data when global makeup changes", () => {
		expect(
			applyPortraitMakeup({
				adjustments: base,
				makeup: { lip: { cardId: "lip-soft-pink", intensity: 80 } },
			})
		).toEqual({
			...base,
			makeup: { lip: { cardId: "lip-soft-pink", intensity: 80 } },
		});
	});

	it("clears makeup without dropping values or per-face data", () => {
		expect(
			applyPortraitMakeup({
				adjustments: {
					...base,
					makeup: { lip: { cardId: "lip-soft-pink", intensity: 80 } },
				},
				makeup: {},
			})
		).toEqual(base);
	});

	it("keeps body values global and removes legacy per-face body values", () => {
		const next = applyWholeFrameBodyAdjustments({
			edited: {
				enabled: true,
				values: { body_adjust_SlimWaist: 70 },
				faces: [
					{
						trackId: 0,
						values: {
							body_adjust_StretchLeg: 40,
							face_adjust_TotalFace: 65,
						},
					},
					{
						trackId: 1,
						values: { body_adjust_SlimBody: 50 },
						makeup: {
							lip: { cardId: "lip-soft-pink", intensity: 80 },
						},
					},
				],
			},
		});
		expect(next.values).toEqual({ body_adjust_SlimWaist: 70 });
		expect(next.faces).toEqual([
			{ trackId: 0, values: { face_adjust_TotalFace: 65 } },
			{
				trackId: 1,
				values: {},
				makeup: { lip: { cardId: "lip-soft-pink", intensity: 80 } },
			},
		]);
	});
});
