import { describe, expect, it } from "vitest";
import {
	MAX_FILMSTRIP_TILES,
	calculateFilmstripLayout,
} from "../use-filmstrip-thumbnails";

describe("filmstrip layout", () => {
	it("uses natural thumbnail tiles for ordinary clips", () => {
		const layout = calculateFilmstripLayout({
			clipWidthPx: 300,
			trackHeight: 65,
			enabled: true,
		});

		expect(layout.tileCount).toBe(3);
		expect(layout.tileWidth).toBeCloseTo((65 - 8) * (16 / 9));
	});

	it("bounds extraction for very long clips while covering their full width", () => {
		const clipWidthPx = 180_000;
		const layout = calculateFilmstripLayout({
			clipWidthPx,
			trackHeight: 65,
			enabled: true,
		});

		expect(layout.tileCount).toBe(MAX_FILMSTRIP_TILES);
		expect(layout.tileCount * layout.tileWidth).toBeCloseTo(clipWidthPx);
	});
});
