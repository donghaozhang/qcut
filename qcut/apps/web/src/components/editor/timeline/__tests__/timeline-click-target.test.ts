import { describe, expect, it } from "vitest";
import { isTimelineEntityTarget } from "../timeline-click-target";

function childOf({ parent }: { parent: HTMLElement }): HTMLElement {
	const child = document.createElement("span");
	parent.append(child);
	return child;
}

describe("isTimelineEntityTarget", () => {
	it.each([
		["clip", "timeline-element", undefined],
		["gap", undefined, "gapIndicator"],
		["transition", undefined, "transitionMarker"],
	])("recognizes a %s and its descendants", (_name, className, datasetKey) => {
		const parent = document.createElement("div");
		if (className) parent.className = className;
		if (datasetKey) parent.dataset[datasetKey] = "";

		expect(isTimelineEntityTarget({ target: childOf({ parent }) })).toBe(true);
	});

	it("rejects empty track space", () => {
		expect(
			isTimelineEntityTarget({ target: document.createElement("div") })
		).toBe(false);
	});
});
