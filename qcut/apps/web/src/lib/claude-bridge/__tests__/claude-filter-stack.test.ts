import { describe, expect, it } from "vitest";
import { parseClaudeMediaFilterStack } from "../claude-timeline-bridge-helpers";

function validEffect({ id = "s1" }: { id?: string } = {}) {
	return {
		id,
		enabled: true,
		resourceId: "111",
		version: "cafe0123",
		intensity: 70,
		implementation: "lut",
		fidelity: "lut",
		color: { lut: { enabled: true, cube: { size: 2 } } },
	};
}

describe("parseClaudeMediaFilterStack", () => {
	it("accepts a well-formed stack", () => {
		const stack = {
			enabled: true,
			effects: [
				validEffect(),
				{ ...validEffect({ id: "s2" }), fidelity: "native-local" },
			],
		};
		expect(parseClaudeMediaFilterStack({ value: stack })).toBe(stack);
	});

	it("rejects malformed stacks loudly instead of dropping them", () => {
		expect(() => parseClaudeMediaFilterStack({ value: null })).toThrow(
			/must be an object/
		);
		expect(() =>
			parseClaudeMediaFilterStack({ value: { enabled: true, effects: "x" } })
		).toThrow(/array/);
		expect(() =>
			parseClaudeMediaFilterStack({
				value: {
					enabled: true,
					effects: Array.from({ length: 17 }, (_, index) =>
						validEffect({ id: `s${index}` })
					),
				},
			})
		).toThrow(/at most 16/);
		expect(() =>
			parseClaudeMediaFilterStack({
				value: { enabled: true, effects: [validEffect(), validEffect()] },
			})
		).toThrow(/repeats/);
		expect(() =>
			parseClaudeMediaFilterStack({
				value: {
					enabled: true,
					effects: [{ ...validEffect(), intensity: 150 }],
				},
			})
		).toThrow(/0\.\.100/);
		expect(() =>
			parseClaudeMediaFilterStack({
				value: {
					enabled: true,
					effects: [{ ...validEffect(), fidelity: "magic" }],
				},
			})
		).toThrow(/fidelity/);
		expect(() =>
			parseClaudeMediaFilterStack({
				value: { enabled: true, effects: [{ ...validEffect(), color: 3 }] },
			})
		).toThrow(/color/);
	});
});
