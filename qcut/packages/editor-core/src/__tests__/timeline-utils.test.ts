import { describe, it, expect } from "vitest";
import {
	sortTracksByOrder,
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
		expect(getTrackName("media")).toBe("Media Track");
		expect(getTrackName("text")).toBe("Text Track");
		expect(getTrackName("audio")).toBe("Audio Track");
		expect(getTrackName("sticker")).toBe("Sticker Track");
		expect(getTrackName("captions")).toBe("Captions Track");
		expect(getTrackName("remotion")).toBe("Remotion Track");
		expect(getTrackName("markdown")).toBe("Markdown Track");
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
