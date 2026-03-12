import { describe, expect, it } from "vitest";
import { buildContextMenuScript } from "../utility/context-menu-script.js";

describe("buildContextMenuScript", () => {
	it("passes elementId as a serialized argument instead of interpolating a selector", () => {
		const elementId = String.raw`x\'";alert(1);//`;
		const script = buildContextMenuScript({
			elementId,
			debug: true,
		});

		expect(script).toContain(
			`})(${JSON.stringify(elementId)}, true)`
		);
		expect(script).toContain('document.querySelectorAll("[data-element-id]")');
		expect(script).toContain(
			'candidate.getAttribute("data-element-id") === elementId'
		);
		expect(script).not.toContain("[data-element-id='");
	});
});
