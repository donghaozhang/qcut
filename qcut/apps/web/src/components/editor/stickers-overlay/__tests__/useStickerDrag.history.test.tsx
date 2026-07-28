import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OverlaySticker } from "@/types/sticker-overlay";
import { useStickerDrag } from "../hooks/useStickerDrag";

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

const mocks = vi.hoisted(() => ({
	saveHistorySnapshot: vi.fn(),
	setIsDragging: vi.fn(),
	updateOverlaySticker: vi.fn(),
}));

vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: <T,>(
		selector?: (state: {
			overlayStickers: Map<string, OverlaySticker>;
			saveHistorySnapshot: typeof mocks.saveHistorySnapshot;
			setIsDragging: typeof mocks.setIsDragging;
			updateOverlaySticker: typeof mocks.updateOverlaySticker;
		}) => T
	) => {
		const state = {
			overlayStickers: new Map([[sticker.id, sticker]]),
			saveHistorySnapshot: mocks.saveHistorySnapshot,
			setIsDragging: mocks.setIsDragging,
			updateOverlaySticker: mocks.updateOverlaySticker,
		};
		return selector ? selector(state) : state;
	},
}));

describe("useStickerDrag history boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
	});

	it("saves one snapshot before the first update in a drag gesture", () => {
		const element = document.createElement("div");
		const canvas = document.createElement("div");
		const { result } = renderHook(() =>
			useStickerDrag(sticker.id, { current: element }, { current: canvas })
		);

		act(() => {
			result.current.handleMouseDown({
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
				clientX: 10,
				clientY: 20,
			});
			document.dispatchEvent(
				new MouseEvent("mousemove", { clientX: 30, clientY: 40 })
			);
			document.dispatchEvent(
				new MouseEvent("mousemove", { clientX: 50, clientY: 60 })
			);
		});

		expect(mocks.saveHistorySnapshot).toHaveBeenCalledOnce();
		expect(mocks.saveHistorySnapshot.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.updateOverlaySticker.mock.invocationCallOrder[0]
		);
	});

	it("does not create a history entry for a click without movement", () => {
		const { result } = renderHook(() =>
			useStickerDrag(
				sticker.id,
				{ current: document.createElement("div") },
				{ current: document.createElement("div") }
			)
		);

		act(() => {
			result.current.handleMouseDown({
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
				clientX: 10,
				clientY: 20,
			});
			document.dispatchEvent(new MouseEvent("mouseup"));
		});

		expect(mocks.saveHistorySnapshot).not.toHaveBeenCalled();
	});
});
