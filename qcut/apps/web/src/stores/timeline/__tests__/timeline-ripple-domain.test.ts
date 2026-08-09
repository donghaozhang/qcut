import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

/**
 * QTL-003 ripple-domain contract: a ripple edit shifts the edited track and
 * tracks holding elements linked to it — nothing else. A locked linked
 * dependency fails the whole command; a locked unrelated track is simply
 * outside the domain.
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

/**
 * main:    v1(0-2)  v2(2-4, sep)  v3(6-8)
 * audio:   a2(2-4, sep→v2 media)  a-late(6-8)
 * overlay: o1(6-8)   — unrelated, must never move
 */
function linkedTracks(): TimelineTrack[] {
	return [
		{
			id: "main",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [
				mediaElement({ id: "v1", startTime: 0 }),
				mediaElement({
					id: "v2",
					startTime: 2,
					groupId: "sep",
					mediaId: "shared-media",
				}),
				mediaElement({ id: "v3", startTime: 6 }),
			],
		},
		{
			id: "audio",
			name: "Audio",
			type: "audio",
			elements: [
				mediaElement({
					id: "a2",
					startTime: 2,
					groupId: "sep",
					mediaId: "shared-media",
				}),
				mediaElement({ id: "a-late", startTime: 6 }),
			],
		},
		{
			id: "overlay",
			name: "Overlay",
			type: "media",
			elements: [mediaElement({ id: "o1", startTime: 6 })],
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
		rippleEditingEnabled: true,
	});
}

function startTimes(trackId: string): number[] {
	return (
		useTimelineStore
			.getState()
			.tracks.find((track) => track.id === trackId)
			?.elements.map((element) => element.startTime) ?? []
	);
}

describe("timeline ripple domain", () => {
	beforeEach(() => setTracks(linkedTracks()));
	afterEach(() => clearAutoSaveTimer());

	it("shifts the linked audio track with a main-track ripple delete", () => {
		useTimelineStore.getState().removeElementFromTrackWithRipple("main", "v1");

		// Gap [0,2) closes on main and on the linked audio lane.
		expect(startTimes("main")).toEqual([0, 4]);
		expect(startTimes("audio")).toEqual([0, 4]);
		// The unrelated overlay holds its position.
		expect(startTimes("overlay")).toEqual([6]);
		expect(useTimelineStore.getState().history).toHaveLength(1);

		// One undo restores the whole edit.
		useTimelineStore.getState().undo();
		expect(startTimes("main")).toEqual([0, 2, 6]);
		expect(startTimes("audio")).toEqual([2, 6]);
	});

	it("applies the same domain to batch ripple deletion", () => {
		useTimelineStore.setState({
			selectedElements: [{ trackId: "main", elementId: "v1" }],
		});
		const result = useTimelineStore
			.getState()
			.deleteSelectedElementsWithRipple();

		expect(result.deletedElements).toBe(1);
		expect(startTimes("main")).toEqual([0, 4]);
		expect(startTimes("audio")).toEqual([0, 4]);
		expect(startTimes("overlay")).toEqual([6]);
	});

	it("fails the whole command when a linked dependency track is locked", () => {
		const tracks = linkedTracks().map((track) =>
			track.id === "audio" ? { ...track, locked: true } : track
		);
		setTracks(tracks);
		const before = JSON.parse(
			JSON.stringify(useTimelineStore.getState().tracks)
		);

		useTimelineStore.getState().removeElementFromTrackWithRipple("main", "v1");
		useTimelineStore.setState({
			selectedElements: [{ trackId: "main", elementId: "v1" }],
		});
		const result = useTimelineStore
			.getState()
			.deleteSelectedElementsWithRipple();

		expect(result).toEqual({
			deletedElements: 0,
			splitElements: 0,
			totalRemovedDuration: 0,
		});
		expect(useTimelineStore.getState().tracks).toEqual(before);
		expect(useTimelineStore.getState().history).toHaveLength(0);
	});

	it("treats a locked unrelated track as outside the domain", () => {
		const tracks = linkedTracks().map((track) =>
			track.id === "overlay" ? { ...track, locked: true } : track
		);
		setTracks(tracks);

		useTimelineStore.getState().removeElementFromTrackWithRipple("main", "v1");

		expect(startTimes("main")).toEqual([0, 4]);
		expect(startTimes("audio")).toEqual([0, 4]);
		expect(startTimes("overlay")).toEqual([6]);
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});
});
