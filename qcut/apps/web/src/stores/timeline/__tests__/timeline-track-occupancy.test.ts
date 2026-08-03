import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

function mediaElement({
	id,
	startTime,
	duration = 5,
}: {
	id: string;
	startTime: number;
	duration?: number;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `${id}-media`,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
	};
}

function tracks(): TimelineTrack[] {
	return [
		{
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [mediaElement({ id: "a", startTime: 0 })],
		},
		{
			id: "second",
			name: "Second",
			type: "media",
			elements: [mediaElement({ id: "b", startTime: 0 })],
		},
	];
}

function elementIds({ trackId }: { trackId: string }): string[] {
	return (
		useTimelineStore
			.getState()
			.tracks.find((track) => track.id === trackId)
			?.elements.map((element) => element.id) ?? []
	);
}

describe("a track holds one element at a time", () => {
	beforeEach(() => {
		const initial = tracks();
		useTimelineStore.setState({
			_tracks: initial,
			tracks: initial,
			history: [],
			redoStack: [],
			selectedElements: [],
		});
	});

	afterEach(() => clearAutoSaveTimer());

	describe("addElementToTrack", () => {
		it("refuses to stack onto an occupied span", () => {
			const id = useTimelineStore.getState().addElementToTrack("main", {
				type: "media",
				name: "intruder",
				mediaId: "intruder-media",
				startTime: 2,
				duration: 5,
				trimStart: 0,
				trimEnd: 0,
			});

			expect(id).toBeNull();
			expect(elementIds({ trackId: "main" })).toEqual(["a"]);
		});

		it("accepts a clip that starts exactly where the last one ends", () => {
			// Splitting produces touching clips, so a seam must stay legal.
			const id = useTimelineStore.getState().addElementToTrack("main", {
				type: "media",
				name: "next",
				mediaId: "next-media",
				startTime: 5,
				duration: 5,
				trimStart: 0,
				trimEnd: 0,
			});

			expect(id).not.toBeNull();
			expect(elementIds({ trackId: "main" })).toEqual([
				"a",
				expect.any(String),
			]);
		});
	});

	describe("moveElementToTrack", () => {
		it("does not lose the element when the target track is its own", () => {
			// Regression: the remap removed the element on the `from` branch and
			// never reached the `to` branch, deleting it outright.
			useTimelineStore.getState().moveElementToTrack("main", "main", "a");

			expect(elementIds({ trackId: "main" })).toEqual(["a"]);
		});

		it("refuses a move onto an occupied span", () => {
			useTimelineStore.getState().moveElementToTrack("main", "second", "a");

			expect(elementIds({ trackId: "main" })).toEqual(["a"]);
			expect(elementIds({ trackId: "second" })).toEqual(["b"]);
		});

		it("allows a move to a track with room", () => {
			useTimelineStore.getState().updateElementStartTime("main", "a", 10);
			useTimelineStore.getState().moveElementToTrack("main", "second", "a");

			expect(elementIds({ trackId: "second" })).toEqual(["b", "a"]);
		});
	});

	describe("updateElementStartTime", () => {
		it("refuses a slide that would land on a neighbour", () => {
			useTimelineStore.getState().addElementToTrack("main", {
				type: "media",
				name: "later",
				mediaId: "later-media",
				startTime: 10,
				duration: 5,
				trimStart: 0,
				trimEnd: 0,
			});

			useTimelineStore.getState().updateElementStartTime("main", "a", 8);

			const moved = useTimelineStore
				.getState()
				.tracks.find((track) => track.id === "main")
				?.elements.find((element) => element.id === "a");
			expect(moved?.startTime).toBe(0);
		});

		it("allows a slide into free space", () => {
			useTimelineStore.getState().updateElementStartTime("main", "a", 20);

			const moved = useTimelineStore
				.getState()
				.tracks.find((track) => track.id === "main")
				?.elements.find((element) => element.id === "a");
			expect(moved?.startTime).toBe(20);
		});
	});

	describe("setTrackElementStartTimes", () => {
		it("repairs a track that is already stacked", () => {
			// The reason this action exists: legacy projects hold elements piled at
			// the same time, and moving them one at a time would hit the rule on
			// every intermediate step and silently do nothing.
			const stacked: TimelineTrack[] = [
				{
					id: "main",
					name: "Main",
					type: "media",
					isMain: true,
					elements: [
						mediaElement({ id: "a", startTime: 0, duration: 10 }),
						mediaElement({ id: "b", startTime: 0, duration: 6 }),
						mediaElement({ id: "c", startTime: 0, duration: 4 }),
					],
				},
			];
			useTimelineStore.setState({ _tracks: stacked, tracks: stacked });

			const applied = useTimelineStore
				.getState()
				.setTrackElementStartTimes("main", { a: 0, b: 10, c: 16 });

			expect(applied).toBe(true);
			const starts = useTimelineStore
				.getState()
				.tracks.find((track) => track.id === "main")
				?.elements.map((element) => element.startTime);
			expect(starts).toEqual([0, 10, 16]);
		});

		it("reports false and changes nothing when the result overlaps", () => {
			const stacked: TimelineTrack[] = [
				{
					id: "main",
					name: "Main",
					type: "media",
					isMain: true,
					elements: [
						mediaElement({ id: "a", startTime: 0, duration: 10 }),
						mediaElement({ id: "b", startTime: 10, duration: 5 }),
					],
				},
			];
			useTimelineStore.setState({ _tracks: stacked, tracks: stacked });

			const applied = useTimelineStore
				.getState()
				.setTrackElementStartTimes("main", { b: 5 });

			expect(applied).toBe(false);
			const starts = useTimelineStore
				.getState()
				.tracks.find((track) => track.id === "main")
				?.elements.map((element) => element.startTime);
			expect(starts).toEqual([0, 10]);
		});
	});

	describe("findOrCreateTrack", () => {
		it("returns the first lane when no span is given", () => {
			expect(useTimelineStore.getState().findOrCreateTrack("media")).toBe(
				"main"
			);
		});

		it("skips an occupied lane and picks one with room", () => {
			useTimelineStore.getState().updateElementStartTime("second", "b", 30);

			expect(
				useTimelineStore
					.getState()
					.findOrCreateTrack("media", { startTime: 0, duration: 5 })
			).toBe("second");
		});

		it("stacks a new track when every lane is occupied", () => {
			const trackId = useTimelineStore
				.getState()
				.findOrCreateTrack("media", { startTime: 0, duration: 5 });

			expect(trackId).not.toBe("main");
			expect(trackId).not.toBe("second");
			expect(
				useTimelineStore.getState().tracks.some((track) => track.id === trackId)
			).toBe(true);
		});
	});
});
