import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

/**
 * QTL-008: deleting one grouped element deletes the whole user group as one
 * command; a pure separated-audio pair is a timing link and keeps
 * single-element deletion.
 */

function mediaElement({
	id,
	startTime,
	duration = 2,
	groupId,
	mediaId,
}: {
	id: string;
	startTime: number;
	duration?: number;
	groupId?: string;
	mediaId?: string;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: mediaId ?? `${id}-media`,
		duration,
		startTime,
		trimStart: 0,
		trimEnd: 0,
		...(groupId ? { groupId } : {}),
	};
}

function baseTracks(): TimelineTrack[] {
	return [
		{
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [
				mediaElement({ id: "solo", startTime: 0 }),
				mediaElement({ id: "g1", startTime: 2, groupId: "user-group" }),
			],
		},
		{
			id: "overlay",
			name: "Overlay",
			type: "media",
			elements: [
				mediaElement({ id: "g2", startTime: 2, groupId: "user-group" }),
				mediaElement({ id: "free", startTime: 6 }),
			],
		},
	];
}

function setTracks(tracks: TimelineTrack[]) {
	useTimelineStore.setState({
		_tracks: tracks,
		tracks,
		history: [],
		redoStack: [],
		selectedElements: [],
		selectedTransition: null,
		rippleEditingEnabled: false,
	});
}

function elementIds(trackId: string): string[] {
	return (
		useTimelineStore
			.getState()
			.tracks.find((track) => track.id === trackId)
			?.elements.map((element) => element.id) ?? []
	);
}

describe("timeline group closure", () => {
	beforeEach(() => setTracks(baseTracks()));
	afterEach(() => clearAutoSaveTimer());

	it("deletes every member of a user group in one history entry", () => {
		useTimelineStore.setState({
			selectedElements: [
				{ trackId: "main", elementId: "g1" },
				{ trackId: "overlay", elementId: "g2" },
			],
		});
		useTimelineStore.getState().removeElementFromTrack("main", "g1");

		expect(elementIds("main")).toEqual(["solo"]);
		expect(elementIds("overlay")).toEqual(["free"]);
		expect(useTimelineStore.getState().selectedElements).toEqual([]);
		expect(useTimelineStore.getState().history).toHaveLength(1);

		useTimelineStore.getState().undo();
		expect(elementIds("main")).toEqual(["solo", "g1"]);
		expect(elementIds("overlay")).toEqual(["g2", "free"]);
	});

	it("routes ripple deletion of a grouped element through the closure", () => {
		useTimelineStore.setState({ rippleEditingEnabled: true });
		useTimelineStore.getState().removeElementFromTrackWithRipple("main", "g1");

		expect(elementIds("main")).toEqual(["solo"]);
		expect(elementIds("overlay")).toEqual(["free"]);
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});

	it("blocks the whole deletion when any member track is locked", () => {
		const tracks = baseTracks().map((track) =>
			track.id === "overlay" ? { ...track, locked: true } : track
		);
		setTracks(tracks);
		const before = JSON.parse(
			JSON.stringify(useTimelineStore.getState().tracks)
		);

		useTimelineStore.getState().removeElementFromTrack("main", "g1");

		expect(useTimelineStore.getState().tracks).toEqual(before);
		expect(useTimelineStore.getState().history).toHaveLength(0);
	});

	it("keeps single-element deletion for a separated-audio pair", () => {
		const tracks: TimelineTrack[] = [
			{
				id: "main",
				name: "Main",
				type: "media",
				isMain: true,
				elements: [
					mediaElement({
						id: "v",
						startTime: 0,
						groupId: "sep",
						mediaId: "m",
					}),
				],
			},
			{
				id: "audio",
				name: "Audio",
				type: "audio",
				elements: [
					mediaElement({
						id: "a",
						startTime: 0,
						groupId: "sep",
						mediaId: "m",
					}),
				],
			},
		];
		setTracks(tracks);

		useTimelineStore.getState().removeElementFromTrack("main", "v");

		// The separated audio survives its video's deletion.
		expect(elementIds("audio")).toEqual(["a"]);
		expect(elementIds("main")).toEqual([]);
	});
});
