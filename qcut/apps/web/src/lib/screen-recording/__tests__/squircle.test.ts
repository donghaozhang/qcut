import { describe, it, expect } from "vitest";
import {
	getSquirclePathPoints,
	getSquircleSvgPath,
} from "../squircle";

describe("squircle", () => {
	describe("getSquirclePathPoints", () => {
		it("returns empty for zero-size rect", () => {
			expect(
				getSquirclePathPoints({ x: 0, y: 0, width: 0, height: 100, radius: 10 }),
			).toEqual([]);
		});

		it("returns rectangle points for zero radius", () => {
			const points = getSquirclePathPoints({
				x: 0, y: 0, width: 100, height: 50, radius: 0,
			});
			expect(points).toHaveLength(4);
			expect(points[0]).toEqual({ x: 0, y: 0 });
			expect(points[1]).toEqual({ x: 100, y: 0 });
			expect(points[2]).toEqual({ x: 100, y: 50 });
			expect(points[3]).toEqual({ x: 0, y: 50 });
		});

		it("generates curved points for non-zero radius", () => {
			const points = getSquirclePathPoints({
				x: 0, y: 0, width: 100, height: 100, radius: 20,
			});
			// 4 corners × 10 segments + 1 start point = 41
			expect(points).toHaveLength(41);
		});

		it("clamps radius to half the smallest dimension", () => {
			const small = getSquirclePathPoints({
				x: 0, y: 0, width: 40, height: 20, radius: 100,
			});
			const clamped = getSquirclePathPoints({
				x: 0, y: 0, width: 40, height: 20, radius: 10,
			});
			// Both should produce same number of points
			expect(small.length).toBe(clamped.length);
		});

		it("all points stay within bounds", () => {
			const points = getSquirclePathPoints({
				x: 10, y: 20, width: 80, height: 60, radius: 15,
			});
			for (const p of points) {
				expect(p.x).toBeGreaterThanOrEqual(10 - 0.01);
				expect(p.x).toBeLessThanOrEqual(90 + 0.01);
				expect(p.y).toBeGreaterThanOrEqual(20 - 0.01);
				expect(p.y).toBeLessThanOrEqual(80 + 0.01);
			}
		});
	});

	describe("getSquircleSvgPath", () => {
		it("returns empty string for zero-size rect", () => {
			expect(
				getSquircleSvgPath({ x: 0, y: 0, width: 0, height: 0, radius: 0 }),
			).toBe("");
		});

		it("starts with M and ends with Z", () => {
			const path = getSquircleSvgPath({
				x: 0, y: 0, width: 100, height: 100, radius: 10,
			});
			expect(path.startsWith("M")).toBe(true);
			expect(path.endsWith("Z")).toBe(true);
		});

		it("contains L commands for each point", () => {
			const path = getSquircleSvgPath({
				x: 0, y: 0, width: 100, height: 100, radius: 10,
			});
			// 40 L commands (41 points - 1 M command)
			const lCount = (path.match(/L /g) || []).length;
			expect(lCount).toBe(40);
		});
	});
});
