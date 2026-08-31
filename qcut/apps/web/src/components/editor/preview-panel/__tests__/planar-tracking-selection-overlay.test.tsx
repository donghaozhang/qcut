import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanarTrackingEditorStore } from "@/stores/editor/planar-tracking-editor-store";
import { PlanarTrackingSelectionOverlay } from "../planar-tracking-selection-overlay";

class ResizeObserverMock {
	observe(): void {}
	disconnect(): void {}
}

describe("PlanarTrackingSelectionOverlay", () => {
	beforeEach(() => {
		vi.stubGlobal("ResizeObserver", ResizeObserverMock);
		vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
		Object.defineProperties(HTMLElement.prototype, {
			hasPointerCapture: {
				configurable: true,
				value: vi.fn(() => true),
			},
			releasePointerCapture: { configurable: true, value: vi.fn() },
			setPointerCapture: { configurable: true, value: vi.fn() },
		});
		usePlanarTrackingEditorStore.setState({ jobs: {}, selection: null });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		Reflect.deleteProperty(HTMLElement.prototype, "hasPointerCapture");
		Reflect.deleteProperty(HTMLElement.prototype, "releasePointerCapture");
		Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
	});

	it("measures the overlay when plane editing starts after mount", () => {
		render(
			<PlanarTrackingSelectionOverlay
				fitMode="contain"
				sourceElementId="video-1"
				sourceHeight={240}
				sourceWidth={320}
			/>
		);

		expect(
			screen.queryByRole("button", { name: "Top left tracking corner" })
		).toBeNull();

		act(() => {
			usePlanarTrackingEditorStore.getState().beginSelection({
				selection: {
					quad: {
						topLeft: { x: 0.25, y: 0.25 },
						topRight: { x: 0.75, y: 0.25 },
						bottomRight: { x: 0.75, y: 0.75 },
						bottomLeft: { x: 0.25, y: 0.75 },
					},
					sourceElementId: "video-1",
					stickerElementId: "sticker-1",
				},
			});
		});

		const topLeftHandle = screen.getByRole("button", {
			name: "Top left tracking corner",
		});
		expect(topLeftHandle.style.left).toBe("100px");
		expect(topLeftHandle.style.top).toBe("75px");
	});

	it("ends a corner drag when the pointer is cancelled", () => {
		const quad = {
			topLeft: { x: 0.25, y: 0.25 },
			topRight: { x: 0.75, y: 0.25 },
			bottomRight: { x: 0.75, y: 0.75 },
			bottomLeft: { x: 0.25, y: 0.75 },
		};
		usePlanarTrackingEditorStore.getState().beginSelection({
			selection: {
				quad,
				sourceElementId: "video-1",
				stickerElementId: "sticker-1",
			},
		});
		render(
			<PlanarTrackingSelectionOverlay
				fitMode="contain"
				sourceElementId="video-1"
				sourceHeight={240}
				sourceWidth={320}
			/>
		);
		const handle = screen.getByRole("button", {
			name: "Top left tracking corner",
		});

		fireEvent.pointerDown(handle, { pointerId: 7 });
		fireEvent.pointerCancel(handle, { pointerId: 7 });
		fireEvent.pointerMove(handle, { clientX: 350, clientY: 250, pointerId: 7 });

		expect(
			usePlanarTrackingEditorStore.getState().selection?.quad.topLeft
		).toEqual(quad.topLeft);
	});
});
