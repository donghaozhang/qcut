import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TimelineStickerKeyboardController } from "@/components/editor/preview-panel/timeline-sticker-interactions";
import { clearAutoSaveTimer } from "@/stores/timeline/timeline-store-autosave";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { TimelineTrack } from "@/types/timeline";

function overlaySticker(): OverlaySticker {
	return {
		id: "sticker-1",
		mediaItemId: "media-sticker",
		position: { x: 50, y: 50 },
		size: { width: 20, height: 20 },
		rotation: 0,
		opacity: 1,
		zIndex: 2,
		maintainAspectRatio: true,
	};
}

function timelineTracks(): TimelineTrack[] {
	return [
		{
			id: "sticker-track",
			name: "Stickers",
			type: "sticker",
			elements: [
				{
					id: "sticker-element",
					type: "sticker",
					name: "Sticker",
					startTime: 0,
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
					hidden: false,
					stickerId: "sticker-1",
					mediaId: "media-sticker",
					x: 50,
					y: 50,
					width: 20,
					height: 20,
					rotation: 135,
					opacity: 0.4,
					zIndex: 2,
				},
			],
		},
		{
			id: "media-track",
			name: "Media",
			type: "media",
			isMain: true,
			elements: [
				{
					id: "media-element",
					type: "media",
					name: "Video",
					startTime: 0,
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
					mediaId: "media-video",
				},
			],
		},
	];
}

describe("sticker overlay and timeline consistency", () => {
	beforeEach(() => {
		const tracks = timelineTracks();
		useTimelineStore.setState({
			_tracks: tracks,
			tracks,
			history: [],
			redoStack: [],
			selectedElements: [],
		});
		useStickersOverlayStore.setState({
			overlayStickers: new Map([["sticker-1", overlaySticker()]]),
			selectedStickerId: null,
			history: { past: [], future: [] },
		});
	});

	afterEach(() => {
		clearAutoSaveTimer();
	});

	it("syncs only the changed overlay visual fields to the timeline", () => {
		act(() => {
			useStickersOverlayStore
				.getState()
				.updateOverlaySticker("sticker-1", { opacity: 0.7 });
		});

		const element = useTimelineStore
			.getState()
			._tracks[0]?.elements.find(
				(candidate) => candidate.id === "sticker-element"
			);
		expect(element).toMatchObject({
			type: "sticker",
			opacity: 0.7,
			rotation: 135,
		});
	});

	it("selects the matching timeline element from a canvas sticker", () => {
		act(() => {
			useStickersOverlayStore.getState().selectSticker("sticker-1");
		});

		expect(useTimelineStore.getState().selectedElements).toEqual([
			{ trackId: "sticker-track", elementId: "sticker-element" },
		]);
		expect(useStickersOverlayStore.getState().selectedStickerId).toBe(
			"sticker-1"
		);
	});

	it("clears a stale canvas sticker selection when a regular clip is selected", () => {
		useStickersOverlayStore.setState({ selectedStickerId: "sticker-1" });
		const stickerBeforeDelete = useStickersOverlayStore
			.getState()
			.overlayStickers.get("sticker-1");
		render(<TimelineStickerKeyboardController />);

		act(() => {
			useTimelineStore
				.getState()
				.selectElement("media-track", "media-element", false);
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
		});

		expect(useStickersOverlayStore.getState().selectedStickerId).toBeNull();
		expect(
			useStickersOverlayStore.getState().overlayStickers.get("sticker-1")
		).toBe(stickerBeforeDelete);
	});

	it("creates one overlay snapshot and one canonical timeline snapshot", () => {
		act(() => {
			useStickersOverlayStore.getState().saveHistorySnapshot();
		});

		expect(useStickersOverlayStore.getState().history.past).toHaveLength(1);
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});
});
