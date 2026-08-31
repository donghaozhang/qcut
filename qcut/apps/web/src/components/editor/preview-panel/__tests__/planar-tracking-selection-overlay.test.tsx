import { act, render, screen } from "@testing-library/react";
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
		usePlanarTrackingEditorStore.setState({ jobs: {}, selection: null });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
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
});
