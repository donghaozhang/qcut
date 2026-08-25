// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NativeDetectedPortraitFace } from "../jianying-portrait-adjustment-runtime/person-binding.js";
import { bindDetectedPortraitFaces } from "../jianying-portrait-adjustment-runtime/person-binding.js";

function face({
	trackId,
	x,
}: {
	trackId: number;
	x: number;
}): NativeDetectedPortraitFace {
	return {
		trackId,
		faceId: trackId + 100,
		freidTrackId: trackId,
		rect: { x, y: 0.2, width: 0.2, height: 0.3 },
		score: 1,
		yaw: 0,
		pitch: 0,
		roll: 0,
		trackingCount: 1,
		landmarkCount: 106,
	};
}

const bindings = [
	{
		personBindingId: "portrait-person:left",
		anchor: {
			rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.3 },
			frameNumber: 12,
		},
	},
	{
		personBindingId: "portrait-person:right",
		anchor: {
			rect: { x: 0.7, y: 0.2, width: 0.2, height: 0.3 },
			frameNumber: 12,
		},
	},
];

describe("Jianying portrait project person binding", () => {
	it("reconnects project people when a fresh host swaps freid ids", () => {
		const result = bindDetectedPortraitFaces({
			bindings,
			faces: [face({ trackId: 8, x: 0.7 }), face({ trackId: 9, x: 0.1 })],
			frameNumber: 12,
		});

		expect(result.faces).toMatchObject([
			{
				trackId: 8,
				personBindingId: "portrait-person:right",
				bindingStatus: "matched",
			},
			{
				trackId: 9,
				personBindingId: "portrait-person:left",
				bindingStatus: "matched",
			},
		]);
		expect(result.unmatchedPersonBindingIds).toEqual([]);
	});

	it("does not silently reuse geometry from another frame", () => {
		let nextId = 0;
		const result = bindDetectedPortraitFaces({
			bindings,
			faces: [face({ trackId: 0, x: 0.1 }), face({ trackId: 1, x: 0.7 })],
			frameNumber: 13,
			createPersonBindingId: () => `portrait-person:new-${nextId++}`,
		});

		expect(result.faces.map(({ bindingStatus }) => bindingStatus)).toEqual([
			"new",
			"new",
		]);
		expect(result.faces.map(({ personBindingId }) => personBindingId)).toEqual([
			"portrait-person:new-0",
			"portrait-person:new-1",
		]);
		expect(result.unmatchedPersonBindingIds).toEqual([
			"portrait-person:left",
			"portrait-person:right",
		]);
	});

	it("rejects ambiguous same-frame matches instead of guessing", () => {
		const result = bindDetectedPortraitFaces({
			bindings: [bindings[0]],
			faces: [face({ trackId: 3, x: 0.09 }), face({ trackId: 4, x: 0.11 })],
			frameNumber: 12,
			createPersonBindingId: () => "portrait-person:new",
		});

		expect(
			result.faces.every(({ bindingStatus }) => bindingStatus === "new")
		).toBe(true);
		expect(result.unmatchedPersonBindingIds).toEqual(["portrait-person:left"]);
	});
});
