import { describe, expect, it } from "vitest";
import {
	localDelta,
	moveMaskPoint,
	penPathData,
	pointId,
} from "../media-mask-overlay-utils";

describe("media mask overlay geometry", () => {
	it("maps screen movement back into a rotated mask's local coordinates", () => {
		const delta = localDelta({ deltaX: 0, deltaY: 0.25, rotation: 90 });
		expect(delta.x).toBeCloseTo(0.25);
		expect(delta.y).toBeCloseTo(0);
	});

	it("moves an anchor and its Bezier tangents together", () => {
		const moved = moveMaskPoint({
			point: {
				id: "p1",
				x: 0.4,
				y: 0.5,
				handleIn: { x: 0.3, y: 0.5 },
				handleOut: { x: 0.5, y: 0.5 },
			},
			mode: "anchor",
			deltaX: 0.1,
			deltaY: -0.2,
		});
		expect(moved).toMatchObject({
			x: 0.5,
			y: 0.3,
			handleIn: { x: 0.4, y: 0.3 },
			handleOut: { x: 0.6, y: 0.3 },
		});
	});

	it("builds stable IDs and cubic path commands", () => {
		const points = [
			{ x: 0.1, y: 0.2, handleOut: { x: 0.3, y: 0.2 } },
			{ x: 0.8, y: 0.7, handleIn: { x: 0.6, y: 0.7 } },
		];
		expect(pointId({ point: points[0], index: 0, maskId: "pen" })).toBe(
			"pen-point-1"
		);
		expect(penPathData({ points, closed: true })).toContain(
			"C 0.3 0.2 0.6 0.7 0.8 0.7"
		);
		expect(penPathData({ points, closed: true })).toMatch(/ Z$/);
	});
});
