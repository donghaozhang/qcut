import { describe, expect, it } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import {
	resolveDragOutZone,
	resolveTypeGroupEdgeIndex,
} from "../track-drop-zones";

const LANES_RECT = { top: 100, left: 50, right: 850 };
// Three lanes totalling 150px; the container itself stretches to 300.
const CONTENT_HEIGHT = 150;

describe("resolveDragOutZone", () => {
	it("reports above when released over the ruler", () => {
		expect(
			resolveDragOutZone({
				clientX: 400,
				clientY: 60,
				lanesRect: LANES_RECT,
				lanesContentHeight: CONTENT_HEIGHT,
			})
		).toBe("above");
	});

	it("reports below when released under the lane stack", () => {
		expect(
			resolveDragOutZone({
				clientX: 400,
				clientY: 280,
				lanesRect: LANES_RECT,
				lanesContentHeight: CONTENT_HEIGHT,
			})
		).toBe("below");
	});

	it("stays null inside the stack — per-lane handlers own that", () => {
		expect(
			resolveDragOutZone({
				clientX: 400,
				clientY: 180,
				lanesRect: LANES_RECT,
				lanesContentHeight: CONTENT_HEIGHT,
			})
		).toBeNull();
	});

	it("stays null over the track labels left of the lanes", () => {
		expect(
			resolveDragOutZone({
				clientX: 20,
				clientY: 60,
				lanesRect: LANES_RECT,
				lanesContentHeight: CONTENT_HEIGHT,
			})
		).toBeNull();
	});
});

function track(id: string, type: TimelineTrack["type"]): TimelineTrack {
	return { id, name: id, type, elements: [] };
}

describe("resolveTypeGroupEdgeIndex", () => {
	const tracks = [
		track("t1", "text"),
		track("s1", "sticker"),
		track("m1", "media"),
		track("m2", "media"),
		track("a1", "audio"),
	];

	it("above lands at the top of the type group", () => {
		expect(
			resolveTypeGroupEdgeIndex({ tracks, trackType: "media", edge: "above" })
		).toBe(2);
		expect(
			resolveTypeGroupEdgeIndex({ tracks, trackType: "text", edge: "above" })
		).toBe(0);
	});

	it("below lands right after the type group", () => {
		expect(
			resolveTypeGroupEdgeIndex({ tracks, trackType: "media", edge: "below" })
		).toBe(4);
		expect(
			resolveTypeGroupEdgeIndex({ tracks, trackType: "audio", edge: "below" })
		).toBe(5);
	});

	it("defaults sanely when no same-type lane exists", () => {
		expect(
			resolveTypeGroupEdgeIndex({
				tracks: [track("m1", "media")],
				trackType: "audio",
				edge: "below",
			})
		).toBe(1);
		expect(
			resolveTypeGroupEdgeIndex({
				tracks: [track("m1", "media")],
				trackType: "text",
				edge: "above",
			})
		).toBe(0);
	});
});
