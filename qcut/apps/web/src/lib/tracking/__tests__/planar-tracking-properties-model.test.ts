import type { PlanarTrackingReference } from "@qcut/editor-core";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_PLANAR_SEED_QUAD,
	readPlanarTrackingErrorCode,
	upsertPlanarTrackingReference,
} from "../planar-tracking-properties-model";

function createReference({ id }: { id: string }): PlanarTrackingReference {
	return {
		analysisHeight: 540,
		analysisWidth: 960,
		direction: "both",
		id,
		provider: "opencv-wasm",
		providerVersion: "test",
		schemaVersion: 1,
		seedPtsUs: 0,
		seedQuad: DEFAULT_PLANAR_SEED_QUAD,
		sourceMediaId: "media-1",
		status: "ready",
	};
}

describe("planar tracking properties model", () => {
	it("replaces a reference without changing unrelated entries", () => {
		const first = createReference({ id: "first" });
		const replacement = { ...first, status: "partial" as const };
		const second = createReference({ id: "second" });
		expect(
			upsertPlanarTrackingReference({
				reference: replacement,
				references: [first, second],
			})
		).toEqual([second, replacement]);
	});

	it("maps aborts and provider error codes to terminal UI codes", () => {
		expect(
			readPlanarTrackingErrorCode({
				cause: new DOMException("cancelled", "AbortError"),
			})
		).toBe("cancelled");
		const providerError = Object.assign(new Error("texture"), {
			code: "insufficient-texture",
		});
		expect(readPlanarTrackingErrorCode({ cause: providerError })).toBe(
			"insufficient-texture"
		);
		expect(readPlanarTrackingErrorCode({ cause: new Error("unknown") })).toBe(
			"decode-failed"
		);
	});
});
