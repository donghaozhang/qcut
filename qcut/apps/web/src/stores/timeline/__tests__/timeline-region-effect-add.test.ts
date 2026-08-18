import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineTrack } from "@/types/timeline";
import type { EffectPreset } from "@/types/effects";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

/**
 * T5 of docs/task/timeline-rules-vs-jianying/TASKS.md: applying a preset with
 * nothing selected drops a region effect segment — a fresh effect lane right
 * above the topmost media track, 3s at the playhead (Jianying 特效轨, J3).
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
	return [
		{ id: "text", name: "Text", type: "text", elements: [] },
		{
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [
				{
					id: "clip",
					name: "clip",
					type: "media",
					mediaId: "m1",
					duration: 10,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		},
	];
}

describe("addEffectAtTime", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		useTimelineStore.setState({
			_tracks: baseTracks(),
			tracks: baseTracks(),
			history: [],
			redoStack: [],
			selectedElements: [],
			selectedTransition: null,
		});
	});
	afterEach(() => {
		clearAutoSaveTimer();
		vi.restoreAllMocks();
	});

	it("creates an effect lane above the topmost media track with a 3s segment", () => {
		const elementId = useTimelineStore.getState().addEffectAtTime(preset(), 2);
		expect(elementId).toBeTruthy();

		const tracks = useTimelineStore.getState().tracks;
		const effectIndex = tracks.findIndex((track) => track.type === "effect");
		const mediaIndex = tracks.findIndex((track) => track.type === "media");
		expect(effectIndex).toBeGreaterThanOrEqual(0);
		expect(effectIndex).toBeLessThan(mediaIndex);

		const segment = tracks[effectIndex].elements[0];
		expect(segment).toMatchObject({
			type: "effect",
			name: "Rain",
			startTime: 2,
			duration: 3,
		});
		if (segment.type === "effect") {
			expect(segment.targetElementId).toBeUndefined();
			expect(segment.effect.parameters).toMatchObject({ saturation: 0.5 });
			expect(segment.effect.enabled).toBe(true);
		}
	});
});
