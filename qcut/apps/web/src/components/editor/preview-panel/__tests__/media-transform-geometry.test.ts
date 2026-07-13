import { describe, expect, it } from "vitest";
import {
	cropFromLocalDelta,
	getSelectionBounds,
	normalizeRotationDelta,
	resizeMediaSelection,
	resizeSingleMedia,
	rotateMediaSelection,
	snapSelectionMove,
	type MediaTransformSnapshot,
} from "../media-transform-geometry";

const canvasSize = { width: 100, height: 100 };

function snapshot({
	elementId = "clip-1",
	x = 0,
	y = 0,
	scaleX = 1,
	scaleY = 1,
	rotation = 0,
}: Partial<MediaTransformSnapshot> = {}): MediaTransformSnapshot {
	return {
		trackId: "track-1",
		elementId,
		x,
		y,
		scaleX,
		scaleY,
		rotation,
		maintainAspectRatio: true,
		crop: { top: 0, right: 0, bottom: 0, left: 0 },
	};
}

describe("media transform geometry", () => {
	it("computes axis-aligned bounds around rotated media", () => {
		const bounds = getSelectionBounds({
			items: [
				snapshot({ x: 10, y: 20, scaleX: 0.5, scaleY: 0.25, rotation: 90 }),
			],
			canvasSize,
		});
		expect(bounds.centerX).toBeCloseTo(10);
		expect(bounds.centerY).toBeCloseTo(20);
		expect(bounds.width).toBeCloseTo(25);
		expect(bounds.height).toBeCloseTo(50);
	});

	it("snaps the closest selection edge or center to the canvas", () => {
		const bounds = getSelectionBounds({
			items: [snapshot({ x: -3, scaleX: 0.4, scaleY: 0.4 })],
			canvasSize,
		});
		const result = snapSelectionMove({
			bounds,
			delta: { x: 1, y: 48 },
			canvasSize,
			threshold: 3,
		});
		expect(result.delta.x).toBe(3);
		expect(result.guides.x).toBe(0);
		expect(result.delta.y).toBe(50);
		expect(result.guides.y).toBe(50);
	});

	it("keeps the opposite corner fixed during aspect-locked resize", () => {
		const resized = resizeSingleMedia({
			item: snapshot(),
			handle: "bottom-right",
			delta: { x: 50, y: 50 },
			canvasSize,
			lockAspect: true,
		});
		expect(resized.scaleX).toBeCloseTo(1.5);
		expect(resized.scaleY).toBeCloseTo(1.5);
		expect(resized.x).toBeCloseTo(25);
		expect(resized.y).toBeCloseTo(25);
		expect(resized.x - (resized.scaleX * canvasSize.width) / 2).toBeCloseTo(
			-50
		);
		expect(resized.y - (resized.scaleY * canvasSize.height) / 2).toBeCloseTo(
			-50
		);
	});

	it("maps resize movement into a rotated media's local axes", () => {
		const resized = resizeSingleMedia({
			item: snapshot({ rotation: 90 }),
			handle: "right",
			delta: { x: 0, y: 50 },
			canvasSize,
			lockAspect: false,
		});
		expect(resized.scaleX).toBeCloseTo(1.5);
		expect(resized.scaleY).toBeCloseTo(1);
		expect(resized.x).toBeCloseTo(0);
		expect(resized.y).toBeCloseTo(25);
	});

	it("resizes a multi-selection around the opposite group corner", () => {
		const items = [
			snapshot({ elementId: "left", x: -100 }),
			snapshot({ elementId: "right", x: 100 }),
		];
		const bounds = getSelectionBounds({ items, canvasSize });
		const resized = resizeMediaSelection({
			items,
			bounds,
			handle: "bottom-right",
			delta: { x: 300, y: 100 },
			lockAspect: true,
		});
		expect(resized[0]).toMatchObject({ elementId: "left", x: -50 });
		expect(resized[1]).toMatchObject({ elementId: "right", x: 350 });
		expect(resized[0].scaleX).toBeCloseTo(2);
		expect(resized[0].scaleY).toBeCloseTo(2);
	});

	it("rotates every selected media around the shared center", () => {
		const rotated = rotateMediaSelection({
			items: [
				snapshot({ elementId: "left", x: -50 }),
				snapshot({ elementId: "right", x: 50 }),
			],
			center: { x: 0, y: 0 },
			degrees: 90,
		});
		expect(rotated[0].x).toBeCloseTo(0);
		expect(rotated[0].y).toBeCloseTo(-50);
		expect(rotated[1].x).toBeCloseTo(0);
		expect(rotated[1].y).toBeCloseTo(50);
		expect(rotated.map((item) => item.rotation)).toEqual([90, 90]);
	});

	it("clamps crop handles before opposing edges collide", () => {
		const crop = cropFromLocalDelta({
			crop: { top: 0.1, right: 0.4, bottom: 0.1, left: 0.2 },
			side: "left",
			delta: { x: 100, y: 0 },
			width: 100,
			height: 100,
		});
		expect(crop.left).toBeCloseTo(0.58);
		expect(crop.left + crop.right).toBeCloseTo(0.98);
	});

	it("normalizes pointer angle changes across the 180 degree boundary", () => {
		expect(normalizeRotationDelta({ degrees: 358 })).toBe(-2);
		expect(normalizeRotationDelta({ degrees: -358 })).toBe(2);
	});
});
