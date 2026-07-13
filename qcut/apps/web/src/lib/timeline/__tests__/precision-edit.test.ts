import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { calculateRollEdit, calculateSlipEdit } from "../precision-edit";

function mediaElement({
	id,
	playbackRate = 1,
	reverse = false,
	startTime,
	trimEnd,
	trimStart,
}: {
	id: string;
	playbackRate?: number;
	reverse?: boolean;
	startTime: number;
	trimEnd: number;
	trimStart: number;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `${id}-media`,
		duration: 10,
		startTime,
		trimStart,
		trimEnd,
		playbackRate,
		reverse,
	};
}

describe("precision timeline edits", () => {
	it("slips the source window without moving or resizing the clip", () => {
		const element = mediaElement({
			id: "clip",
			startTime: 4,
			trimStart: 2,
			trimEnd: 3,
		});
		const result = calculateSlipEdit({ element, timelineDelta: 1 });

		expect(result).toEqual({
			appliedTimelineDelta: 1,
			updates: [
				{
					id: "clip",
					startTime: 4,
					trimStart: 3,
					trimEnd: 2,
				},
			],
		});
	});

	it("clamps slip edits at both source boundaries and respects reverse", () => {
		const forward = mediaElement({
			id: "forward",
			startTime: 0,
			trimStart: 1,
			trimEnd: 2,
		});
		const reverse = { ...forward, id: "reverse", reverse: true };

		expect(
			calculateSlipEdit({ element: forward, timelineDelta: 20 })
				?.appliedTimelineDelta
		).toBe(2);
		expect(
			calculateSlipEdit({ element: reverse, timelineDelta: 20 })
				?.appliedTimelineDelta
		).toBe(1);
	});

	it("rolls a touching seam while preserving the outer sequence edges", () => {
		const fromElement = mediaElement({
			id: "from",
			startTime: 0,
			trimStart: 1,
			trimEnd: 2,
		});
		const toElement = mediaElement({
			id: "to",
			startTime: 7,
			trimStart: 2,
			trimEnd: 1,
		});
		const result = calculateRollEdit({
			fromElement,
			timelineDelta: 1,
			toElement,
		});

		expect(result?.updates).toEqual([
			{
				id: "from",
				startTime: 0,
				trimStart: 1,
				trimEnd: 1,
			},
			{
				id: "to",
				startTime: 8,
				trimStart: 3,
				trimEnd: 1,
			},
		]);
		const fromUpdate = result?.updates[0];
		const toUpdate = result?.updates[1];
		expect(fromUpdate && 10 - fromUpdate.trimStart - fromUpdate.trimEnd).toBe(
			8
		);
		expect(
			toUpdate &&
				toUpdate.startTime + 10 - toUpdate.trimStart - toUpdate.trimEnd
		).toBe(14);
	});

	it("uses timeline-facing trim edges for reversed clips", () => {
		const fromElement = mediaElement({
			id: "from",
			reverse: true,
			startTime: 0,
			trimStart: 2,
			trimEnd: 1,
		});
		const toElement = mediaElement({
			id: "to",
			reverse: true,
			startTime: 7,
			trimStart: 2,
			trimEnd: 2,
		});
		const result = calculateRollEdit({
			fromElement,
			timelineDelta: 1,
			toElement,
		});

		expect(result?.updates).toEqual([
			expect.objectContaining({ trimStart: 1, trimEnd: 1 }),
			expect.objectContaining({ trimStart: 2, trimEnd: 3, startTime: 8 }),
		]);
	});

	it("rejects gaps and non-linear timing instead of producing partial edits", () => {
		const fromElement = mediaElement({
			id: "from",
			startTime: 0,
			trimStart: 1,
			trimEnd: 2,
		});
		const toElement = mediaElement({
			id: "to",
			startTime: 8,
			trimStart: 2,
			trimEnd: 1,
		});
		expect(
			calculateRollEdit({ fromElement, timelineDelta: 1, toElement })
		).toBeNull();
		expect(
			calculateSlipEdit({
				element: {
					...fromElement,
					speedKeyframes: [
						{ id: "speed", frame: 0, value: 1, easing: "linear" },
					],
				},
				timelineDelta: 1,
			})
		).toBeNull();
	});
});
