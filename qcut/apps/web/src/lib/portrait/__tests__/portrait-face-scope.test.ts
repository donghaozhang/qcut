import { describe, expect, it } from "vitest";
import {
	applyPortraitAdjustments,
	projectPortraitAdjustments,
} from "../portrait-face-scope";

const base = {
	enabled: true,
	values: { face_adjust_TotalFace: 40 },
	faceTarget: { mode: "single" as const, faceId: 0 },
	faces: [{ trackId: 3, values: { face_adjust_Chin: -20 } }],
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
			scope: { mode: "face", trackId: 3 },
		});
		expect(projected.values).toEqual({ face_adjust_Chin: -20 });
		expect(projected.faceTarget).toEqual({ mode: "single", faceId: 0 });
	});

	it("projects an empty set for a face with no entry yet", () => {
		expect(
			projectPortraitAdjustments({
				adjustments: base,
				scope: { mode: "face", trackId: 7 },
			}).values
		).toEqual({});
	});

	it("folds an edit back without touching the legacy layer", () => {
		const next = applyPortraitAdjustments({
			adjustments: base,
			scope: { mode: "face", trackId: 7 },
			edited: { enabled: true, values: { face_adjust_VFace: 60 } },
		});
		expect(next.values).toEqual({ face_adjust_TotalFace: 40 });
		expect(next.faceTarget).toEqual({ mode: "single", faceId: 0 });
		expect(next.faces).toEqual([
			{ trackId: 3, values: { face_adjust_Chin: -20 } },
			{ trackId: 7, values: { face_adjust_VFace: 60 } },
		]);
	});

	it("drops an emptied face entry", () => {
		const next = applyPortraitAdjustments({
			adjustments: base,
			scope: { mode: "face", trackId: 3 },
			edited: { enabled: true, values: { face_adjust_Chin: 0 } },
		});
		expect(next.faces).toBeUndefined();
	});

	it("round-trips a projection through an unmodified apply", () => {
		const scope = { mode: "face", trackId: 3 } as const;
		const projected = projectPortraitAdjustments({ adjustments: base, scope });
		expect(
			applyPortraitAdjustments({ adjustments: base, scope, edited: projected })
		).toEqual(base);
	});
});
