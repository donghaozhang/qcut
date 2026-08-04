import { describe, expect, it } from "vitest";
import {
	excludeLockedTrackIds,
	findTrackIdsForElements,
	findTrackIdsForGroup,
	getLockedTrackIds,
	preflightLockedTracks,
	type LockAwareTrack,
} from "../timeline/lock-contract.js";

const tracks: LockAwareTrack[] = [
	{ id: "main", elements: [{ id: "a" }, { id: "b", groupId: "g" }] },
	{ id: "locked", locked: true, elements: [{ id: "l1", groupId: "g" }] },
	{ id: "overlay", locked: false, elements: [{ id: "o1" }] },
];

describe("lock contract preflight", () => {
	it("collects locked track ids", () => {
		expect(getLockedTrackIds(tracks)).toEqual(new Set(["locked"]));
	});

	it("resolves element ids to their containing tracks", () => {
		expect(
			findTrackIdsForElements({ tracks, elementIds: ["a", "l1", "missing"] })
		).toEqual(new Set(["main", "locked"]));
	});

	it("resolves a group to every track it touches", () => {
		expect(findTrackIdsForGroup({ tracks, groupId: "g" })).toEqual(
			new Set(["main", "locked"])
		);
	});

	it("passes when no target sits on a locked track", () => {
		expect(
			preflightLockedTracks({
				tracks,
				trackIds: ["main", "overlay"],
				elementIds: ["a", "o1"],
			})
		).toBeNull();
	});

	it("fails when a track target is locked", () => {
		expect(
			preflightLockedTracks({ tracks, trackIds: ["main", "locked"] })
		).toEqual({ lockedTrackIds: ["locked"] });
	});

	it("fails when an element target sits on a locked track", () => {
		expect(preflightLockedTracks({ tracks, elementIds: ["l1"] })).toEqual({
			lockedTrackIds: ["locked"],
		});
	});

	it("short-circuits to allowed when nothing is locked", () => {
		const unlockedTracks = tracks.map((track) => ({
			...track,
			locked: false,
		}));
		expect(
			preflightLockedTracks({
				tracks: unlockedTracks,
				trackIds: ["locked"],
			})
		).toBeNull();
	});

	it("drops locked ids from derived sets", () => {
		expect(
			excludeLockedTrackIds({
				tracks,
				trackIds: ["main", "locked", "overlay"],
			})
		).toEqual(new Set(["main", "overlay"]));
	});
});
