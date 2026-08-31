import { describe, expect, it } from "vitest";
import { timelineRequiresRendererFilterStackExport } from "../types/filter-stack-export-policy.js";

function timelineWith({ element }: { element: Record<string, unknown> }) {
	return { tracks: [{ elements: [element] }] };
}

const lutEffect = {
	id: "s1",
	enabled: true,
	color: { lut: { enabled: true, cube: { size: 2 } } },
};

describe("timelineRequiresRendererFilterStackExport", () => {
	it("forces the renderer for enabled renderable stacks", () => {
		expect(
			timelineRequiresRendererFilterStackExport({
				timeline: timelineWith({
					element: {
						type: "media",
						filterStack: { enabled: true, effects: [lutEffect] },
					},
				}),
			})
		).toBe(true);
	});

	it("ignores disabled stacks, payload-free effects, and other types", () => {
		expect(
			timelineRequiresRendererFilterStackExport({
				timeline: timelineWith({
					element: {
						type: "media",
						filterStack: { enabled: false, effects: [lutEffect] },
					},
				}),
			})
		).toBe(false);
		expect(
			timelineRequiresRendererFilterStackExport({
				timeline: timelineWith({
					element: {
						type: "media",
						filterStack: {
							enabled: true,
							effects: [{ id: "s1", enabled: true, color: {} }],
						},
					},
				}),
			})
		).toBe(false);
		expect(
			timelineRequiresRendererFilterStackExport({
				timeline: timelineWith({
					element: {
						type: "text",
						filterStack: { enabled: true, effects: [lutEffect] },
					},
				}),
			})
		).toBe(false);
		expect(
			timelineRequiresRendererFilterStackExport({
				timeline: timelineWith({ element: { type: "media" } }),
			})
		).toBe(false);
	});
});
