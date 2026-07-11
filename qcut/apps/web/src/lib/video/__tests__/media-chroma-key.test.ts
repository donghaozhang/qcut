import { describe, expect, it } from "vitest";
import {
	chromaCleanupPasses,
	chromaScreenType,
	effectiveChromaSimilarity,
	normalizeMediaChromaKey,
	pickedPreviewColorToHex,
	resolveMediaChromaKeyAtTime,
	upsertMediaChromaKeyframe,
} from "../media-chroma-key";

describe("media chroma key", () => {
	it("normalizes legacy values and clamps refinements", () => {
		expect(
			normalizeMediaChromaKey({
				enabled: true,
				color: "#12ABEF",
				similarity: 2,
				blend: -1,
			})
		).toMatchObject({
			enabled: true,
			color: "#12abef",
			similarity: 1,
			blend: 0,
			shadow: 0,
			cleanup: 0,
			spill: 0,
		});
	});

	it("interpolates each refinement property independently", () => {
		const resolved = resolveMediaChromaKeyAtTime({
			chromaKey: {
				enabled: true,
				color: "#00ff00",
				similarity: 0.2,
				blend: 0.1,
				shadow: 0,
				cleanup: 0,
				spill: 0,
				keyframes: {
					similarity: [
						{ id: "s0", frame: 0, value: 0.2, easing: "linear" },
						{ id: "s1", frame: 30, value: 0.6, easing: "linear" },
					],
					cleanup: [
						{ id: "c0", frame: 0, value: 0, easing: "linear" },
						{ id: "c1", frame: 30, value: 0.4, easing: "linear" },
					],
				},
			},
			currentTime: 1.5,
			elementStartTime: 1,
			fps: 30,
		});
		expect(resolved.similarity).toBeCloseTo(0.4);
		expect(resolved.cleanup).toBeCloseTo(0.2);
	});

	it("keeps one keyframe per frame and sorts the result", () => {
		const result = upsertMediaChromaKeyframe({
			keyframes: [
				{ id: "later", frame: 30, value: 0.5, easing: "linear" },
				{ id: "old", frame: 10, value: 0.2, easing: "linear" },
			],
			keyframe: { id: "new", frame: 10, value: 0.3, easing: "easeOut" },
		});
		expect(result).toEqual([
			{ id: "new", frame: 10, value: 0.3, easing: "easeOut" },
			{ id: "later", frame: 30, value: 0.5, easing: "linear" },
		]);
	});

	it("maps refinement values to stable backend parameters", () => {
		expect(
			effectiveChromaSimilarity({ similarity: 0.2, shadow: 1 })
		).toBeCloseTo(0.48);
		expect(chromaCleanupPasses({ cleanup: 0.62 })).toBe(2);
		expect(chromaScreenType({ color: "#00ff00" })).toBe("green");
		expect(chromaScreenType({ color: "#0000ff" })).toBe("blue");
		expect(pickedPreviewColorToHex({ color: { r: 1, g: 0.5, b: 0 } })).toBe(
			"#ff8000"
		);
	});
});
