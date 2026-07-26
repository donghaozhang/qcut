import { describe, expect, it } from "vitest";
import {
	buildSpeedCurvePath,
	speedRateToY,
	speedYToRate,
} from "../speed-curve-path";

describe("speed curve path", () => {
	it("maps the logarithmic speed scale around 1x", () => {
		expect(speedRateToY({ rate: 10 })).toBeCloseTo(0);
		expect(speedRateToY({ rate: 1 })).toBeCloseTo(0.5);
		expect(speedRateToY({ rate: 0.1 })).toBeCloseTo(1);
		expect(speedYToRate({ y: 0 })).toBeCloseTo(10);
		expect(speedYToRate({ y: 0.5 })).toBeCloseTo(1);
		expect(speedYToRate({ y: 1 })).toBeCloseTo(0.1);
		expect(speedYToRate({ y: speedRateToY({ rate: 3.4 }) })).toBeCloseTo(3.4);
	});

	it("builds a bounded path across the selected clip", () => {
		const path = buildSpeedCurvePath({
			keyframes: [
				{ id: "start", frame: 0, value: 1, easing: "linear" },
				{ id: "fast", frame: 150, value: 10, easing: "easeInOut" },
				{ id: "end", frame: 300, value: 0.1, easing: "easeInOut" },
			],
			durationInFrames: 300,
		});

		expect(path).toMatch(/^M 0\.00 50\.00/);
		expect(path).toContain("L 100.00 100.00");
	});
});
