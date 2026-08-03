import { describe, expect, it } from "vitest";
import {
	findOccupyingElement,
	firstFreeStartTime,
} from "@/lib/timeline-occupancy";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";

function mediaElement({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}): TimelineElement {
	return {
		id,
		type: "media",
		name: id,
		mediaId: `media-${id}`,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
	} as TimelineElement;
}

function trackWith({
	elements,
	type = "media",
}: {
	elements: TimelineElement[];
	type?: TimelineTrack["type"];
}): TimelineTrack {
	return { id: "track-1", name: "track", type, elements } as TimelineTrack;
}

describe("findOccupyingElement", () => {
	it("finds the element already sitting at the requested span", () => {
		const track = trackWith({
			elements: [mediaElement({ id: "a", startTime: 0, duration: 10 })],
		});
		const hit = findOccupyingElement({ track, startTime: 0, duration: 10 });
		expect(hit?.id).toBe("a");
	});

	it("treats a back-to-back seam as free, not as a collision", () => {
		// The split of one clip into two produces exactly this arrangement, so
		// rejecting it would make splitting impossible.
		const track = trackWith({
			elements: [mediaElement({ id: "a", startTime: 0, duration: 10 })],
		});
		expect(
			findOccupyingElement({ track, startTime: 10, duration: 5 })
		).toBeNull();
	});

	it("catches a partial overlap from either side", () => {
		const track = trackWith({
			elements: [mediaElement({ id: "a", startTime: 10, duration: 10 })],
		});
		expect(
			findOccupyingElement({ track, startTime: 5, duration: 10 })?.id
		).toBe("a");
		expect(
			findOccupyingElement({ track, startTime: 15, duration: 10 })?.id
		).toBe("a");
	});

	it("catches an element wholly containing another", () => {
		const track = trackWith({
			elements: [mediaElement({ id: "a", startTime: 5, duration: 2 })],
		});
		expect(
			findOccupyingElement({ track, startTime: 0, duration: 20 })?.id
		).toBe("a");
	});

	it("ignores the element being moved", () => {
		const track = trackWith({
			elements: [mediaElement({ id: "a", startTime: 0, duration: 10 })],
		});
		expect(
			findOccupyingElement({
				track,
				startTime: 2,
				duration: 5,
				excludeElementId: "a",
			})
		).toBeNull();
	});

	it("applies to sticker tracks too — many stickers, one at a time", () => {
		const track = trackWith({
			elements: [mediaElement({ id: "a", startTime: 0, duration: 3 })],
			type: "sticker",
		});
		// A second sticker later on the same track is fine...
		expect(
			findOccupyingElement({ track, startTime: 3, duration: 3 })
		).toBeNull();
		// ...but not one on top of the first.
		expect(findOccupyingElement({ track, startTime: 1, duration: 3 })?.id).toBe(
			"a"
		);
	});

	it("reproduces the stack the CLI created at t=0", () => {
		const track = trackWith({
			elements: [
				mediaElement({ id: "clip-a", startTime: 0, duration: 10 }),
				mediaElement({ id: "clip-b", startTime: 0, duration: 6 }),
			],
		});
		expect(
			findOccupyingElement({ track, startTime: 0, duration: 10 })?.id
		).toBe("clip-a");
	});
});

describe("firstFreeStartTime", () => {
	it("returns the requested time when the span is already free", () => {
		const track = trackWith({
			elements: [mediaElement({ id: "a", startTime: 0, duration: 5 })],
		});
		expect(firstFreeStartTime({ track, duration: 2, notBefore: 5 })).toBe(5);
	});

	it("skips past the blocking element", () => {
		const track = trackWith({
			elements: [mediaElement({ id: "a", startTime: 0, duration: 10 })],
		});
		expect(firstFreeStartTime({ track, duration: 4, notBefore: 0 })).toBe(10);
	});

	it("finds a gap between two elements when the clip fits", () => {
		const track = trackWith({
			elements: [
				mediaElement({ id: "a", startTime: 0, duration: 5 }),
				mediaElement({ id: "b", startTime: 12, duration: 5 }),
			],
		});
		expect(firstFreeStartTime({ track, duration: 4, notBefore: 0 })).toBe(5);
	});

	it("skips a gap that is too small and lands after the last element", () => {
		const track = trackWith({
			elements: [
				mediaElement({ id: "a", startTime: 0, duration: 5 }),
				mediaElement({ id: "b", startTime: 6, duration: 5 }),
			],
		});
		expect(firstFreeStartTime({ track, duration: 4, notBefore: 0 })).toBe(11);
	});

	it("ignores the element being moved", () => {
		const track = trackWith({
			elements: [mediaElement({ id: "a", startTime: 0, duration: 10 })],
		});
		expect(
			firstFreeStartTime({
				track,
				duration: 4,
				notBefore: 0,
				excludeElementId: "a",
			})
		).toBe(0);
	});
});
