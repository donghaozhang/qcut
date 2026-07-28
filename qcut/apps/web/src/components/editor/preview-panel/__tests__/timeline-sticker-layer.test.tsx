import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useProjectStore } from "@/stores/project-store";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { StickerElement, TimelineTrack } from "@/types/timeline";
import {
	TimelineStickerInteractionLayer,
	TimelineStickerLayer,
} from "../timeline-sticker-layer";

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: <T,>(
		selector: (state: { overlayStickers: Map<string, never> }) => T
	): T => selector({ overlayStickers: new Map<string, never>() }),
}));

vi.mock("@/components/editor/stickers-overlay/StickerElement", () => ({
	StickerElement: ({
		renderMode,
		sticker,
	}: {
		renderMode: string;
		sticker: OverlaySticker;
	}) => (
		<div
			data-testid={`sticker-${renderMode}`}
			data-position-x={sticker.position.x}
			data-rotation={sticker.rotation}
		/>
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
	beforeEach(() => {
		useProjectStore.setState({
			activeProject: { fps: 30 } as ReturnType<
				typeof useProjectStore.getState
			>["activeProject"],
		});
	});

	it("places sticker visuals above the native composition preview", () => {
		render(
			<TimelineStickerLayer
				element={element}
				elementOrder={0}
				mediaItems={[mediaItem]}
			/>
		);

		expect(
			screen.getByTestId(`timeline-sticker-layer-${element.id}`)
		).toHaveClass("z-[35]", "pointer-events-none");
		expect(screen.getByTestId("sticker-visual")).toBeInTheDocument();
	});

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

	it("passes the keyframed visual resolved at the current project frame", () => {
		render(
			<TimelineStickerLayer
				element={{
					...element,
					keyframes: {
						x: [
							{ id: "x-start", frame: 0, value: 10, easing: "linear" },
							{ id: "x-end", frame: 60, value: 70, easing: "linear" },
						],
						rotation: [
							{
								id: "rotation-start",
								frame: 0,
								value: 0,
								easing: "linear",
							},
							{
								id: "rotation-end",
								frame: 60,
								value: 180,
								easing: "linear",
							},
						],
					},
				}}
				elementOrder={0}
				mediaItems={[mediaItem]}
				currentTime={1}
			/>
		);

		expect(screen.getByTestId("sticker-visual")).toHaveAttribute(
			"data-position-x",
			"40"
		);
		expect(screen.getByTestId("sticker-visual")).toHaveAttribute(
			"data-rotation",
			"90"
		);
	});
});
