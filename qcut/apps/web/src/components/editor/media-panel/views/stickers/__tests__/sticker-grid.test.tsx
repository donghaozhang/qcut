import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	STICKER_GRID_GAP,
	STICKER_GRID_MIN_ITEM_WIDTH,
	StickerGrid,
} from "../components/sticker-grid";

describe("StickerGrid", () => {
	it("uses dense responsive columns without stretching sparse rows", () => {
		render(
			<StickerGrid testId="responsive-sticker-grid">
				<span>Sticker</span>
			</StickerGrid>
		);
		const grid = screen.getByTestId("responsive-sticker-grid");

		expect(grid.style.gap).toBe(`${STICKER_GRID_GAP}px`);
		expect(grid.style.gridTemplateColumns).toBe(
			`repeat(auto-fill, minmax(${STICKER_GRID_MIN_ITEM_WIDTH}px, 1fr))`
		);
	});
});
