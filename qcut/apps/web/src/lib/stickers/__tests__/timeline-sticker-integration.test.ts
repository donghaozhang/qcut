import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { TimelineTrack } from "@/types/timeline";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { clearAutoSaveTimer } from "@/stores/timeline/timeline-store-autosave";
import { TimelineStickerIntegration } from "../timeline-sticker-integration";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";

const runtimeDescriptor: StickerRuntimeDescriptor = {
	kind: "png-sequence",
	cycleDurationSeconds: 1,
	frames: [
		{ source: "original-frame.png", startSeconds: 0, durationSeconds: 1 },
	],
	repeat: { kind: "infinite" },
	completion: "freeze-last",
};

function mainTrack(): TimelineTrack {
	return {
		id: "main-track",
		name: "Main Track",
		type: "media",
		elements: [],
		order: 0,
		isMain: true,
		muted: false,
		hidden: false,
		locked: false,
	};
}

function sticker(): OverlaySticker {
	return {
		id: "sticker-1",
		mediaItemId: "image-1",
		position: { x: 50, y: 50 },
		size: { width: 20, height: 20 },
		rotation: 0,
		opacity: 1,
		zIndex: 1,
		maintainAspectRatio: true,
	};
}

describe("TimelineStickerIntegration", () => {
	beforeEach(() => {
		const track = mainTrack();
		useTimelineStore.setState({
			_tracks: [track],
			tracks: [track],
			history: [],
			redoStack: [],
			selectedElements: [],
		});
	});

	afterEach(() => {
		clearAutoSaveTimer();
	});

	it("creates a new sticker track above the main video track", async () => {
		const integration = new TimelineStickerIntegration({
			enableLogging: false,
		});
		const result = await integration.addStickerToTimeline(
			sticker(),
			2,
			5,
			undefined,
			runtimeDescriptor
		);

		expect(result.success).toBe(true);
		const tracks = useTimelineStore.getState().tracks;
		expect(tracks.map((track) => track.type)).toEqual(["sticker", "media"]);
		expect(tracks[0].elements).toEqual([
			expect.objectContaining({
				type: "sticker",
				stickerId: "sticker-1",
				startTime: 2,
				duration: 5,
				keyframes: {},
				stickerRuntime: runtimeDescriptor,
			}),
		]);
	});

	it("does not mutate a different project after an async boundary", async () => {
		const integration = new TimelineStickerIntegration({
			enableLogging: false,
		});
		let isExpectedProjectActive = true;
		const placement = integration.addStickerToTimeline(
			sticker(),
			2,
			5,
			() => isExpectedProjectActive
		);
		isExpectedProjectActive = false;

		await expect(placement).resolves.toEqual({
			success: false,
			error: "Active project changed while adding sticker",
		});
		expect(useTimelineStore.getState().tracks).toEqual([mainTrack()]);
	});
});
