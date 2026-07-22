import { describe, expect, it } from "vitest";
import { parseAgentPointerTarget } from "../http/claude-http-pointer-routes.js";

describe("parseAgentPointerTarget", () => {
	it("accepts a snapshot ref", () => {
		expect(parseAgentPointerTarget({ value: { ref: " @e12 " } })).toEqual({
			ref: "@e12",
		});
	});

	it("accepts a complete coordinate pair", () => {
		expect(parseAgentPointerTarget({ value: { x: 120, y: 340 } })).toEqual({
			x: 120,
			y: 340,
		});
	});

	it("rejects ambiguous and partial targets", () => {
		expect(() =>
			parseAgentPointerTarget({ value: { ref: "@e1", x: 1, y: 2 } })
		).toThrow("either ref or coordinates");
		expect(() => parseAgentPointerTarget({ value: { x: 1 } })).toThrow(
			"both x and y"
		);
		expect(() => parseAgentPointerTarget({ value: {} })).toThrow(
			"requires either ref or x/y"
		);
	});

	it("allows an omitted target when the caller supplies a pointer fallback", () => {
		expect(parseAgentPointerTarget({ value: {}, required: false })).toEqual({});
	});
});
