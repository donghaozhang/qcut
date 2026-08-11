import { beforeEach, describe, expect, it, vi } from "vitest";
import { addClaudeMediaElement } from "../claude-timeline-bridge-helpers";

const storeMocks = vi.hoisted(() => {
	const mediaItems = [
		{
			id: "m-audio",
			name: "song.mp3",
			type: "audio" as const,
			duration: 164.2,
		},
		{
			id: "m-video",
			name: "clip.mp4",
			type: "video" as const,
			duration: 30,
		},
	];
	return { mediaItems };
});

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: { getState: vi.fn(() => ({})) },
}));

vi.mock("@/stores/project-store", () => ({
	useProjectStore: { getState: vi.fn(() => ({ activeProject: null })) },
}));

vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: {
		getState: vi.fn(() => ({ mediaItems: storeMocks.mediaItems })),
	},
}));

vi.mock("@qcut/platform-core", () => ({
	platform: vi.fn(() => ({ projectFolder: undefined })),
}));

vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugWarn: vi.fn(),
	debugError: vi.fn(),
}));

function makeTimelineStore() {
	return {
		findOrCreateTrack: vi.fn(() => "track-x"),
		addElementToTrack: vi.fn(),
	};
}

describe("Claude media element track routing", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("routes audio media to an audio track", async () => {
		const timelineStore = makeTimelineStore();

		await addClaudeMediaElement({
			element: { type: "audio", sourceName: "song.mp3", startTime: 5 },
			timelineStore: timelineStore as never,
			projectId: undefined,
		});

		expect(timelineStore.findOrCreateTrack).toHaveBeenCalledWith("audio", {
			startTime: 5,
			duration: 164.2,
		});
		expect(timelineStore.addElementToTrack).toHaveBeenCalledWith(
			"track-x",
			expect.objectContaining({
				type: "media",
				mediaId: "m-audio",
				startTime: 5,
				// Element duration falls back to the media item's real duration,
				// not the 10s default.
				duration: 164.2,
			})
		);
	});

	it("routes video media to the media track", async () => {
		const timelineStore = makeTimelineStore();

		await addClaudeMediaElement({
			element: { type: "video", sourceName: "clip.mp4", startTime: 0 },
			timelineStore: timelineStore as never,
			projectId: undefined,
		});

		expect(timelineStore.findOrCreateTrack).toHaveBeenCalledWith("media", {
			startTime: 0,
			duration: 30,
		});
		expect(timelineStore.addElementToTrack).toHaveBeenCalledWith(
			"track-x",
			expect.objectContaining({ mediaId: "m-video", duration: 30 })
		);
	});
});
