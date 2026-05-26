/**
 * Pins the thumbnail-stripping contract that fixes the 19 MB snapshot
 * truncation bug.
 *
 * Exercises the pure helper directly — testing the full
 * `buildEditorStateSnapshot` requires faking five Zustand stores, which
 * would obscure the contract this commit is locking down.
 */

import { describe, expect, it } from "vitest";
import { stripThumbnailIfBase64 } from "../claude-state-bridge";
import { STRIPPED_THUMBNAIL_SENTINEL } from "../../../../../../electron/types/claude-api";

describe("stripThumbnailIfBase64", () => {
	it("replaces a data:image/jpeg;base64 URL with the sentinel", () => {
		const big = "data:image/jpeg;base64," + "A".repeat(2_000_000);
		expect(stripThumbnailIfBase64(big)).toBe(STRIPPED_THUMBNAIL_SENTINEL);
	});

	it("replaces every data: scheme variant (png, webp, gif)", () => {
		expect(stripThumbnailIfBase64("data:image/png;base64,iVBOR...")).toBe(
			STRIPPED_THUMBNAIL_SENTINEL
		);
		expect(stripThumbnailIfBase64("data:image/webp;base64,UklGR...")).toBe(
			STRIPPED_THUMBNAIL_SENTINEL
		);
		expect(stripThumbnailIfBase64("data:image/gif;base64,R0lG...")).toBe(
			STRIPPED_THUMBNAIL_SENTINEL
		);
	});

	it("passes blob: URLs through untouched (they're tiny refs, not the bytes)", () => {
		const blob = "blob:app://./1e0203cf-4e9e-40bb-a9bb-e3597a2d8331";
		expect(stripThumbnailIfBase64(blob)).toBe(blob);
	});

	it("passes https URLs through untouched", () => {
		const url = "https://example.com/thumb.jpg";
		expect(stripThumbnailIfBase64(url)).toBe(url);
	});

	it("passes app:// and http URLs through untouched", () => {
		expect(stripThumbnailIfBase64("app://thumbnail/abc.jpg")).toBe(
			"app://thumbnail/abc.jpg"
		);
		expect(stripThumbnailIfBase64("http://example.com/x.png")).toBe(
			"http://example.com/x.png"
		);
	});

	it("collapses null and undefined to undefined", () => {
		expect(stripThumbnailIfBase64(null)).toBeUndefined();
		expect(stripThumbnailIfBase64(undefined)).toBeUndefined();
	});

	it("preserves the empty string verbatim (not a data URI)", () => {
		// Edge: empty string is technically a string and !value would
		// drop it; ensure we don't conflate "" with null. The bridge
		// itself never produces "" but the helper should be precise.
		expect(stripThumbnailIfBase64("")).toBe("");
	});

	it("the stripped sentinel is a short fixed string (no transport hazard)", () => {
		// Defensive: future refactors must not let the sentinel itself
		// grow into something large. The whole point is bounded output.
		expect(STRIPPED_THUMBNAIL_SENTINEL.length).toBeLessThan(64);
	});
});
