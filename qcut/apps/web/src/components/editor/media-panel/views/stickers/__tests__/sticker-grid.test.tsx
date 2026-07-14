import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	StickerGrid,
	WIDE_STICKER_GRID_MIN_WIDTH,
	stickerGridColumnCount,
} from "../components/sticker-grid";

describe("StickerGrid", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("uses exactly three compact columns and five wide columns", () => {
		expect(
			stickerGridColumnCount({ width: WIDE_STICKER_GRID_MIN_WIDTH - 1 })
		).toBe(3);
		expect(stickerGridColumnCount({ width: WIDE_STICKER_GRID_MIN_WIDTH })).toBe(
			5
		);
	});

	it("reacts to panel resizing", () => {
		let resizeCallback: ResizeObserverCallback | undefined;
		class ResizeObserverMock {
			constructor(callback: ResizeObserverCallback) {
				resizeCallback = callback;
			}
			disconnect() {}
			observe() {}
			unobserve() {}
		}
		vi.stubGlobal("ResizeObserver", ResizeObserverMock);
		render(
			<StickerGrid testId="responsive-sticker-grid">
				<span>Sticker</span>
			</StickerGrid>
		);
		const grid = screen.getByTestId("responsive-sticker-grid");
		expect(grid).toHaveAttribute("data-column-count", "3");

		act(() => {
			resizeCallback?.(
				[
					{
						contentRect: {
							width: WIDE_STICKER_GRID_MIN_WIDTH,
						},
					} as ResizeObserverEntry,
				],
				{} as ResizeObserver
			);
		});
		expect(grid).toHaveAttribute("data-column-count", "5");
	});
});
