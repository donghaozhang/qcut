import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import {
	applyTimelineColorLabel,
	findTimelineElementsByColorLabel,
} from "../timeline-color-label-operations";
import { useTimelineStore } from "../timeline-store";

function mediaElement({
	id,
	colorLabel,
}: {
	id: string;
	colorLabel?: string;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `${id}-media`,
		startTime: 0,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
		colorLabel,
	};
}

function createTracks(): TimelineTrack[] {
	return [
		{
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [
				mediaElement({ id: "clip-a", colorLabel: "rose" }),
				mediaElement({ id: "clip-b" }),
			],
		},
		{
			id: "overlay",
			name: "Overlay",
			type: "media",
			elements: [mediaElement({ id: "clip-c", colorLabel: "rose" })],
		},
	];
}

function setTracks({ tracks }: { tracks: TimelineTrack[] }): void {
	useTimelineStore.setState({
		_tracks: tracks,
		tracks,
		history: [],
		redoStack: [],
		selectedElements: [],
		selectedTransition: null,
	});
}

describe("timeline color labels", () => {
	beforeEach(() => setTracks({ tracks: createTracks() }));
	afterEach(() => clearAutoSaveTimer());

	it("applies and clears one label across a multi-track selection", () => {
		const selected = [
			{ trackId: "main", elementId: "clip-a" },
			{ trackId: "main", elementId: "clip-b" },
		];
		const colored = applyTimelineColorLabel({
			tracks: createTracks(),
			elements: selected,
			colorLabel: "green",
		});

		expect(colored.updatedCount).toBe(2);
		expect(
			colored.tracks[0].elements.map((element) => element.colorLabel)
		).toEqual(["green", "green"]);

		const cleared = applyTimelineColorLabel({
			tracks: colored.tracks,
			elements: selected,
			colorLabel: undefined,
		});
		expect(cleared.updatedCount).toBe(2);
		expect(
			cleared.tracks[0].elements.map((element) => element.colorLabel)
		).toEqual([undefined, undefined]);
	});

	it("finds matching labels in deterministic timeline order", () => {
		expect(
			findTimelineElementsByColorLabel({
				tracks: createTracks(),
				colorLabel: "rose",
			})
		).toEqual([
			{ trackId: "main", elementId: "clip-a" },
			{ trackId: "overlay", elementId: "clip-c" },
		]);
	});

	it("persists one history entry for a batch color change", () => {
		const state = useTimelineStore.getState();
		const updatedCount = state.setColorLabelForElements({
			elements: [
				{ trackId: "main", elementId: "clip-a" },
				{ trackId: "main", elementId: "clip-b" },
			],
			colorLabel: "blue",
		});

		expect(updatedCount).toBe(2);
		expect(useTimelineStore.getState().history).toHaveLength(1);
		expect(
			useTimelineStore
				.getState()
				.tracks[0].elements.map((element) => element.colorLabel)
		).toEqual(["blue", "blue"]);
	});

	it("selects every clip with the same label", () => {
		const selectedCount = useTimelineStore
			.getState()
			.selectElementsByColorLabel({
				colorLabel: "rose",
			});

		expect(selectedCount).toBe(2);
		expect(useTimelineStore.getState().selectedElements).toEqual([
			{ trackId: "main", elementId: "clip-a" },
			{ trackId: "overlay", elementId: "clip-c" },
		]);
	});
});
