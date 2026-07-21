import { describe, expect, it } from "vitest";
import { sanitizeSequenceElementId } from "../effect-sequence-shared";

describe("sanitizeSequenceElementId", () => {
	it("keeps already-safe ids readable in the plain namespace", () => {
		expect(sanitizeSequenceElementId({ elementId: "clip-a_1.b" })).toBe(
			"p-clip-a_1.b"
		);
	});

	it("keeps sanitized ids filesystem-safe", () => {
		const sanitized = sanitizeSequenceElementId({ elementId: "clip/😀 a" });
		expect(sanitized).toMatch(/^[a-zA-Z0-9._-]+$/);
	});

	it("is injective: distinct ids never share a directory", () => {
		// The first three would collapse to "clip_a" under charset replacement,
		// the next two impersonate encoded/plain names directly, and the lone
		// surrogates would fold together under a UTF-8 (TextEncoder) round trip.
		const ids = [
			"clip/a",
			"clip_a",
			"clip:a",
			"e-clip_a-0063006c00690070002f0061",
			"p-clip_a",
			"clip/\uD800",
			"clip/\uD801",
		];
		const mapped = ids.map((elementId) =>
			sanitizeSequenceElementId({ elementId })
		);
		expect(new Set(mapped).size).toBe(ids.length);
		// Deterministic: same input always maps to the same directory.
		expect(sanitizeSequenceElementId({ elementId: "clip/a" })).toBe(mapped[0]);
		// Encoded ids end with the fixed-width UTF-16 hex of the original id.
		expect(mapped[0]).toBe("e-clip_a-0063006c00690070002f0061");
	});
});
