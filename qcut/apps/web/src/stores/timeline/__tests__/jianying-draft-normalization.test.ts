import { describe, expect, it } from "vitest";
import { buildJianyingDraft } from "@qcut/editor-core/jianying-draft";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { normalizeLoadedTracks } from "../timeline-store-normalization";

function createMediaElement(): MediaElement {
	return {
		duration: 5,
		id: "clip-1",
		mediaId: "media-1",
		name: "clip.mov",
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
}

function createTrack(): TimelineTrack {
	return {
		elements: [createMediaElement()],
		id: "track-1",
		name: "Main",
		order: 0,
		type: "media",
	};
}

describe("JianYing draft snapshot normalization", () => {
	it("does not report QCut's neutral normalized defaults as lossy edits", () => {
		const tracks = normalizeLoadedTracks({ tracks: [createTrack()] });
		const result = buildJianyingDraft({
			draftOutputDirectory: "/exports/draft",
			snapshot: {
				media: [
					{
						duration: 5,
						height: 1080,
						id: "media-1",
						name: "clip.mov",
						sourcePath: "/source/clip.mov",
						type: "video",
						width: 1920,
					},
				],
				project: {
					backgroundColor: "transparent",
					backgroundType: "color",
					fps: 30,
					height: 1080,
					id: "project-1",
					name: "Interop",
					sceneId: "scene-1",
					width: 1920,
				},
				schemaVersion: 1,
				timelineDurationByElementId: { "clip-1": 5 },
				tracks,
			},
			targetPlatform: "macos",
		});

		expect(result.canWrite).toBe(true);
		expect(result.issues).toEqual([]);
	});
});
