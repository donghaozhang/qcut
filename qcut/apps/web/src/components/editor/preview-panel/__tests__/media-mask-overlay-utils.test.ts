import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { describe, expect, it } from "vitest";
import {
	clamp,
	featherOutlineInsetPercent,
	featherPathStrokeWidth,
	isPointInteractionMode,
	keyboardDelta,
	linearFeatherFromHandle,
	linearFeatherFromKeyboard,
	localDelta,
	moveMaskPoint,
	penPathData,
	pointId,
	pointerAngle,
	resizeMaskFromHandle,
	resizeMaskFromKeyboard,
	worldDelta,
} from "../media-mask-overlay-utils";
import type { MediaMask } from "@/types/timeline";

function keyEvent({
	key,
	shiftKey = false,
}: {
	key: string;
	shiftKey?: boolean;
}) {
	return { key, shiftKey } as ReactKeyboardEvent;
}

describe("media mask overlay geometry", () => {
	it("maps screen movement back into a rotated mask's local coordinates", () => {
		const delta = localDelta({ deltaX: 0, deltaY: 0.25, rotation: 90 });
		expect(delta.x).toBeCloseTo(0.25);
		expect(delta.y).toBeCloseTo(0);
	});

	it("maps local movement back to screen coordinates", () => {
		const delta = worldDelta({ localX: 0.25, localY: 0, rotation: 90 });
		expect(delta.x).toBeCloseTo(0);
		expect(delta.y).toBeCloseTo(0.25);
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

	it("clamps values into the allowed range", () => {
		expect(clamp({ value: 0.5, min: 0, max: 1 })).toBe(0.5);
		expect(clamp({ value: -3, min: 0, max: 1 })).toBe(0);
		expect(clamp({ value: 7, min: 0, max: 1 })).toBe(1);
	});

	it("prefers an explicit point id over the generated fallback", () => {
		expect(
			pointId({
				point: { id: "custom", x: 0, y: 0 },
				index: 3,
				maskId: "pen",
			})
		).toBe("custom");
	});

	it("computes the pointer angle around a center in degrees", () => {
		expect(
			pointerAngle({ clientX: 110, clientY: 100, centerX: 100, centerY: 100 })
		).toBeCloseTo(0);
		expect(
			pointerAngle({ clientX: 100, clientY: 110, centerX: 100, centerY: 100 })
		).toBeCloseTo(90);
		expect(
			pointerAngle({ clientX: 90, clientY: 100, centerX: 100, centerY: 100 })
		).toBeCloseTo(180);
		expect(
			pointerAngle({ clientX: 100, clientY: 90, centerX: 100, centerY: 100 })
		).toBeCloseTo(-90);
	});
});

describe("feather guides", () => {
	it("returns no visual guide when feather is disabled", () => {
		expect(featherOutlineInsetPercent({ feather: 0 })).toBe(0);
		expect(featherPathStrokeWidth({ feather: 0 })).toBe(0);
	});

	it("keeps visible feather guides within a predictable range", () => {
		expect(featherOutlineInsetPercent({ feather: 0.01 })).toBe(4);
		expect(featherOutlineInsetPercent({ feather: 0.2 })).toBe(20);
		expect(featherOutlineInsetPercent({ feather: 0.9 })).toBe(40);
		expect(featherPathStrokeWidth({ feather: 0.01 })).toBe(0.012);
		expect(featherPathStrokeWidth({ feather: 0.2 })).toBe(0.05);
		expect(featherPathStrokeWidth({ feather: 0.9 })).toBe(0.12);
	});
});

describe("linear feather handles", () => {
	const mask: MediaMask = {
		id: "linear-mask",
		type: "linear",
		centerX: 0.5,
		centerY: 0.5,
		width: 0.4,
		height: 0.2,
		rotation: 0,
		feather: 0.2,
		invert: false,
	};

	it("expands the top feather edge when dragged upward", () => {
		const updates = linearFeatherFromHandle({
			mask,
			edge: "top",
			localY: -0.1,
		});
		expect(updates.feather).toBeCloseTo(0.3);
	});

	it("expands the bottom feather edge when dragged downward", () => {
		const updates = linearFeatherFromHandle({
			mask,
			edge: "bottom",
			localY: 0.1,
		});
		expect(updates.feather).toBeCloseTo(0.3);
	});

	it("maps keyboard nudges to the active feather edge", () => {
		expect(
			linearFeatherFromKeyboard({
				mask,
				edge: "top",
				event: keyEvent({ key: "ArrowUp" }),
			})?.feather
		).toBeCloseTo(0.21);
		expect(
			linearFeatherFromKeyboard({
				mask,
				edge: "bottom",
				event: keyEvent({ key: "ArrowDown", shiftKey: true }),
			})?.feather
		).toBeCloseTo(0.25);
	});
});

describe("resizeMaskFromHandle", () => {
	const mask: MediaMask = {
		id: "mask-1",
		type: "rectangle",
		centerX: 0.5,
		centerY: 0.5,
		width: 0.4,
		height: 0.2,
		rotation: 0,
		feather: 0,
		invert: false,
	};

	it("resizes from the right edge while keeping the opposite edge visually anchored", () => {
		const resized = resizeMaskFromHandle({
			mask,
			handle: "e",
			localX: 0.2,
			localY: 0.8,
		});
		expect(resized.width).toBeCloseTo(0.6);
		expect(resized.height).toBeCloseTo(0.2);
		expect(resized.centerX).toBeCloseTo(0.6);
		expect(resized.centerY).toBeCloseTo(0.5);
	});

	it("moves the center along the rotated local axis", () => {
		const resized = resizeMaskFromHandle({
			mask: { ...mask, rotation: 90 },
			handle: "e",
			localX: 0.2,
			localY: 0,
		});
		expect(resized.width).toBeCloseTo(0.6);
		expect(resized.centerX).toBeCloseTo(0.5);
		expect(resized.centerY).toBeCloseTo(0.6);
	});

	it("keeps the aspect ratio for corner handles when locked", () => {
		const resized = resizeMaskFromHandle({
			mask: { ...mask, maintainAspectRatio: true },
			handle: "se",
			localX: 0.2,
			localY: 0.01,
		});
		expect(resized.width).toBeCloseTo(0.6);
		expect(resized.height).toBeCloseTo(0.3);
	});

	it("allows edge handles to resize a single axis when aspect ratio is locked", () => {
		const resized = resizeMaskFromHandle({
			mask: { ...mask, maintainAspectRatio: true },
			handle: "s",
			localX: 0.9,
			localY: 0.2,
		});
		expect(resized.width).toBeCloseTo(0.4);
		expect(resized.height).toBeCloseTo(0.4);
		expect(resized.centerY).toBeCloseTo(0.6);
	});

	it("uses arrow direction to move the active edge handle", () => {
		const resized = resizeMaskFromKeyboard({
			mask,
			handle: "w",
			event: keyEvent({ key: "ArrowLeft" }),
		});
		expect(resized?.width).toBeCloseTo(0.41);
		expect(resized?.height).toBeCloseTo(0.2);
		expect(resized?.centerX).toBeCloseTo(0.495);
	});

	it("maps keyboard movement through mask rotation", () => {
		const resized = resizeMaskFromKeyboard({
			mask: { ...mask, rotation: 90 },
			handle: "e",
			event: keyEvent({ key: "ArrowDown" }),
		});
		expect(resized?.width).toBeCloseTo(0.41);
		expect(resized?.centerX).toBeCloseTo(0.5);
		expect(resized?.centerY).toBeCloseTo(0.505);
	});
});

describe("keyboardDelta", () => {
	it("maps arrow keys to fine nudges", () => {
		expect(keyboardDelta({ event: keyEvent({ key: "ArrowLeft" }) })).toEqual({
			x: -0.01,
			y: 0,
		});
		expect(keyboardDelta({ event: keyEvent({ key: "ArrowRight" }) })).toEqual({
			x: 0.01,
			y: 0,
		});
		expect(keyboardDelta({ event: keyEvent({ key: "ArrowUp" }) })).toEqual({
			x: 0,
			y: -0.01,
		});
		expect(keyboardDelta({ event: keyEvent({ key: "ArrowDown" }) })).toEqual({
			x: 0,
			y: 0.01,
		});
	});

	it("uses a coarser step when shift is held", () => {
		expect(
			keyboardDelta({ event: keyEvent({ key: "ArrowDown", shiftKey: true }) })
		).toEqual({ x: 0, y: 0.05 });
	});

	it("ignores non-arrow keys", () => {
		expect(keyboardDelta({ event: keyEvent({ key: "Enter" }) })).toBeNull();
		expect(keyboardDelta({ event: keyEvent({ key: "a" }) })).toBeNull();
	});
});

describe("isPointInteractionMode", () => {
	it("accepts pen point modes and rejects mask-level modes", () => {
		expect(isPointInteractionMode("anchor")).toBe(true);
		expect(isPointInteractionMode("handle-in")).toBe(true);
		expect(isPointInteractionMode("handle-out")).toBe(true);
		expect(isPointInteractionMode("move")).toBe(false);
		expect(isPointInteractionMode("resize")).toBe(false);
		expect(isPointInteractionMode("rotate")).toBe(false);
	});
});

describe("moveMaskPoint", () => {
	it("moves only the incoming tangent in handle-in mode", () => {
		const moved = moveMaskPoint({
			point: {
				id: "p1",
				x: 0.4,
				y: 0.5,
				handleIn: { x: 0.3, y: 0.5 },
				handleOut: { x: 0.5, y: 0.5 },
			},
			mode: "handle-in",
			deltaX: 0.1,
			deltaY: -0.1,
		});
		expect(moved.x).toBe(0.4);
		expect(moved.y).toBe(0.5);
		expect(moved.handleIn).toEqual({ x: 0.4, y: 0.4 });
		expect(moved.handleOut).toEqual({ x: 0.5, y: 0.5 });
	});

	it("spawns the incoming tangent from the anchor when missing", () => {
		const moved = moveMaskPoint({
			point: { id: "p1", x: 0.4, y: 0.5 },
			mode: "handle-in",
			deltaX: 0.2,
			deltaY: 0.1,
		});
		expect(moved.handleIn?.x).toBeCloseTo(0.6);
		expect(moved.handleIn?.y).toBeCloseTo(0.6);
		expect(moved.handleOut).toBeUndefined();
	});

	it("moves only the outgoing tangent in handle-out mode", () => {
		const moved = moveMaskPoint({
			point: {
				id: "p1",
				x: 0.4,
				y: 0.5,
				handleIn: { x: 0.3, y: 0.5 },
				handleOut: { x: 0.5, y: 0.5 },
			},
			mode: "handle-out",
			deltaX: -0.1,
			deltaY: 0.2,
		});
		expect(moved.x).toBe(0.4);
		expect(moved.handleIn).toEqual({ x: 0.3, y: 0.5 });
		expect(moved.handleOut).toEqual({ x: 0.4, y: 0.7 });
	});

	it("spawns the outgoing tangent from the anchor when missing", () => {
		const moved = moveMaskPoint({
			point: { id: "p1", x: 0.4, y: 0.5 },
			mode: "handle-out",
			deltaX: -0.2,
			deltaY: -0.3,
		});
		expect(moved.handleOut).toEqual({ x: 0.2, y: 0.2 });
		expect(moved.handleIn).toBeUndefined();
	});

	it("moves a bare anchor without inventing tangents", () => {
		const moved = moveMaskPoint({
			point: { id: "p1", x: 0.4, y: 0.5 },
			mode: "anchor",
			deltaX: 0.1,
			deltaY: 0.1,
		});
		expect(moved.x).toBeCloseTo(0.5);
		expect(moved.y).toBeCloseTo(0.6);
		expect(moved.handleIn).toBeUndefined();
		expect(moved.handleOut).toBeUndefined();
	});

	it("clamps coordinates to the -1..2 workspace", () => {
		const moved = moveMaskPoint({
			point: { id: "p1", x: 1.9, y: -0.9, handleOut: { x: 1.95, y: -0.95 } },
			mode: "anchor",
			deltaX: 0.5,
			deltaY: -0.5,
		});
		expect(moved.x).toBe(2);
		expect(moved.y).toBe(-1);
		expect(moved.handleOut).toEqual({ x: 2, y: -1 });
	});
});

describe("penPathData", () => {
	it("returns an empty string for no points", () => {
		expect(penPathData({ points: [], closed: true })).toBe("");
	});

	it("emits line segments when neither side has tangents", () => {
		const data = penPathData({
			points: [
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 },
			],
			closed: false,
		});
		expect(data).toBe("M 0 0 L 1 0 L 1 1");
	});

	it("falls back to the anchor as first control point when only handleIn exists", () => {
		const data = penPathData({
			points: [
				{ x: 0, y: 0 },
				{ x: 1, y: 1, handleIn: { x: 0.8, y: 1 } },
			],
			closed: false,
		});
		expect(data).toBe("M 0 0 C 0 0 0.8 1 1 1");
	});

	it("mixes curves and lines and only closes when asked", () => {
		const data = penPathData({
			points: [
				{ x: 0, y: 0, handleOut: { x: 0.2, y: 0 } },
				{ x: 1, y: 0 },
				{ x: 1, y: 1 },
			],
			closed: false,
		});
		expect(data).toBe("M 0 0 C 0.2 0 1 0 1 0 L 1 1");
		expect(data).not.toContain("Z");
	});
});
