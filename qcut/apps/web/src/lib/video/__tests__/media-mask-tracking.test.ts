import { describe, expect, it } from "vitest";
import { createMediaMask } from "../media-mask-stack";
import {
	alphaMaskTrackingSample,
	applyMaskTrackingSamples,
	simplifyMaskTrackingSamples,
} from "../media-mask-tracking";

describe("media mask tracking", () => {
	it("extracts normalized padded bounds from an alpha mask", () => {
		const alpha = new Float32Array(16);
		alpha[5] = 1;
		alpha[6] = 1;
		alpha[9] = 1;
		alpha[10] = 1;
		expect(
			alphaMaskTrackingSample({
				alpha,
				width: 4,
				height: 4,
				frame: 7,
				padding: 0,
			})
		).toEqual({
			frame: 7,
			centerX: 0.5,
			centerY: 0.5,
			width: 0.5,
			height: 0.5,
		});
	});

	it("removes samples that are reproduced by linear interpolation", () => {
		const samples = Array.from({ length: 11 }, (_, frame) => ({
			frame,
			centerX: frame / 10,
			centerY: 0.5,
			width: 0.4,
			height: 0.8,
		}));
		expect(simplifyMaskTrackingSamples({ samples })).toHaveLength(2);
	});

	it("writes directional tracking results as independent mask keyframes", () => {
		const mask = createMediaMask({ id: "subject", type: "person", index: 0 });
		const samples = [0, 10, 20].map((frame) => ({
			frame,
			centerX: frame / 100 + 0.4,
			centerY: 0.5,
			width: 0.3,
			height: 0.7,
		}));
		const tracked = applyMaskTrackingSamples({
			mask,
			samples,
			direction: "forward",
			anchorFrame: 10,
			source: "mediapipe",
		});
		expect(tracked.tracking).toEqual({
			direction: "forward",
			source: "mediapipe",
			status: "ready",
		});
		expect(tracked.keyframes?.centerX?.map(({ frame }) => frame)).toEqual([
			10, 20,
		]);
		expect(tracked.keyframes?.width).toHaveLength(2);
	});
});
