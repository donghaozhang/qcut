import { describe, expect, it } from "vitest";
import { getCoverImageRect } from "../cover-renderer";

describe("cover fitting", () => {
	it("positions a cropped image at both edges without exposing gaps", () => {
		const options = {
			source: { width: 1920, height: 1080 },
			target: { width: 1080, height: 1920 },
			fit: "cover" as const,
		};
		const left = getCoverImageRect({
			...options,
			position: { x: 0, y: 0, zoom: 2 },
		});
		const right = getCoverImageRect({
			...options,
			position: { x: 1, y: 1, zoom: 2 },
		});
		expect(left.x).toBeCloseTo(0);
		expect(left.y).toBeCloseTo(0);
		expect(right.x + right.width).toBeCloseTo(1080);
		expect(right.y + right.height).toBeCloseTo(1920);
	});
	it("keeps the complete portrait inside a landscape project card", () => {
		expect(
			getCoverImageRect({
				source: { width: 1080, height: 1920 },
				target: { width: 640, height: 360 },
				fit: "contain",
			})
		).toEqual({ x: 218.75, y: 0, width: 202.5, height: 360 });
	});
	it("crops evenly only when the user explicitly selects fill", () => {
		const rect = getCoverImageRect({
			source: { width: 1920, height: 1080 },
			target: { width: 1080, height: 1920 },
			fit: "cover",
		});
		expect(rect.height).toBe(1920);
		expect(rect.width).toBeCloseTo(3413.333333);
		expect(rect.x).toBeCloseTo(-1166.666667);
	});
	it("has no offset for matching aspect ratios", () => {
		expect(
			getCoverImageRect({
				source: { width: 1920, height: 1080 },
				target: { width: 640, height: 360 },
				fit: "contain",
			})
		).toEqual({ x: 0, y: 0, width: 640, height: 360 });
	});
});
