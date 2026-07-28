import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	STICKER_GRID_COLUMN_COUNT,
	STICKER_GRID_GAP,
	StickerGrid,
} from "../components/sticker-grid";

describe("StickerGrid", () => {
	it("uses three equal-width catalog columns", () => {
		render(
			<StickerGrid testId="responsive-sticker-grid">
				<span>Sticker</span>
			</StickerGrid>
		);
		const grid = screen.getByTestId("responsive-sticker-grid");

		expect(STICKER_GRID_COLUMN_COUNT).toBe(3);
		expect(grid.style.gap).toBe(`${STICKER_GRID_GAP}px`);
		expect(grid.style.gridTemplateColumns).toBe("repeat(3, minmax(0, 1fr))");
	});
});
