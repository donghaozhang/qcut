import { describe, expect, it } from "vitest";
import {
	hasMediaPortraitAdjustments,
	normalizeMediaPortraitAdjustments,
} from "../portrait-adjustments.js";

describe("media portrait manual body", () => {
	it("normalizes all three persisted canvas tools", () => {
		const normalized = normalizeMediaPortraitAdjustments({
			adjustments: {
				enabled: true,
				values: {},
				manualBody: {
					stretch: { intensity: 50, upper: 0.7, bottom: 0.2 },
					slim: {
						intensity: -35,
						x: 0.5,
						y: 0.55,
						width: 0.3,
						height: 0.4,
						rotation: 25,
					},
					zoom: { intensity: 40, x: 0.4, y: 0.6, radius: 0.18 },
				},
			},
		});

		expect(normalized.manualBody).toEqual({
			stretch: { intensity: 50, upper: 0.7, bottom: 0.2 },
			slim: {
				intensity: -35,
				x: 0.5,
				y: 0.55,
				width: 0.3,
				height: 0.4,
				rotation: 25,
			},
			zoom: { intensity: 40, x: 0.4, y: 0.6, radius: 0.18 },
		});
		expect(hasMediaPortraitAdjustments({ adjustments: normalized })).toBe(true);
	});

	it("clamps unsafe values and repairs crossed stretch lines", () => {
		const normalized = normalizeMediaPortraitAdjustments({
			adjustments: {
				enabled: true,
				values: {},
				manualBody: {
					stretch: { intensity: 90, upper: 0.2, bottom: 0.8 },
					slim: {
						intensity: -90,
						x: -1,
						y: 2,
						width: 0,
						height: 3,
						rotation: 240,
					},
					zoom: { intensity: 90, x: 2, y: -1, radius: 0 },
				},
			},
		});

		expect(normalized.manualBody).toEqual({
			stretch: { intensity: 50, upper: 0.448, bottom: 0.202 },
			slim: {
				intensity: -50,
				x: 0,
				y: 1,
				width: 0.02,
				height: 1,
				rotation: 180,
			},
			zoom: { intensity: 50, x: 1, y: 0, radius: 0.01 },
		});
	});

	it("keeps geometry at zero intensity without activating native rendering", () => {
		const normalized = normalizeMediaPortraitAdjustments({
			adjustments: {
				enabled: true,
				values: {},
				manualBody: {
					zoom: { intensity: 0, x: 0.25, y: 0.75, radius: 0.2 },
				},
			},
		});

		expect(normalized.manualBody?.zoom?.x).toBe(0.25);
		expect(hasMediaPortraitAdjustments({ adjustments: normalized })).toBe(
			false
		);
	});

	it("survives a project JSON save and reopen round trip", () => {
		const saved = JSON.stringify({
			enabled: true,
			values: {},
			manualBody: {
				slim: {
					intensity: 35,
					x: 0.4,
					y: 0.6,
					width: 0.25,
					height: 0.5,
					rotation: -30,
				},
			},
		});
		const reopened = normalizeMediaPortraitAdjustments({
			adjustments: JSON.parse(saved),
		});

		expect(reopened.manualBody?.slim).toEqual({
			intensity: 35,
			x: 0.4,
			y: 0.6,
			width: 0.25,
			height: 0.5,
			rotation: -30,
		});
	});
});
