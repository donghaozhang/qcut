import { describe, it, expect } from "vitest";
import {
	sortTracksByOrder,
	normalizeTrackOrder,
	moveTrack,
	getMainTrack,
	ensureMainTrack,
	getTrackName,
	createTrack,
	getEffectiveDuration,
	getElementEndTime,
	getElementNameWithSuffix,
} from "../timeline/index.js";
import type { TimelineTrack } from "../types/timeline.js";

describe("sortTracksByOrder", () => {
	it("sorts tracks by type priority", () => {
		const tracks: TimelineTrack[] = [
			{ id: "1", name: "Audio", type: "audio", elements: [] },
			{ id: "2", name: "Text", type: "text", elements: [] },
			{ id: "3", name: "Media", type: "media", elements: [] },
		];
		const sorted = sortTracksByOrder(tracks);
		expect(sorted.map((t) => t.type)).toEqual(["text", "media", "audio"]);
		expect(sorted.map((t) => t.order)).toEqual([0, 1, 2]);
	});

	it("uses explicit order instead of type priority", () => {
		const tracks: TimelineTrack[] = [
			{ id: "media", name: "Media", type: "media", order: 0, elements: [] },
			{ id: "text", name: "Text", type: "text", order: 1, elements: [] },
		];

		expect(sortTracksByOrder(tracks).map((track) => track.id)).toEqual([
			"media",
			"text",
		]);
	});

	it("preserves array position while assigning order to an inserted track", () => {
		const tracks: TimelineTrack[] = [
			{ id: "top", name: "Top", type: "text", order: 0, elements: [] },
			{ id: "new", name: "New", type: "audio", elements: [] },
			{ id: "bottom", name: "Bottom", type: "media", order: 1, elements: [] },
		];

		const normalized = normalizeTrackOrder({ tracks });
		expect(normalized.map((track) => track.id)).toEqual([
			"top",
			"new",
			"bottom",
		]);
		expect(normalized.map((track) => track.order)).toEqual([0, 1, 2]);
	});

	it("moves tracks and compacts their order", () => {
		const tracks: TimelineTrack[] = [
			{ id: "a", name: "A", type: "text", order: 0, elements: [] },
			{ id: "b", name: "B", type: "media", order: 1, elements: [] },
			{ id: "c", name: "C", type: "audio", order: 2, elements: [] },
		];

		const moved = moveTrack({ tracks, trackId: "c", toIndex: 0 });
		expect(moved.map((track) => track.id)).toEqual(["c", "a", "b"]);
		expect(moved.map((track) => track.order)).toEqual([0, 1, 2]);
	});

	it("puts main track first within same type", () => {
		const tracks: TimelineTrack[] = [
			{ id: "1", name: "Media 2", type: "media", elements: [] },
			{
				id: "2",
				name: "Main",
				type: "media",
				elements: [],
				isMain: true,
			},
		];
		const sorted = sortTracksByOrder(tracks);
		expect(sorted[0].id).toBe("2");
	});

	it("does not mutate original array", () => {
		const tracks: TimelineTrack[] = [
			{ id: "1", name: "Audio", type: "audio", elements: [] },
			{ id: "2", name: "Text", type: "text", elements: [] },
		];
		sortTracksByOrder(tracks);
		expect(tracks[0].type).toBe("audio");
	});
});

describe("getMainTrack", () => {
	it("returns the main track", () => {
		const tracks: TimelineTrack[] = [
			{ id: "1", name: "Media", type: "media", elements: [] },
			{
				id: "2",
				name: "Main",
				type: "media",
				elements: [],
				isMain: true,
			},
		];
		expect(getMainTrack(tracks)?.id).toBe("2");
	});

	it("returns null when no main track", () => {
		expect(getMainTrack([])).toBeNull();
	});
});

describe("ensureMainTrack", () => {
	it("creates main track when missing", () => {
		const result = ensureMainTrack([]);
		expect(result).toHaveLength(1);
		expect(result[0].isMain).toBe(true);
		expect(result[0].type).toBe("media");
	});

	it("preserves existing main track", () => {
		const tracks: TimelineTrack[] = [
			{
				id: "existing",
				name: "Main",
				type: "media",
				elements: [],
				isMain: true,
			},
		];
		const result = ensureMainTrack(tracks);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("existing");
	});
});

describe("getTrackName / createTrack", () => {
	it("generates correct names for all types", () => {
		expect(getTrackName("media")).toBe("视频轨道");
		expect(getTrackName("text")).toBe("文本轨道");
		expect(getTrackName("audio")).toBe("音频轨道");
		expect(getTrackName("sticker")).toBe("贴纸轨道");
		expect(getTrackName("captions")).toBe("字幕轨道");
		expect(getTrackName("remotion")).toBe("Remotion 轨道");
		expect(getTrackName("markdown")).toBe("Markdown 轨道");
	});

	it("createTrack produces a valid track", () => {
		const track = createTrack("text");
		expect(track.id).toBeDefined();
		expect(track.type).toBe("text");
		expect(track.elements).toEqual([]);
		expect(track.muted).toBe(false);
	});
});

describe("getEffectiveDuration / getElementEndTime", () => {
	it("calculates effective duration with trim", () => {
		expect(
			getEffectiveDuration({ duration: 10, trimStart: 2, trimEnd: 3 })
		).toBe(5);
	});

	it("calculates end time", () => {
		expect(
			getElementEndTime({
				startTime: 5,
				duration: 10,
				trimStart: 1,
				trimEnd: 2,
			})
		).toBe(12);
	});
});

describe("getElementNameWithSuffix", () => {
	it("adds suffix to name", () => {
		expect(getElementNameWithSuffix("Clip", "left")).toBe("Clip (left)");
	});

	it("replaces existing suffix", () => {
		expect(getElementNameWithSuffix("Clip (right)", "left")).toBe(
			"Clip (left)"
		);
	});

	it("handles split suffix", () => {
		expect(getElementNameWithSuffix("Clip (split 3)", "audio")).toBe(
			"Clip (audio)"
		);
	});
});
