import { describe, it, expect } from "vitest";
import {
	ARROW_PATHS,
	ARROW_DIRECTIONS,
	drawSvgPathOnCanvas,
	type ArrowDirection,
} from "../figure-paths";

describe("figure-paths", () => {
	describe("ARROW_PATHS", () => {
		it("has paths for all 8 directions", () => {
			expect(Object.keys(ARROW_PATHS)).toHaveLength(8);
		});

		it("each path contains M and L commands", () => {
			for (const [direction, path] of Object.entries(ARROW_PATHS)) {
				expect(path).toContain("M");
				expect(path).toContain("L");
			}
		});

		it("each path has valid coordinate format", () => {
			const validPattern = /^[ML\s\d.]+$/;
			for (const path of Object.values(ARROW_PATHS)) {
				expect(path).toMatch(validPattern);
			}
		});

		it("coordinates stay within 0-100 range", () => {
			for (const path of Object.values(ARROW_PATHS)) {
				const numbers = path.match(/[\d.]+/g)!.map(Number);
				for (const n of numbers) {
					expect(n).toBeGreaterThanOrEqual(0);
					expect(n).toBeLessThanOrEqual(100);
				}
			}
		});
	});

	describe("ARROW_DIRECTIONS", () => {
		it("has 8 directions", () => {
			expect(ARROW_DIRECTIONS).toHaveLength(8);
		});

		it("matches ARROW_PATHS keys", () => {
			const pathKeys = new Set(Object.keys(ARROW_PATHS));
			for (const dir of ARROW_DIRECTIONS) {
				expect(pathKeys.has(dir)).toBe(true);
			}
		});
	});

	describe("drawSvgPathOnCanvas", () => {
		it("calls canvas drawing methods for valid path", () => {
			const mockCtx = {
				beginPath: () => {},
				moveTo: vi.fn(),
				lineTo: vi.fn(),
			} as unknown as CanvasRenderingContext2D;

			drawSvgPathOnCanvas(mockCtx, ARROW_PATHS.up, 0, 0, 200, 200);

			// Arrow "up" has 1 M and 4 L commands (3 path segments with M commands)
			expect(mockCtx.moveTo).toHaveBeenCalled();
			expect(mockCtx.lineTo).toHaveBeenCalled();
		});

		it("scales coordinates to target dimensions", () => {
			const moveToCalls: [number, number][] = [];
			const mockCtx = {
				beginPath: () => {},
				moveTo: (x: number, y: number) => moveToCalls.push([x, y]),
				lineTo: () => {},
			} as unknown as CanvasRenderingContext2D;

			// Scale 100x100 viewBox to 200x200 at offset (10, 20)
			drawSvgPathOnCanvas(mockCtx, "M 50 50", 10, 20, 200, 200);

			// 50 * (200/100) + 10 = 110, 50 * (200/100) + 20 = 120
			expect(moveToCalls[0][0]).toBeCloseTo(110);
			expect(moveToCalls[0][1]).toBeCloseTo(120);
		});

		it("handles empty path gracefully", () => {
			const mockCtx = {
				beginPath: () => {},
				moveTo: vi.fn(),
				lineTo: vi.fn(),
			} as unknown as CanvasRenderingContext2D;

			drawSvgPathOnCanvas(mockCtx, "", 0, 0, 100, 100);

			expect(mockCtx.moveTo).not.toHaveBeenCalled();
			expect(mockCtx.lineTo).not.toHaveBeenCalled();
		});
	});
});

// vi.fn import
import { vi } from "vitest";
