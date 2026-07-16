import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { OverlaySticker } from "@/types/sticker-overlay";
import { StickerElement } from "../StickerElement";

const mocks = vi.hoisted(() => ({
	clearSelectedElements: vi.fn(),
	handleMouseDown: vi.fn(),
	selectSticker: vi.fn(),
}));

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: () => ({
		selectedStickerId: null,
		selectSticker: mocks.selectSticker,
		updateOverlaySticker: vi.fn(),
		saveHistorySnapshot: vi.fn(),
	}),
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: <T,>(
		selector: (state: { clearSelectedElements: () => void }) => T
	): T => selector({ clearSelectedElements: mocks.clearSelectedElements }),
}));

vi.mock("../hooks/useStickerDrag", () => ({
	useStickerDrag: () => ({
		isDragging: false,
		handleMouseDown: mocks.handleMouseDown,
		handleTouchStart: vi.fn(),
		handleTouchMove: vi.fn(),
		handleTouchEnd: vi.fn(),
	}),
}));

vi.mock("../ResizeHandles", () => ({
	ResizeHandles: () => <div data-testid="resize-handles" />,
}));

vi.mock("../StickerControls", () => ({
	StickerControls: () => <div data-testid="sticker-controls" />,
	SimpleStickerControls: () => <div data-testid="simple-sticker-controls" />,
}));

const sticker: OverlaySticker = {
	id: "sticker-1",
	mediaItemId: "media-1",
	position: { x: 50, y: 50 },
	size: { width: 20, height: 20 },
	rotation: 0,
	opacity: 1,
	zIndex: 3,
	maintainAspectRatio: true,
};

const mediaItem: MediaItem = {
	id: "media-1",
	name: "Badge",
	type: "image",
	file: new File([], "badge.png", { type: "image/png" }),
	url: "blob:badge",
};

describe("StickerElement interaction modes", () => {
	it("renders the visual sticker without a pointer target", () => {
		const { container } = render(
			<StickerElement
				sticker={sticker}
				mediaItem={mediaItem}
				canvasRef={{ current: null }}
				renderMode="visual"
			/>
		);

		expect(screen.getByRole("img", { name: "Badge" })).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(container.firstElementChild).toHaveClass("pointer-events-none");
		expect(screen.queryByTestId("resize-handles")).not.toBeInTheDocument();
	});

	it("uses the full interaction box to select the sticker before dragging", () => {
		render(
			<StickerElement
				sticker={sticker}
				mediaItem={mediaItem}
				canvasRef={{ current: null }}
				renderMode="interaction"
			/>
		);
		const hitTarget = screen.getByRole("button", { name: "Sticker: Badge" });

		expect(
			screen.queryByRole("img", { name: "Badge" })
		).not.toBeInTheDocument();
		expect(hitTarget).toHaveClass("pointer-events-auto");
		fireEvent.mouseDown(hitTarget, { clientX: 100, clientY: 100 });

		expect(mocks.clearSelectedElements).toHaveBeenCalledOnce();
		expect(mocks.selectSticker).toHaveBeenCalledWith("sticker-1");
		expect(mocks.handleMouseDown).toHaveBeenCalledOnce();
	});
});
