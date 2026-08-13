// @vitest-environment node
import { describe, expect, it } from "vitest";
import { comparePremultipliedRgbaSequences } from "./jianying-text-real-e2e-helpers.js";

function transparentFrame({
	hiddenRgb,
}: {
	hiddenRgb: [number, number, number];
}) {
	return Buffer.from([...hiddenRgb, 0]);
}

describe("Jianying text RGBA sequence comparison", () => {
	it("ignores RGB differences hidden behind zero alpha", () => {
		const metrics = comparePremultipliedRgbaSequences({
			candidateBytes: transparentFrame({ hiddenRgb: [0, 255, 0] }),
			frameCount: 1,
			height: 1,
			referenceBytes: transparentFrame({ hiddenRgb: [255, 0, 0] }),
			width: 1,
		});

		expect(metrics).toEqual({
			differingFrames: 0,
			foregroundRmse: 0,
			maximumBoundsDelta: 0,
			maximumCentroidDistance: 0,
			maximumChannelDelta: 0,
			maximumForegroundRmse: 0,
			maximumFrameRmse: 0,
			minimumMaskIou: 1,
			rgbaRmse: 0,
		});
	});

	it("measures a visible one-pixel geometry shift", () => {
		const transparent = [0, 0, 0, 0];
		const white = [255, 255, 255, 255];
		const metrics = comparePremultipliedRgbaSequences({
			candidateBytes: Buffer.from([...transparent, ...white, ...transparent]),
			frameCount: 1,
			height: 1,
			referenceBytes: Buffer.from([...white, ...transparent, ...transparent]),
			width: 3,
		});

		expect(metrics.differingFrames).toBe(1);
		expect(metrics.maximumBoundsDelta).toBe(1);
		expect(metrics.maximumCentroidDistance).toBe(1);
		expect(metrics.maximumChannelDelta).toBe(255);
		expect(metrics.maximumForegroundRmse).toBe(255);
		expect(metrics.minimumMaskIou).toBe(0);
		expect(metrics.foregroundRmse).toBe(255);
		expect(metrics.rgbaRmse).toBeCloseTo(Math.sqrt((8 * 255 ** 2) / 12));
	});

	it("rejects buffers that do not contain the declared frame matrix", () => {
		expect(() =>
			comparePremultipliedRgbaSequences({
				candidateBytes: Buffer.alloc(4),
				frameCount: 2,
				height: 1,
				referenceBytes: Buffer.alloc(8),
				width: 1,
			})
		).toThrow("incompatible frame sizes");
	});
});
