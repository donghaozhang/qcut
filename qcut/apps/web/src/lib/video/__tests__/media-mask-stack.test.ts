import { describe, expect, it } from "vitest";
import {
	addMediaMask,
	createMediaMask,
	duplicateMediaMask,
	moveMediaMask,
	removeMediaMask,
	updateMediaMaskAtFrame,
	updateMediaMaskInStack,
	upsertMediaMaskKeyframe,
} from "../media-mask-stack";

describe("media mask stack", () => {
	it("adds, updates, reorders, duplicates, and removes stable masks", () => {
		const first = createMediaMask({ id: "one", type: "ellipse", index: 0 });
		const second = createMediaMask({ id: "two", type: "rectangle", index: 1 });
		let masks = addMediaMask([], first);
		masks = addMediaMask(masks, { ...second, blendMode: "subtract" });
		masks = updateMediaMaskInStack({
			masks,
			maskId: "two",
			updates: { name: "Window", feather: 0.2 },
		});
		expect(masks[1]).toMatchObject({
			id: "two",
			name: "Window",
			blendMode: "subtract",
			feather: 0.2,
		});

		masks = moveMediaMask({ masks, maskId: "two", toIndex: 0 });
		expect(masks.map((mask) => mask.id)).toEqual(["two", "one"]);
		expect(masks[0].blendMode).toBe("add");

		masks = duplicateMediaMask({ masks, maskId: "two", newId: "copy" });
		expect(masks.map((mask) => mask.id)).toEqual(["two", "copy", "one"]);
		expect(masks[1].name).toContain("copy");

		masks = removeMediaMask(masks, "two");
		expect(masks.map((mask) => mask.id)).toEqual(["copy", "one"]);
		expect(masks[0].blendMode).toBe("add");
	});

	it("keeps only one keyframe for a property at each frame", () => {
		let mask = createMediaMask({ id: "one", type: "ellipse", index: 0 });
		mask = upsertMediaMaskKeyframe({
			mask,
			property: "centerX",
			keyframe: { id: "first", frame: 10, value: 0.25, easing: "linear" },
		});
		mask = upsertMediaMaskKeyframe({
			mask,
			property: "centerX",
			keyframe: {
				id: "replacement",
				frame: 10,
				value: 0.75,
				easing: "easeOut",
			},
		});

		expect(mask.keyframes?.centerX).toEqual([
			{ id: "replacement", frame: 10, value: 0.75, easing: "easeOut" },
		]);
	});

	it("writes animated canvas edits at the current frame without flattening the property", () => {
		const mask = {
			...createMediaMask({ id: "animated", type: "ellipse", index: 0 }),
			centerX: 0.4,
			keyframes: {
				centerX: [
					{ id: "start", frame: 0, value: 0.2, easing: "linear" as const },
					{ id: "end", frame: 20, value: 0.8, easing: "linear" as const },
				],
			},
		};

		const updated = updateMediaMaskAtFrame({
			mask,
			updates: { centerX: 0.6, width: 1.1, rotation: 12 },
			frame: 10,
		});

		expect(updated.centerX).toBe(0.4);
		expect(updated.width).toBe(1.1);
		expect(updated.rotation).toBe(12);
		expect(updated.keyframes?.centerX).toEqual([
			{ id: "start", frame: 0, value: 0.2, easing: "linear" },
			{
				id: "animated-centerX-10",
				frame: 10,
				value: 0.6,
				easing: "linear",
			},
			{ id: "end", frame: 20, value: 0.8, easing: "linear" },
		]);
	});
});
