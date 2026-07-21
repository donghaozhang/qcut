import { describe, expect, it } from "vitest";
import { sanitizeSequenceElementId } from "../effect-sequence-shared";

describe("sanitizeSequenceElementId", () => {
	it("returns already-safe ids unchanged", () => {
		expect(sanitizeSequenceElementId({ elementId: "clip-a_1.b" })).toBe(
			"clip-a_1.b"
		);
	});

	it("keeps sanitized ids filesystem-safe", () => {
		const sanitized = sanitizeSequenceElementId({ elementId: "clip/😀 a" });
		expect(sanitized).toMatch(/^[a-zA-Z0-9._-]+$/);
	});

	it("keeps distinct ids distinct after sanitizing", () => {
		// Both would collapse to "clip_a" under plain charset replacement.
		const slash = sanitizeSequenceElementId({ elementId: "clip/a" });
		const underscore = sanitizeSequenceElementId({ elementId: "clip_a" });
		const colon = sanitizeSequenceElementId({ elementId: "clip:a" });
		expect(slash).not.toBe(underscore);
		expect(slash).not.toBe(colon);
		// Deterministic: same input always maps to the same directory.
		expect(sanitizeSequenceElementId({ elementId: "clip/a" })).toBe(slash);
	});
});
