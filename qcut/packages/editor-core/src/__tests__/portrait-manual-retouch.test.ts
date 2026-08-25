import { describe, expect, it } from "vitest";
import {
	hasMediaPortraitAdjustments,
	normalizeMediaPortraitAdjustments,
} from "../portrait-adjustments.js";

const points = [
	{ x: 0.4, y: 0.3 },
	{ x: 0.45, y: 0.35 },
];

describe("media portrait manual retouch", () => {
	it("normalizes supported brush strokes and drops invalid entries", () => {
		const normalized = normalizeMediaPortraitAdjustments({
			adjustments: {
				enabled: true,
				values: {},
				manualRetouch: {
					strokes: [
						{
							id: "smooth-1",
							tool: "smooth",
							mode: "paint",
							size: 48,
							intensity: 75,
							points,
							faceTrackId: 3,
						},
						{
							id: "smooth-1",
							tool: "smooth",
							mode: "erase",
							size: 48,
							intensity: 75,
							points,
						},
						{
							id: "outside",
							tool: "acne",
							mode: "paint",
							size: 20,
							intensity: 100,
							points: [
								{ x: -0.1, y: 0.2 },
								{ x: 1.1, y: 0.2 },
							],
						},
					],
				},
			},
		});

		expect(normalized.manualRetouch?.strokes).toEqual([
			{
				id: "smooth-1",
				tool: "smooth",
				mode: "paint",
				size: 48,
				intensity: 75,
				points,
				faceTrackId: 3,
			},
		]);
		expect(hasMediaPortraitAdjustments({ adjustments: normalized })).toBe(true);
	});

	it("caps persisted history and each native stroke", () => {
		const normalized = normalizeMediaPortraitAdjustments({
			adjustments: {
				enabled: true,
				values: {},
				manualRetouch: {
					strokes: Array.from({ length: 257 }, (_, index) => ({
						id: `stroke-${index}`,
						tool: "smooth" as const,
						mode: "paint" as const,
						size: 50,
						intensity: 100,
						points: Array.from({ length: 513 }, (_, pointIndex) => ({
							x: pointIndex / 512,
							y: 0.5,
						})),
					})),
				},
			},
		});

		expect(normalized.manualRetouch?.strokes).toHaveLength(256);
		expect(normalized.manualRetouch?.strokes[0]?.points).toHaveLength(512);
	});

	it("preserves a zero-intensity stroke for later non-destructive editing", () => {
		const normalized = normalizeMediaPortraitAdjustments({
			adjustments: {
				enabled: true,
				values: {},
				manualRetouch: {
					strokes: [
						{
							id: "smooth-zero",
							tool: "smooth",
							mode: "paint",
							size: 50,
							intensity: 0,
							points,
						},
					],
				},
			},
		});

		expect(normalized.manualRetouch?.strokes[0]?.intensity).toBe(0);
		expect(hasMediaPortraitAdjustments({ adjustments: normalized })).toBe(true);
	});

	it("requires the master switch even when strokes exist", () => {
		expect(
			hasMediaPortraitAdjustments({
				adjustments: {
					enabled: false,
					values: {},
					manualRetouch: {
						strokes: [
							{
								id: "smooth-1",
								tool: "smooth",
								mode: "paint",
								size: 50,
								intensity: 100,
								points,
							},
						],
					},
				},
			})
		).toBe(false);
	});
});
