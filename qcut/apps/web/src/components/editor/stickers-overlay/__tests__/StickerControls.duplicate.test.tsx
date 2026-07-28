import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import { clearAutoSaveTimer } from "@/stores/timeline/timeline-store-autosave";
import { useStickersOverlayStore } from "@/stores/stickers-overlay-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { StickerElement, TimelineTrack } from "@/types/timeline";
import { StickerControls } from "../StickerControls";

vi.mock("@/components/ui/button", () => ({
	Button: ({
		children,
		...props
	}: ComponentProps<"button"> & { children: ReactNode }) => (
		<button {...props}>{children}</button>
	),
}));

vi.mock("@/components/ui/tooltip", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: ReactNode }) => (
		<span>{children}</span>
	),
	TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/slider", () => ({
	Slider: () => <div />,
}));

const sticker: OverlaySticker = {
	id: "sticker-source",
	mediaItemId: "media-sticker",
	position: { x: 40, y: 45 },
	size: { width: 20, height: 20 },
	rotation: 10,
	opacity: 0.8,
	zIndex: 2,
	maintainAspectRatio: true,
};

function sourceElement(): StickerElement {
	return {
		id: "sticker-element",
		type: "sticker",
		stickerId: sticker.id,
		mediaId: sticker.mediaItemId,
		name: "Sticker",
		startTime: 2,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		x: sticker.position.x,
		y: sticker.position.y,
		width: sticker.size.width,
		height: sticker.size.height,
		rotation: sticker.rotation,
		opacity: sticker.opacity,
		zIndex: sticker.zIndex,
	};
}

function resetStores(): void {
	const tracks: TimelineTrack[] = [
		{
			id: "sticker-track",
			name: "Stickers",
			type: "sticker",
			elements: [sourceElement()],
		},
		{
			id: "main-track",
			name: "Main",
			type: "media",
			isMain: true,
			elements: [],
		},
	];
	useTimelineStore.setState({
		_tracks: tracks,
		tracks,
		history: [],
		redoStack: [],
		selectedElements: [],
	});
	useStickersOverlayStore.setState({
		overlayStickers: new Map([[sticker.id, sticker]]),
		selectedStickerId: sticker.id,
		history: { past: [], future: [] },
	});
}

describe("StickerControls duplicate", () => {
	beforeEach(() => {
		clearAutoSaveTimer();
		resetStores();
	});

	it("creates one timeline clip and its overlay projection with one undo", () => {
		render(
			<StickerControls stickerId={sticker.id} isVisible sticker={sticker} />
		);

		fireEvent.click(
			screen.getByRole("button", {
				name: "Duplicate sticker",
			})
		);

		const elements = useTimelineStore
			.getState()
			._tracks.flatMap((track) =>
				track.elements.filter(
					(element): element is StickerElement => element.type === "sticker"
				)
			);
		const duplicate = elements.find(
			(element) => element.stickerId !== sticker.id
		);

		expect(elements).toHaveLength(2);
		expect(duplicate).toMatchObject({
			startTime: 2,
			x: 45,
			y: 50,
		});
		expect(useTimelineStore.getState().history).toHaveLength(1);
		expect(useStickersOverlayStore.getState().history.past).toHaveLength(0);
		expect(
			useStickersOverlayStore
				.getState()
				.overlayStickers.get(duplicate?.stickerId ?? "")
		).toMatchObject({
			position: { x: 45, y: 50 },
		});

		useTimelineStore.getState().undo();
		expect(
			useTimelineStore
				.getState()
				._tracks.flatMap((track) => track.elements)
				.filter((element) => element.type === "sticker")
		).toHaveLength(1);
		expect(useStickersOverlayStore.getState().overlayStickers.size).toBe(1);
	});
});
