import { describe, expect, it } from "vitest";
import {
	addMediaMask,
	createMediaMask,
	duplicateMediaMask,
	moveMediaMask,
	removeMediaMask,
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
});
