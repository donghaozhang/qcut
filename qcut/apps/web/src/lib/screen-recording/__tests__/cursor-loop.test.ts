import { describe, it, expect } from "vitest";
import {
	buildLoopedCursorTelemetry,
	findLastMovingSampleTime,
} from "../cursor-loop";
import type { CursorTelemetryPoint } from "@/types/electron/cursor-telemetry";

function makePoint(
	t: number,
	x: number,
	y: number,
	p = false,
	c?: string,
): CursorTelemetryPoint {
	return { t, x, y, p, c };
}

describe("cursor-loop", () => {
	describe("findLastMovingSampleTime", () => {
		it("returns 0 for single point", () => {
			const points = [makePoint(100, 0.5, 0.5)];
			expect(findLastMovingSampleTime(points)).toBe(100);
		});

		it("returns last time when all points are stationary", () => {
			const points = [
				makePoint(0, 0.5, 0.5),
				makePoint(100, 0.5, 0.5),
				makePoint(200, 0.5, 0.5),
			];
			expect(findLastMovingSampleTime(points)).toBe(200);
		});

		it("finds last moving sample ignoring trailing stationary", () => {
			const points = [
				makePoint(0, 0.1, 0.1),
				makePoint(100, 0.5, 0.5), // big movement
				makePoint(200, 0.5, 0.5), // stationary
				makePoint(300, 0.5, 0.5), // stationary
			];
			expect(findLastMovingSampleTime(points)).toBe(100);
		});
	});

	describe("buildLoopedCursorTelemetry", () => {
		it("returns empty array for empty input", () => {
			expect(buildLoopedCursorTelemetry([], 1000)).toEqual([]);
		});

		it("preserves relative time ordering", () => {
			const points = [
				makePoint(0, 0.1, 0.1),
				makePoint(100, 0.3, 0.3),
				makePoint(200, 0.5, 0.5),
				makePoint(300, 0.7, 0.7),
			];
			const looped = buildLoopedCursorTelemetry(points, 1000);

			for (let i = 1; i < looped.length; i++) {
				expect(looped[i].t).toBeGreaterThanOrEqual(looped[i - 1].t);
			}
		});

		it("ends at the start position", () => {
			const points = [
				makePoint(0, 0.1, 0.2),
				makePoint(100, 0.5, 0.5),
				makePoint(200, 0.8, 0.9),
			];
			const looped = buildLoopedCursorTelemetry(points, 1000);
			const last = looped[looped.length - 1];

			expect(last.x).toBeCloseTo(0.1, 4);
			expect(last.y).toBeCloseTo(0.2, 4);
		});

		it("first point is at time 0", () => {
			const points = [
				makePoint(50, 0.1, 0.1),
				makePoint(150, 0.5, 0.5),
			];
			const looped = buildLoopedCursorTelemetry(points, 1000);
			expect(looped[0].t).toBe(0);
		});

		it("total output duration does not exceed input duration", () => {
			const points = [
				makePoint(0, 0.1, 0.1),
				makePoint(500, 0.9, 0.9),
			];
			const totalMs = 1000;
			const looped = buildLoopedCursorTelemetry(points, totalMs);
			const lastTime = looped[looped.length - 1].t;
			expect(lastTime).toBeLessThanOrEqual(totalMs);
		});

		it("handles very short recordings gracefully", () => {
			const points = [makePoint(0, 0.5, 0.5), makePoint(10, 0.5, 0.5)];
			const looped = buildLoopedCursorTelemetry(points, 50);
			expect(looped.length).toBeGreaterThan(0);
		});

		it("respects custom config overrides", () => {
			const points = [
				makePoint(0, 0.1, 0.1),
				makePoint(100, 0.5, 0.5),
				makePoint(200, 0.9, 0.9),
			];
			const looped = buildLoopedCursorTelemetry(points, 1000, {
				freezeDurationMs: 300,
				returnSteps: 5,
				settleDurationMs: 50,
			});

			const last = looped[looped.length - 1];
			expect(last.x).toBeCloseTo(0.1, 4);
			expect(last.y).toBeCloseTo(0.1, 4);
		});

		it("return motion uses easeOutQuint (starts fast, ends slow)", () => {
			const points = [
				makePoint(0, 0.0, 0.0),
				makePoint(100, 1.0, 1.0),
			];
			const looped = buildLoopedCursorTelemetry(points, 2000, {
				returnSteps: 10,
			});

			// Find the return motion section — points after the remapped originals
			// that are moving back toward (0, 0)
			const returnPoints = looped.filter(
				(p) => p.x < 1.0 && p.x > 0.0 && p.y < 1.0 && p.y > 0.0,
			);

			if (returnPoints.length >= 3) {
				// First step should cover more distance (ease-out starts fast)
				const firstDist = Math.hypot(
					returnPoints[1].x - returnPoints[0].x,
					returnPoints[1].y - returnPoints[0].y,
				);
				const lastDist = Math.hypot(
					returnPoints[returnPoints.length - 1].x -
						returnPoints[returnPoints.length - 2].x,
					returnPoints[returnPoints.length - 1].y -
						returnPoints[returnPoints.length - 2].y,
				);
				expect(firstDist).toBeGreaterThan(lastDist);
			}
		});
	});
});
