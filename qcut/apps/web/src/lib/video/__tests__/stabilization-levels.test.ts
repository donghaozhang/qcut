import { describe, expect, it } from "vitest";
import {
	STABILIZATION_LEVELS,
	deshakeRadiusForStabilization,
	stabilizationLevelForValue,
	stabilizationValueForLevel,
} from "../stabilization-levels";

describe("stabilization levels", () => {
	it("maps each level onto a distinct deshake radius", () => {
		const radii = STABILIZATION_LEVELS.map((entry) =>
			deshakeRadiusForStabilization(entry.value)
		);
		expect(radii).toEqual([16, 32, 48, 64]);
		expect(STABILIZATION_LEVELS.map((entry) => entry.radius)).toEqual(radii);
	});

	it("recovers the level from any stored value in the same quantization bucket", () => {
		expect(stabilizationLevelForValue(0)).toBeUndefined();
		expect(stabilizationLevelForValue(1)).toBe("low");
		expect(stabilizationLevelForValue(25)).toBe("low");
		expect(stabilizationLevelForValue(26)).toBe("recommended");
		expect(stabilizationLevelForValue(50)).toBe("recommended");
		expect(stabilizationLevelForValue(60)).toBe("high");
		expect(stabilizationLevelForValue(99)).toBe("max");
		expect(stabilizationLevelForValue(100)).toBe("max");
	});

	it("round-trips level -> value -> level", () => {
		for (const entry of STABILIZATION_LEVELS) {
			expect(
				stabilizationLevelForValue(stabilizationValueForLevel(entry.level))
			).toBe(entry.level);
		}
	});
});
