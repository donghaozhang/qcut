import { describe, expect, it } from "vitest";
import { createTrack } from "@/stores/timeline/utils";
import {
	buildAlignedGeneratedMediaTracks,
	rollbackAlignedGeneratedMediaTracks,
	type AlignedGeneratedMediaResult,
} from "../aligned-generated-media";

function buildPair(): AlignedGeneratedMediaResult {
	const existingTrack = {
		...createTrack("media"),
		id: "existing",
		name: "Existing",
	};
	return buildAlignedGeneratedMediaTracks({
		tracks: [existingTrack],
		speechMedia: { id: "speech", name: "Speech.wav", type: "audio" },
		avatarMedia: { id: "avatar", name: "Avatar.mp4", type: "video" },
		startTime: 12.4,
		duration: 3.6,
		groupId: "caption-pair",
	});
}

describe("aligned generated media", () => {
	it("creates grouped audio and video with exact caption timing", () => {
		const result = buildPair();
		const generated = result.tracks
			.filter((track) => result.createdTrackIds.includes(track.id))
			.flatMap((track) => track.elements);

		expect(generated).toHaveLength(2);
		expect(generated).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					mediaId: "speech",
					startTime: 12.4,
					duration: 3.6,
					groupId: "caption-pair",
				}),
				expect.objectContaining({
					mediaId: "avatar",
					startTime: 12.4,
					duration: 3.6,
					groupId: "caption-pair",
				}),
			])
		);
		expect(result.audioElementId).toBeDefined();
		expect(result.videoElementId).toBeDefined();
	});

	it("keeps existing tracks and uses dedicated lanes to avoid overlap", () => {
		const result = buildPair();

		expect(result.tracks.some((track) => track.id === "existing")).toBe(true);
		expect(
			result.tracks
				.filter((track) => result.createdTrackIds.includes(track.id))
				.every((track) => track.elements.length === 1)
		).toBe(true);
	});

	it("rejects media with incompatible roles", () => {
		expect(() =>
			buildAlignedGeneratedMediaTracks({
				tracks: [],
				speechMedia: { id: "video", name: "Wrong.mp4", type: "video" },
				startTime: 0,
				duration: 2,
			})
		).toThrow("must be an audio asset");
	});

	it("rolls back the generated group without removing later user edits", () => {
		const result = buildPair();
		const generatedTrackId = result.createdTrackIds[0];
		const tracksWithLaterEdit = result.tracks.map((track) =>
			track.id === generatedTrackId
				? {
						...track,
						elements: [
							...track.elements,
							{
								...track.elements[0],
								id: "later-edit",
								groupId: undefined,
								startTime: 20,
							},
						],
					}
				: track
		);

		const rolledBack = rollbackAlignedGeneratedMediaTracks({
			tracks: tracksWithLaterEdit,
			groupId: result.groupId,
			createdTrackIds: result.createdTrackIds,
		});

		expect(
			rolledBack.flatMap((track) => track.elements).map((element) => element.id)
		).toContain("later-edit");
		expect(
			rolledBack
				.flatMap((track) => track.elements)
				.some((element) => element.groupId === result.groupId)
		).toBe(false);
		expect(rolledBack.some((track) => track.id === "existing")).toBe(true);
	});
});
