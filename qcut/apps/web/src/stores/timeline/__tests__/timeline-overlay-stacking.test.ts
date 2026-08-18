import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import type { EffectPreset } from "@/types/effects";
import { adjustmentTrackInsertionIndex } from "@/lib/timeline/adjustment-layer";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

/**
 * T6 of docs/task/timeline-rules-vs-jianying/TASKS.md: the overlayStacking
 * mode decides where NEW overlay lanes slot in. byType keeps the classic
 * type grouping; byArrival stacks the newest lane on top of everything, the
 * way Jianying layers its floating tracks (experiment J1b). Placement-only:
 * nothing re-sorts on toggle.
 */

function preset(): EffectPreset {
	return {
		id: "rain",
		name: "Rain",
		description: "",
		category: "basic",
		icon: "R",
		parameters: { saturation: 0.5 },
	} as EffectPreset;
}

function baseTracks(): TimelineTrack[] {
	// Explicit order values model reality: updateTracks stamps compacted
	// orders on every mutation, so any edited project carries them and new
	// inserts resolve by array position (the normalizeTrackOrder mixed rule).
	return [
		{ id: "text", name: "Text", type: "text", elements: [], order: 0 },
		{ id: "sticker", name: "Sticker", type: "sticker", elements: [], order: 1 },
		{
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [],
			order: 2,
		},
	];
}

function setup({ mode }: { mode: "byType" | "byArrival" }) {
	useTimelineStore.setState({
		_tracks: baseTracks(),
		tracks: baseTracks(),
		history: [],
		redoStack: [],
		selectedElements: [],
		selectedTransition: null,
		overlayStacking: mode,
	});
}

function trackTypes(): string[] {
	return useTimelineStore.getState().tracks.map((track) => track.type);
}

describe("overlay stacking mode", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterEach(() => {
		clearAutoSaveTimer();
		vi.restoreAllMocks();
	});

	it("byType keeps a new effect lane at the top of the media group", () => {
		setup({ mode: "byType" });
		useTimelineStore.getState().addEffectAtTime(preset(), 0);
		expect(trackTypes()).toEqual(["text", "sticker", "effect", "media"]);
	});

	it("byArrival stacks the new effect lane above every overlay", () => {
		setup({ mode: "byArrival" });
		useTimelineStore.getState().addEffectAtTime(preset(), 0);
		expect(trackTypes()).toEqual(["effect", "text", "sticker", "media"]);
	});

	it("byArrival creates new captions lanes on top instead of appending", () => {
		setup({ mode: "byArrival" });
		const trackId = useTimelineStore.getState().findOrCreateTrack("captions");
		expect(trackTypes()[0]).toBe("captions");
		expect(useTimelineStore.getState().tracks[0].id).toBe(trackId);
	});

	it("byType appends a fresh captions lane the legacy way", () => {
		setup({ mode: "byType" });
		useTimelineStore.getState().findOrCreateTrack("captions");
		expect(trackTypes()).toEqual(["text", "sticker", "media", "captions"]);
	});

	it("adjustment insertion index follows the mode", () => {
		const tracks = baseTracks();
		expect(adjustmentTrackInsertionIndex({ tracks })).toBe(2);
		expect(
			adjustmentTrackInsertionIndex({ tracks, overlayStacking: "byArrival" })
		).toBe(0);
	});
});
