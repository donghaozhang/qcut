import { describe, expect, it } from "vitest";
import { jianyingFilterLocalRenderTestUtils } from "../jianying-filter-local-runtime/render.js";

describe("Jianying local effect output blending", () => {
	it("keeps the exact native output at full intensity", () => {
		const source = new Uint8Array([10, 20, 30, 40]);
		const rendered = new Uint8Array([110, 120, 130, 255]);

		expect(
			jianyingFilterLocalRenderTestUtils.blendNativeEffectOutput({
				source,
				rendered,
				intensity: 100,
			})
		).toBe(rendered);
	});

	it("linearly blends RGB and preserves source alpha", () => {
		expect(
			jianyingFilterLocalRenderTestUtils.blendNativeEffectOutput({
				source: new Uint8Array([10, 20, 30, 40]),
				rendered: new Uint8Array([111, 121, 131, 255]),
				intensity: 50,
			})
		).toEqual(new Uint8Array([61, 71, 81, 40]));
	});

	it("rejects mismatched frame buffers", () => {
		expect(() =>
			jianyingFilterLocalRenderTestUtils.blendNativeEffectOutput({
				source: new Uint8Array(4),
				rendered: new Uint8Array(8),
				intensity: 50,
			})
		).toThrow("错误的像素数量");
	});
});

describe("Jianying local face evidence", () => {
	const face = {
		rawRect: [0.25, 0.2, 0.4, 0.5],
		score: 0.98,
		yaw: 0.01,
		pitch: -0.02,
		roll: 0.03,
		eyeDistance: 0,
		id: 1,
		action: 0,
		trackingCount: 3,
		landmarks: [[0.4, 0.3, -1]],
	};

	it("decodes finite face geometry in source coordinates", () => {
		expect(
			jianyingFilterLocalRenderTestUtils.decodeFaceEvidence({
				text: JSON.stringify({
					schemaVersion: 1,
					coordinateSpace: "source-normalized-top-left",
					faceCount: 1,
					faces: [face],
				}),
			})
		).toMatchObject({
			faceCount: 1,
			faces: [{ score: 0.98, landmarks: [[0.4, 0.3, -1]] }],
		});
	});

	it("rejects inconsistent counts and non-finite values", () => {
		expect(() =>
			jianyingFilterLocalRenderTestUtils.decodeFaceEvidence({
				text: JSON.stringify({
					schemaVersion: 1,
					coordinateSpace: "source-normalized-top-left",
					faceCount: 0,
					faces: [face],
				}),
			})
		).toThrow("faceCount");
		expect(() =>
			jianyingFilterLocalRenderTestUtils.decodeFaceEvidence({
				text: JSON.stringify({
					schemaVersion: 1,
					coordinateSpace: "source-normalized-top-left",
					faceCount: 1,
					faces: [{ ...face, score: "invalid" }],
				}),
			})
		).toThrow("score");
	});
});
