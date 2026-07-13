import { describe, expect, it } from "vitest";
import { buildFreesoundSearchFilters } from "../sounds/freesound-search";

describe("Freesound search filters", () => {
	it("keeps short sound effects separate from music", () => {
		expect(
			buildFreesoundSearchFilters({
				type: "effects",
				minRating: 3,
				commercialOnly: false,
			})
		).toEqual([
			"duration:[* TO 30.0]",
			"avg_rating:[3 TO *]",
			"tag:sound-effect OR tag:sfx OR tag:foley OR tag:ambient OR tag:nature OR tag:mechanical OR tag:electronic OR tag:impact OR tag:whoosh OR tag:explosion",
		]);
	});

	it("returns long-form music filters with commercial licensing", () => {
		const filters = buildFreesoundSearchFilters({
			type: "songs",
			minRating: 4,
			commercialOnly: true,
		});

		expect(filters).toContain("duration:[15.0 TO 600.0]");
		expect(filters).toContain("avg_rating:[4 TO *]");
		expect(filters).toContain(
			'license:("Attribution" OR "Creative Commons 0")'
		);
		expect(filters.at(-1)).toContain("tag:music");
		expect(filters.at(-1)).toContain("tag:instrumental");
	});

	it("clamps invalid negative ratings", () => {
		expect(
			buildFreesoundSearchFilters({
				type: "songs",
				minRating: -5,
				commercialOnly: false,
			})
		).toContain("avg_rating:[0 TO *]");
	});
});
