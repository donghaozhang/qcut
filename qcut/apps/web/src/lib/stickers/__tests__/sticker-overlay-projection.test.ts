import { describe, expect, it } from "vitest";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { StickerElement, TimelineTrack } from "@/types/timeline";
import { projectStickerOverlaysFromTimelineChange } from "../sticker-overlay-projection";

function stickerElement({
	id,
	stickerId,
	x,
}: {
	id: string;
	stickerId: string;
	x: number;
}): StickerElement {
	return {
		id,
		type: "sticker",
		stickerId,
		mediaId: "media-sticker",
		name: "Sticker",
		startTime: 0,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		x,
		y: 40,
		width: 20,
		height: 20,
	};
}

function tracks(elements: StickerElement[]): TimelineTrack[] {
	return [
		{
			id: "sticker-track",
			name: "Stickers",
			type: "sticker",
			elements,
		},
	];
}

function overlay(id: string): OverlaySticker {
	return {
		id,
		mediaItemId: "media-sticker",
		position: { x: 1, y: 1 },
		size: { width: 10, height: 10 },
		rotation: 0,
		opacity: 1,
		zIndex: 1,
		maintainAspectRatio: true,
	};
}

describe("projectStickerOverlaysFromTimelineChange", () => {
	it("creates and refreshes projections for timeline sticker instances", () => {
		const projected = projectStickerOverlaysFromTimelineChange({
			overlays: new Map([["sticker-a", overlay("sticker-a")]]),
			previousTracks: tracks([
				stickerElement({ id: "element-a", stickerId: "sticker-a", x: 10 }),
			]),
			tracks: tracks([
				stickerElement({ id: "element-a", stickerId: "sticker-a", x: 25 }),
				stickerElement({ id: "element-b", stickerId: "sticker-b", x: 75 }),
			]),
		});

		expect(projected.get("sticker-a")?.position.x).toBe(25);
		expect(projected.get("sticker-b")?.position.x).toBe(75);
	});

	it("removes a projection only when its last timeline instance disappears", () => {
		const sharedOverlay = overlay("shared");
		const previousTracks = tracks([
			stickerElement({ id: "element-a", stickerId: "shared", x: 10 }),
			stickerElement({ id: "element-b", stickerId: "shared", x: 70 }),
		]);

		const withOneInstance = projectStickerOverlaysFromTimelineChange({
			overlays: new Map([["shared", sharedOverlay]]),
			previousTracks,
			tracks: tracks([
				stickerElement({ id: "element-b", stickerId: "shared", x: 70 }),
			]),
		});
		expect(withOneInstance.get("shared")?.position.x).toBe(70);

		const withoutInstances = projectStickerOverlaysFromTimelineChange({
			overlays: withOneInstance,
			previousTracks: tracks([
				stickerElement({ id: "element-b", stickerId: "shared", x: 70 }),
			]),
			tracks: tracks([]),
		});
		expect(withoutInstances.has("shared")).toBe(false);
	});

	it("preserves overlays that were never timeline-owned", () => {
		const orphan = overlay("staged");
		const projected = projectStickerOverlaysFromTimelineChange({
			overlays: new Map([["staged", orphan]]),
			previousTracks: tracks([]),
			tracks: tracks([]),
		});

		expect(projected.get("staged")).toBe(orphan);
	});
});
