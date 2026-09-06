import { describe, expect, it } from "vitest";
import { bootstrapHybridIntensity } from "../jianying-filter-parity/hybrid-reference.js";

const source = `function SeekModeScript:onStart(comp) end
function SeekModeScript:onEvent(sys, event) end
exports.SeekModeScript = SeekModeScript
return exports`;

describe("hybrid native oracle bootstrap", () => {
	it("invokes the original event rather than reimplementing shader multipliers", () => {
		const updated = bootstrapHybridIntensity({ source, intensity: 37 });
		expect(updated).toContain("originalStart(self, ...)");
		expect(updated).toContain("self:onEvent(nil");
		expect(updated).toContain("return 0.37");
		expect(updated).not.toContain("setFloat");
		expect(updated.endsWith("return exports")).toBe(true);
	});
	it.each([
		-1,
		101,
		NaN,
		Infinity,
	])("rejects invalid intensity %s", (intensity) => {
		expect(() => bootstrapHybridIntensity({ source, intensity })).toThrow(
			"intensity"
		);
	});
	it.each([
		"",
		"return exports",
		source + "\nreturn exports",
		source.replace("onEvent", "unknown"),
	])("rejects missing or ambiguous script structure", (source) => {
		expect(() => bootstrapHybridIntensity({ source, intensity: 37 })).toThrow(
			"script"
		);
	});
});
