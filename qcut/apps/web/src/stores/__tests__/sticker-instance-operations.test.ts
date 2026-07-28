import { beforeEach, describe, expect, it } from "vitest";
import { clearAutoSaveTimer } from "@/stores/timeline/timeline-store-autosave";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { StickerElement, TimelineTrack } from "@/types/timeline";

function sourceElement({
	id = "sticker-element",
	stickerId = "sticker-source",
	startTime = 0,
	duration = 10,
}: {
	id?: string;
	stickerId?: string;
	startTime?: number;
	duration?: number;
} = {}): StickerElement {
	return {
		id,
		type: "sticker",
		stickerId,
		mediaId: "media-sticker",
		name: "Sticker",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		x: 40,
		y: 45,
		width: 20,
		height: 20,
		rotation: 0,
		opacity: 1,
		zIndex: 1,
	};
}

function sourceOverlay(): OverlaySticker {
	return {
		id: "sticker-source",
		mediaItemId: "media-sticker",
		position: { x: 40, y: 45 },
		size: { width: 20, height: 20 },
		rotation: 0,
		opacity: 1,
		zIndex: 1,
		maintainAspectRatio: true,
	};
}

function timelineTracks(elements: StickerElement[]): TimelineTrack[] {
	return [
		{
			id: "sticker-track",
			name: "Stickers",
			type: "sticker",
			elements,
		},
		{
			id: "main-track",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [],
		},
	];
}

function resetStores(elements = [sourceElement()]): void {
	const tracks = timelineTracks(elements);
	useTimelineStore.setState({
		_tracks: tracks,
		tracks,
		history: [],
		redoStack: [],
		selectedElements: [],
	});
	useStickersOverlayStore.setState({
		overlayStickers: new Map([["sticker-source", sourceOverlay()]]),
		selectedStickerId: null,
		history: { past: [], future: [] },
	});
}

function stickerElements(): StickerElement[] {
	return useTimelineStore
		.getState()
		._tracks.flatMap((track) =>
			track.elements.filter(
				(element): element is StickerElement => element.type === "sticker"
			)
		);
}

describe("sticker instance timeline operations", () => {
	beforeEach(() => {
		clearAutoSaveTimer();
		resetStores();
	});

	it("splits into independently projected sticker instances", () => {
		const secondElementId = useTimelineStore
			.getState()
			.splitElement("sticker-track", "sticker-element", 5);

		const elements = stickerElements();
		expect(secondElementId).not.toBeNull();
		expect(elements).toHaveLength(2);
		expect(new Set(elements.map((element) => element.stickerId)).size).toBe(2);
		expect(useStickersOverlayStore.getState().overlayStickers.size).toBe(2);
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});

	it("gives the right side of a range split its own projected instance", () => {
		useTimelineStore.getState().deleteTimeRange({
			startTime: 3,
			endTime: 7,
			trackIds: ["sticker-track"],
			ripple: false,
		});

		const elements = stickerElements();
		expect(elements).toHaveLength(2);
		expect(elements.map((element) => element.startTime).sort()).toEqual([0, 7]);
		expect(new Set(elements.map((element) => element.stickerId)).size).toBe(2);
		expect(useStickersOverlayStore.getState().overlayStickers.size).toBe(2);
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});

	it("deletes one sticker instance without deleting its sibling", () => {
		const secondElementId = useTimelineStore
			.getState()
			.splitElement("sticker-track", "sticker-element", 5);
		const second = stickerElements().find(
			(element) => element.id === secondElementId
		);
		expect(second).toBeDefined();
		if (!second) return;

		useTimelineStore.setState({ history: [], redoStack: [] });
		useTimelineStore
			.getState()
			.removeElementFromTrack("sticker-track", second.id);

		expect(stickerElements()).toHaveLength(1);
		expect(stickerElements()[0].stickerId).toBe("sticker-source");
		expect(
			useStickersOverlayStore.getState().overlayStickers.has(second.stickerId)
		).toBe(false);
		expect(
			useStickersOverlayStore.getState().overlayStickers.has("sticker-source")
		).toBe(true);
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});

	it("does not cascade-delete a legacy sibling that shares a sticker id", () => {
		resetStores([
			sourceElement({ id: "legacy-a" }),
			sourceElement({ id: "legacy-b", startTime: 5 }),
		]);

		useTimelineStore
			.getState()
			.removeElementFromTrack("sticker-track", "legacy-a");

		expect(stickerElements().map((element) => element.id)).toEqual([
			"legacy-b",
		]);
		expect(
			useStickersOverlayStore.getState().overlayStickers.has("sticker-source")
		).toBe(true);
	});

	it("deletes only the selected overlay-backed instance", () => {
		const second = sourceElement({
			id: "sticker-element-b",
			stickerId: "sticker-b",
			startTime: 5,
		});
		resetStores([sourceElement(), second]);
		useStickersOverlayStore.setState((state) => ({
			overlayStickers: new Map(state.overlayStickers).set("sticker-b", {
				...sourceOverlay(),
				id: "sticker-b",
			}),
		}));

		useStickersOverlayStore.getState().removeOverlaySticker("sticker-source");

		expect(stickerElements().map((element) => element.id)).toEqual([
			"sticker-element-b",
		]);
		expect(
			useStickersOverlayStore.getState().overlayStickers.has("sticker-source")
		).toBe(false);
		expect(
			useStickersOverlayStore.getState().overlayStickers.has("sticker-b")
		).toBe(true);
		expect(useTimelineStore.getState().history).toHaveLength(1);
	});
});
