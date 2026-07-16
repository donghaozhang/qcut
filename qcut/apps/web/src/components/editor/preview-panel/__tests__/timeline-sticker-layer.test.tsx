import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { StickerElement, TimelineTrack } from "@/types/timeline";
import { TimelineStickerInteractionLayer } from "../timeline-sticker-layer";

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: <T,>(
		selector: (state: { overlayStickers: Map<string, never> }) => T
	): T => selector({ overlayStickers: new Map<string, never>() }),
}));

vi.mock("@/components/editor/stickers-overlay/StickerElement", () => ({
	StickerElement: ({ renderMode }: { renderMode: string }) => (
		<div data-testid={`sticker-${renderMode}`} />
	),
}));

const element: StickerElement = {
	id: "timeline-sticker-1",
	type: "sticker",
	name: "Badge",
	duration: 5,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
	stickerId: "overlay-sticker-1",
	mediaId: "media-1",
};

const track: TimelineTrack = {
	id: "sticker-track",
	name: "Sticker track",
	type: "sticker",
	elements: [element],
	muted: false,
	hidden: false,
	locked: false,
};

const mediaItem: MediaItem = {
	id: "media-1",
	name: "Badge",
	type: "image",
	file: new File([], "badge.png", { type: "image/png" }),
};

describe("TimelineStickerInteractionLayer", () => {
	it("places sticker hit targets above the selected-media transform layer", () => {
		render(
			<TimelineStickerInteractionLayer
				activeElements={[{ element, track, mediaItem }]}
				mediaItems={[mediaItem]}
			/>
		);

		expect(
			screen.getByTestId("timeline-sticker-interaction-layer")
		).toHaveClass("z-[90]", "pointer-events-none");
		expect(screen.getByTestId("sticker-interaction")).toBeInTheDocument();
	});
});
