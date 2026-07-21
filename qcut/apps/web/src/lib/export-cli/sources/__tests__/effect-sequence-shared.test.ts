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
		// All of these would collapse to "clip_a" under charset replacement,
		// and the last one tries to impersonate an encoded name directly.
		const ids = [
			"clip/a",
			"clip_a",
			"clip:a",
			"e-clip_a-636c69702f61",
			"p-clip_a",
		];
		const mapped = ids.map((elementId) =>
			sanitizeSequenceElementId({ elementId })
		);
		expect(new Set(mapped).size).toBe(ids.length);
		// Deterministic: same input always maps to the same directory.
		expect(sanitizeSequenceElementId({ elementId: "clip/a" })).toBe(mapped[0]);
		// Encoded ids end with the full hex of the original id ("clip/a").
		expect(mapped[0]).toBe("e-clip_a-636c69702f61");
	});
});
