import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { clearAutoSaveTimer } from "../timeline-store-autosave";
import { useTimelineStore } from "../timeline-store";

/**
 * QTL-001 lock-contract matrix: every content command must be a complete
 * no-op — no track mutation, no history entry — when a direct target sits on
 * a locked track, regardless of which entry point invoked it. Derived sets
 * (ripple domains, "all tracks" defaults) skip locked tracks instead.
 */

function mediaElement({
	id,
	startTime,
	duration = 2,
	groupId,
}: {
	id: string;
	startTime: number;
	duration?: number;
	groupId?: string;
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
				mediaElement({ id: "a", startTime: 0 }),
				mediaElement({ id: "b", startTime: 2 }),
				mediaElement({ id: "c", startTime: 4 }),
			],
		},
		{
			id: "locked",
			name: "Locked",
			type: "media",
			locked: true,
			elements: [
				mediaElement({ id: "locked-a", startTime: 0 }),
				mediaElement({ id: "locked-b", startTime: 4 }),
			],
			transitions: [
				{
					id: "locked-transition",
					fromElementId: "locked-a",
					toElementId: "locked-b",
					presetId: "dissolve",
					type: "dissolve",
					duration: 0.5,
					easing: "easeInOut",
				},
			],
		},
		{
			id: "overlay",
			name: "Overlay",
			type: "media",
			elements: [mediaElement({ id: "overlay-a", startTime: 4 })],
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

function tracksSnapshot(): TimelineTrack[] {
	return JSON.parse(JSON.stringify(useTimelineStore.getState().tracks));
}

function expectNothingHappened(before: TimelineTrack[]) {
	expect(useTimelineStore.getState().tracks).toEqual(before);
	expect(useTimelineStore.getState().history).toHaveLength(0);
}

describe("timeline lock contract", () => {
	beforeEach(() => setTracks(baseTracks()));
	afterEach(() => clearAutoSaveTimer());

	describe("direct content commands fail closed", () => {
		it("addElementToTrack", () => {
			const before = tracksSnapshot();
			const result = useTimelineStore.getState().addElementToTrack("locked", {
				type: "media",
				mediaId: "new-media",
				name: "new",
				duration: 2,
				startTime: 8,
				trimStart: 0,
				trimEnd: 0,
			});
			expect(result).toBeNull();
			expectNothingHappened(before);
		});

		it("removeElementFromTrack", () => {
			const before = tracksSnapshot();
			useTimelineStore.getState().removeElementFromTrack("locked", "locked-a");
			expectNothingHappened(before);
		});

		it("moveElementToTrack in either direction", () => {
			const before = tracksSnapshot();
			useTimelineStore
				.getState()
				.moveElementToTrack("locked", "main", "locked-a");
			useTimelineStore.getState().moveElementToTrack("main", "locked", "a");
			expectNothingHappened(before);
		});

		it("updateElementTrim / updateElementDuration / updateElementStartTime", () => {
			const before = tracksSnapshot();
			useTimelineStore
				.getState()
				.updateElementTrim("locked", "locked-a", 0.5, 0);
			useTimelineStore
				.getState()
				.updateElementDuration("locked", "locked-a", 5);
			useTimelineStore
				.getState()
				.updateElementStartTime("locked", "locked-a", 9);
			expectNothingHappened(before);
		});

		it("updateElementStartTimeWithRipple", () => {
			useTimelineStore.setState({ rippleEditingEnabled: true });
			const before = tracksSnapshot();
			useTimelineStore
				.getState()
				.updateElementStartTimeWithRipple("locked", "locked-a", 9);
			expectNothingHappened(before);
		});

		it("splitElement / splitAndKeepLeft / splitAndKeepRight", () => {
			const before = tracksSnapshot();
			const splitResult = useTimelineStore
				.getState()
				.splitElement("locked", "locked-a", 1);
			useTimelineStore.getState().splitAndKeepLeft("locked", "locked-a", 1);
			useTimelineStore.getState().splitAndKeepRight("locked", "locked-a", 1);
			expect(splitResult).toBeNull();
			expectNothingHappened(before);
		});

		it("updateElementTransform resolves the element to its locked track", () => {
			const before = tracksSnapshot();
			useTimelineStore
				.getState()
				.updateElementTransform("locked-a", { position: { x: 10, y: 10 } });
			expectNothingHappened(before);
		});

		it("updateMediaElement", () => {
			const before = tracksSnapshot();
			useTimelineStore
				.getState()
				.updateMediaElement("locked", "locked-a", { volume: 0.5 });
			expectNothingHappened(before);
		});

		it("toggleElementHidden", () => {
			const before = tracksSnapshot();
			useTimelineStore.getState().toggleElementHidden("locked", "locked-a");
			expectNothingHappened(before);
		});

		it("updateMediaTiming", () => {
			const before = tracksSnapshot();
			useTimelineStore
				.getState()
				.updateMediaTiming("locked", "locked-a", { playbackRate: 2 });
			expectNothingHappened(before);
		});

		it("effect mutations", () => {
			const before = tracksSnapshot();
			useTimelineStore.getState().addEffectToElement("locked-a", "effect-1");
			useTimelineStore
				.getState()
				.removeEffectFromElement("locked-a", "effect-1");
			useTimelineStore.getState().clearElementEffects("locked-a");
			useTimelineStore.getState().setElementEffectState({
				elementId: "locked-a",
				effects: [],
				effectChains: [],
			});
			expectNothingHappened(before);
		});

		it("transition mutations", () => {
			const before = tracksSnapshot();
			const added = useTimelineStore.getState().addTransition({
				trackId: "locked",
				fromElementId: "locked-a",
				toElementId: "locked-b",
				videoMediaIds: new Set(["locked-a-media", "locked-b-media"]),
				presetId: "dissolve",
				type: "dissolve",
				duration: 0.5,
			});
			useTimelineStore.getState().updateTransition({
				trackId: "locked",
				transitionId: "locked-transition",
				updates: { duration: 0.8 },
				videoMediaIds: new Set(["locked-a-media", "locked-b-media"]),
			});
			useTimelineStore.getState().removeTransition({
				trackId: "locked",
				transitionId: "locked-transition",
			});
			expect(added).toBeNull();
			expectNothingHappened(before);
		});

		it("removeTrack / removeTrackWithRipple", () => {
			const before = tracksSnapshot();
			useTimelineStore.getState().removeTrack("locked");
			useTimelineStore.getState().removeTrackWithRipple("locked");
			expectNothingHappened(before);
		});

		it("replaceElementMedia rejects before importing anything", async () => {
			const before = tracksSnapshot();
			const result = await useTimelineStore
				.getState()
				.replaceElementMedia(
					"locked",
					"locked-a",
					new File(["x"], "x.mp4", { type: "video/mp4" })
				);
			expect(result).toEqual({
				success: false,
				error: "Cannot modify a locked track",
			});
			expectNothingHappened(before);
		});
	});

	describe("group and linked closures fail as a whole", () => {
		it("updateElementStartTime blocks a group spanning a locked track", () => {
			const tracks = baseTracks().map((track) =>
				track.id === "main"
					? {
							...track,
							elements: track.elements.map((element) =>
								element.id === "b" ? { ...element, groupId: "g" } : element
							),
						}
					: track.id === "locked"
						? {
								...track,
								elements: track.elements.map((element) =>
									element.id === "locked-a"
										? { ...element, groupId: "g" }
										: element
								),
							}
						: track
			);
			setTracks(tracks);
			const before = tracksSnapshot();
			useTimelineStore.getState().updateElementStartTime("main", "b", 8);
			expectNothingHappened(before);
		});

		it("groupSelectedElements / ungroupElements", () => {
			const tracks = baseTracks().map((track) =>
				track.id !== "overlay"
					? {
							...track,
							elements: track.elements.map((element) =>
								element.id === "b" || element.id === "locked-a"
									? { ...element, groupId: "existing" }
									: element
							),
						}
					: track
			);
			setTracks(tracks);
			useTimelineStore.setState({
				selectedElements: [
					{ trackId: "main", elementId: "a" },
					{ trackId: "locked", elementId: "locked-b" },
				],
			});
			const before = tracksSnapshot();
			expect(useTimelineStore.getState().groupSelectedElements()).toBeNull();
			expect(useTimelineStore.getState().ungroupElements("existing")).toBe(0);
			expectNothingHappened(before);
		});

		it("updateMediaTiming blocks when linked audio sits on a locked track", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "main",
					name: "Main",
					type: "media",
					isMain: true,
					elements: [
						{ ...mediaElement({ id: "b", startTime: 2 }), groupId: "sep" },
					],
				},
				{
					id: "audio",
					name: "Audio",
					type: "audio",
					locked: true,
					elements: [
						{
							...mediaElement({ id: "b-audio", startTime: 2 }),
							mediaId: "b-media",
							groupId: "sep",
						},
					],
				},
			];
			setTracks(tracks);
			const before = tracksSnapshot();
			useTimelineStore
				.getState()
				.updateMediaTiming("main", "b", { playbackRate: 2 });
			expectNothingHappened(before);
		});

		it("separateAudio never lands on a locked audio track", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "main",
					name: "Main",
					type: "media",
					isMain: true,
					elements: [mediaElement({ id: "v", startTime: 0 })],
				},
				{
					id: "audio",
					name: "Audio",
					type: "audio",
					locked: true,
					elements: [],
				},
			];
			setTracks(tracks);
			// Lane choice is a derived decision, so the locked lane is skipped
			// and a fresh audio lane is stacked instead (QTL-002).
			expect(
				useTimelineStore.getState().separateAudio("main", "v")
			).not.toBeNull();

			const state = useTimelineStore.getState();
			expect(
				state.tracks.find((track) => track.id === "audio")?.elements
			).toHaveLength(0);
			const newAudioTracks = state.tracks.filter(
				(track) => track.type === "audio" && track.id !== "audio"
			);
			expect(newAudioTracks).toHaveLength(1);
			expect(newAudioTracks[0].elements).toHaveLength(1);
		});

		it("deleteSelectedElementsWithRipple blocks a batch touching a locked track", () => {
			useTimelineStore.setState({
				selectedElements: [
					{ trackId: "main", elementId: "b" },
					{ trackId: "locked", elementId: "locked-a" },
				],
			});
			const before = tracksSnapshot();
			const result = useTimelineStore
				.getState()
				.deleteSelectedElementsWithRipple();
			expect(result).toEqual({
				deletedElements: 0,
				splitElements: 0,
				totalRemovedDuration: 0,
			});
			expectNothingHappened(before);
		});

		it("deleteTimeRange with an explicitly named locked track", () => {
			const before = tracksSnapshot();
			const result = useTimelineStore.getState().deleteTimeRange({
				startTime: 0,
				endTime: 2,
				trackIds: ["main", "locked"],
			});
			expect(result).toEqual({
				deletedElements: 0,
				splitElements: 0,
				totalRemovedDuration: 0,
			});
			expectNothingHappened(before);
		});
	});

	describe("derived domains skip locked tracks", () => {
		it("rippleDeleteAcrossTracks holds locked tracks in place", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "main",
					name: "Main",
					type: "media",
					isMain: true,
					elements: [
						mediaElement({ id: "m1", startTime: 0 }),
						mediaElement({ id: "m2", startTime: 6 }),
					],
				},
				{
					id: "locked",
					name: "Locked",
					type: "media",
					locked: true,
					elements: [mediaElement({ id: "l1", startTime: 6 })],
				},
			];
			setTracks(tracks);
			useTimelineStore.getState().rippleDeleteAcrossTracks(2, 6);

			const state = useTimelineStore.getState();
			expect(
				state.tracks
					.find((track) => track.id === "main")
					?.elements.map((element) => element.startTime)
			).toEqual([0, 2]);
			expect(
				state.tracks
					.find((track) => track.id === "locked")
					?.elements.map((element) => element.startTime)
			).toEqual([6]);
		});

		it("deleteTimeRange default targets leave locked content alone", () => {
			const result = useTimelineStore.getState().deleteTimeRange({
				startTime: 0,
				endTime: 2,
			});
			expect(result.deletedElements).toBe(1);

			const state = useTimelineStore.getState();
			expect(
				state.tracks
					.find((track) => track.id === "locked")
					?.elements.map((element) => [element.id, element.startTime])
			).toEqual([
				["locked-a", 0],
				["locked-b", 4],
			]);
			expect(
				state.tracks
					.find((track) => track.id === "main")
					?.elements.map((element) => [element.id, element.startTime])
			).toEqual([
				["b", 0],
				["c", 2],
			]);
		});

		it("deleteSelectedElementsWithRipple never shifts locked or unrelated tracks", () => {
			useTimelineStore.setState({
				selectedElements: [{ trackId: "main", elementId: "b" }],
			});
			useTimelineStore.getState().deleteSelectedElementsWithRipple();

			const state = useTimelineStore.getState();
			expect(
				state.tracks
					.find((track) => track.id === "locked")
					?.elements.map((element) => element.startTime)
			).toEqual([0, 4]);
			// Unrelated tracks are outside the ripple domain too (QTL-003).
			expect(
				state.tracks
					.find((track) => track.id === "overlay")
					?.elements.map((element) => element.startTime)
			).toEqual([4]);
			expect(
				state.tracks
					.find((track) => track.id === "main")
					?.elements.map((element) => element.startTime)
			).toEqual([0, 2]);
		});

		it("removeTrackWithRipple holds locked tracks in place", () => {
			const tracks: TimelineTrack[] = [
				{
					id: "gap",
					name: "Gap",
					type: "media",
					elements: [mediaElement({ id: "g", startTime: 0 })],
				},
				{
					id: "main",
					name: "Main",
					type: "media",
					isMain: true,
					elements: [mediaElement({ id: "m", startTime: 4 })],
				},
				{
					id: "locked",
					name: "Locked",
					type: "media",
					locked: true,
					elements: [mediaElement({ id: "l", startTime: 4 })],
				},
			];
			setTracks(tracks);
			useTimelineStore.getState().removeTrackWithRipple("gap");

			const state = useTimelineStore.getState();
			expect(
				state.tracks.find((track) => track.id === "main")?.elements[0].startTime
			).toBe(2);
			expect(
				state.tracks.find((track) => track.id === "locked")?.elements[0]
					.startTime
			).toBe(4);
		});
	});

	describe("commands stay usable around locked tracks", () => {
		it("unlocked edits proceed while a locked track exists", () => {
			const elementId = useTimelineStore.getState().addElementToTrack("main", {
				type: "media",
				mediaId: "new-media",
				name: "new",
				duration: 2,
				startTime: 8,
				trimStart: 0,
				trimEnd: 0,
			});
			expect(elementId).not.toBeNull();
			expect(useTimelineStore.getState().history).toHaveLength(1);
		});

		it("track metadata (mute, hidden, unlock) is not content", () => {
			useTimelineStore.getState().toggleTrackMute("locked");
			useTimelineStore.getState().toggleTrackHidden("locked");
			useTimelineStore.getState().toggleTrackLocked("locked");

			const locked = useTimelineStore
				.getState()
				.tracks.find((track) => track.id === "locked");
			expect(locked).toMatchObject({
				muted: true,
				hidden: true,
				locked: false,
			});
		});
	});
});
