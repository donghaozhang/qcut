import { describe, expect, it } from "vitest";
import { resolveTextAnimation3DCameraDistance } from "../text-animation-3d-renderer";

describe("resolveTextAnimation3DCameraDistance", () => {
	it("keeps the near edge at the original framing distance during a Y flip", () => {
		const projection = {
			kind: "plane",
			cameraFovDeg: 30,
			groupRotationXDeg: 0,
			groupRotationYDeg: 0,
		} as const;
		const flipDepth = Math.sin((60 * Math.PI) / 180) * (976 / 2);
		const distance = resolveTextAnimation3DCameraDistance({
			width: 976,
			height: 256,
			projection,
			additionalDepth: flipDepth,
		});
		const baseDistance = 256 / (2 * Math.tan((30 * Math.PI) / 360));

		expect(distance - flipDepth).toBeCloseTo(baseDistance, 6);
	});

	it("accounts for the cylinder radius, tilt, and per-glyph depth", () => {
		const projection = {
			kind: "cylinder",
			cameraFovDeg: 60,
			tiltXDeg: 20,
			yawDeg: 180,
			coverage: 5 / 6,
			radiusRatio: 1.2 / (Math.PI * 2),
		} as const;
		const baseDistance = 256 / (2 * Math.tan((60 * Math.PI) / 360));
		const radius = 976 * projection.radiusRatio;
		const tiltDepth = Math.sin((20 * Math.PI) / 180) * (256 / 2);
		const additionalDepth = 24;

		expect(
			resolveTextAnimation3DCameraDistance({
				width: 976,
				height: 256,
				projection,
				additionalDepth,
			})
		).toBeCloseTo(baseDistance + radius + tiltDepth + additionalDepth, 6);
	});
});
