import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { buildMediaCanvasUpdate } from "../media-transform-update";

function mediaElement({
	keyframes,
}: {
	keyframes?: MediaElement["keyframes"];
} = {}): MediaElement {
	return {
		id: "clip-1",
		name: "Clip",
		type: "media",
		mediaId: "media-1",
		startTime: 1,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		x: 0,
		y: 0,
		scaleX: 1,
		scaleY: 1,
		rotation: 0,
		crop: { top: 0, right: 0, bottom: 0, left: 0 },
		keyframes,
	};
}

describe("buildMediaCanvasUpdate", () => {
	it("returns a static transform when the property has no keyframes", () => {
		const update = buildMediaCanvasUpdate({
			element: mediaElement(),
			mutation: { x: 42, y: -8, scaleX: 1.25 },
			currentTime: 2,
			fps: 30,
		});
		expect(update).toEqual({ x: 42, y: -8, scaleX: 1.25 });
	});

	it("upserts the current frame for an already animated property", () => {
		const update = buildMediaCanvasUpdate({
			element: mediaElement({
				keyframes: {
					x: [{ id: "x-0", frame: 0, value: 0, easing: "linear" }],
				},
			}),
			mutation: { x: 36, scaleX: 1.5 },
			currentTime: 2,
			fps: 30,
		});
		expect(update.x).toBe(36);
		expect(update.scaleX).toBe(1.5);
		expect(update.keyframes?.x).toHaveLength(2);
		expect(update.keyframes?.x?.[1]).toMatchObject({
			frame: 30,
			value: 36,
			easing: "linear",
		});
		expect(update.keyframes?.scaleX).toBeUndefined();
	});

	it("replaces an existing crop keyframe at the current frame", () => {
		const update = buildMediaCanvasUpdate({
			element: mediaElement({
				keyframes: {
					cropLeft: [
						{ id: "crop-current", frame: 15, value: 0.1, easing: "easeOut" },
					],
				},
			}),
			mutation: {
				crop: { top: 0, right: 0, bottom: 0, left: 0.25 },
			},
			currentTime: 1.5,
			fps: 30,
		});
		expect(update.keyframes?.cropLeft).toEqual([
			{ id: "crop-current", frame: 15, value: 0.25, easing: "easeOut" },
		]);
	});
});
