import { describe, expect, it } from "vitest";
import {
	addGuide,
	clampGuidePosition,
	clearGuides,
	EMPTY_GUIDES,
	getRulerTickStep,
	hasGuides,
	isWithinCanvas,
	moveGuide,
	pointerToCanvasPosition,
	removeGuide,
	resolveGuides,
} from "../preview-guides";

const CANVAS = { width: 1920, height: 1080 };

describe("preview guides", () => {
	it("resolves missing project guides to an empty set", () => {
		expect(resolveGuides(undefined)).toEqual({
			horizontal: [],
			vertical: [],
			locked: false,
			hidden: false,
		});
	});

	it("adds, moves, removes, and clears guides immutably", () => {
		const added = addGuide({
			guides: EMPTY_GUIDES,
			axis: "horizontal",
			position: 540,
		});
		expect(added.horizontal).toEqual([540]);
		expect(EMPTY_GUIDES.horizontal).toEqual([]);

		const moved = moveGuide({
			guides: added,
			axis: "horizontal",
			index: 0,
			position: 300,
		});
		expect(moved.horizontal).toEqual([300]);

		const outOfRange = moveGuide({
			guides: moved,
			axis: "horizontal",
			index: 5,
			position: 1,
		});
		expect(outOfRange).toBe(moved);

		const removed = removeGuide({
			guides: moved,
			axis: "horizontal",
			index: 0,
		});
		expect(removed.horizontal).toEqual([]);

		const populated = addGuide({
			guides: addGuide({
				guides: EMPTY_GUIDES,
				axis: "vertical",
				position: 10,
			}),
			axis: "horizontal",
			position: 20,
		});
		expect(hasGuides(populated)).toBe(true);
		const cleared = clearGuides({ ...populated, locked: true, hidden: true });
		expect(cleared).toEqual({
			horizontal: [],
			vertical: [],
			locked: true,
			hidden: true,
		});
	});

	it("converts pointer positions using the live (zoomed) rect", () => {
		// 1920x1080 canvas rendered at 960x540, then zoomed 150% → 1440x810.
		const rect = { left: 100, top: 50, width: 1440, height: 810 };
		const center = pointerToCanvasPosition({
			clientX: 100 + 720,
			clientY: 50 + 405,
			rect,
			canvasSize: CANVAS,
		});
		expect(center.x).toBeCloseTo(960);
		expect(center.y).toBeCloseTo(540);

		const origin = pointerToCanvasPosition({
			clientX: 100,
			clientY: 50,
			rect,
			canvasSize: CANVAS,
		});
		expect(origin).toEqual({ x: 0, y: 0 });
	});

	it("detects positions outside the canvas for drag-to-remove", () => {
		expect(
			isWithinCanvas({ position: { x: 10, y: 10 }, canvasSize: CANVAS })
		).toBe(true);
		expect(
			isWithinCanvas({ position: { x: -5, y: 10 }, canvasSize: CANVAS })
		).toBe(false);
		expect(
			isWithinCanvas({ position: { x: 10, y: 1081 }, canvasSize: CANVAS })
		).toBe(false);
	});

	it("clamps guide positions to the canvas", () => {
		expect(clampGuidePosition({ position: -20, max: 1080 })).toBe(0);
		expect(clampGuidePosition({ position: 2000, max: 1080 })).toBe(1080);
		expect(clampGuidePosition({ position: 540, max: 1080 })).toBe(540);
	});

	it("picks ruler tick steps that keep labels readable at any zoom", () => {
		expect(getRulerTickStep({ scale: 1 }).major).toBe(100);
		expect(getRulerTickStep({ scale: 0.5 }).major).toBe(200);
		expect(getRulerTickStep({ scale: 2 }).major).toBe(50);
		expect(getRulerTickStep({ scale: 0.05 }).major).toBe(2000);
		// Degenerate scales never crash or return undefined.
		expect(getRulerTickStep({ scale: 0 }).major).toBeGreaterThan(0);
		const tiny = getRulerTickStep({ scale: 0.000001 });
		expect(tiny.major).toBe(5000);
		expect(tiny.minor).toBe(1250);
	});
});
