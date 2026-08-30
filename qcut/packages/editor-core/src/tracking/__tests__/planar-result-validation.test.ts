import { describe, expect, it } from "vitest";
import type {
	PlanarTrackingReference,
	PlanarTrackingSidecarV1,
	StickerPlanarTracking,
} from "../planar-types.js";
import {
	validatePlanarTrackingReference,
	validatePlanarTrackingSidecar,
	validateStickerPlanarTracking,
} from "../planar-result-validation.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function validSidecar(): PlanarTrackingSidecarV1 {
	const seedQuad = {
		topLeft: { x: 0.1, y: 0.1 },
		topRight: { x: 0.8, y: 0.12 },
		bottomRight: { x: 0.82, y: 0.75 },
		bottomLeft: { x: 0.08, y: 0.78 },
	};
	return {
		schemaVersion: 1,
		coordinateSpace: "source-display-normalized",
		timebase: "microseconds",
		source: {
			mediaId: "media-1",
			contentSha256: HASH_A,
			displayWidth: 1920,
			displayHeight: 1080,
		},
		provider: {
			id: "opencv-wasm",
			version: "4.10.0-qcut.1",
			parametersHash: HASH_B,
		},
		seed: { ptsUs: 1_000_000, quad: seedQuad },
		direction: "both",
		samples: [
			{
				ptsUs: 966_667,
				quad: {
					topLeft: { x: 0.09, y: 0.1 },
					topRight: { x: 0.79, y: 0.12 },
					bottomRight: { x: 0.81, y: 0.75 },
					bottomLeft: { x: 0.07, y: 0.78 },
				},
				status: "tracked",
				confidence: 0.93,
			},
			{
				ptsUs: 1_000_000,
				quad: seedQuad,
				status: "corrected",
				confidence: 1,
				diagnostics: {
					trackedPoints: 80,
					inliers: 72,
					inlierRatio: 0.9,
					medianSymmetricErrorPx: 0.42,
					coverage: 0.68,
				},
			},
		],
	};
}

function validReference(): PlanarTrackingReference {
	return {
		schemaVersion: 1,
		id: "surface-1",
		sourceMediaId: "media-1",
		resultUri: "project-tracking:surface-1",
		resultSha256: HASH_A,
		seedPtsUs: 1_000_000,
		seedQuad: validSidecar().seed.quad,
		direction: "both",
		provider: "opencv-wasm",
		providerVersion: "4.10.0-qcut.1",
		analysisWidth: 960,
		analysisHeight: 540,
		status: "ready",
		sampleCount: 2,
		trackedRange: { startPtsUs: 966_667, endPtsUs: 1_000_000 },
	};
}

function validStickerBinding(): StickerPlanarTracking {
	return {
		mode: "planar",
		sourceElementId: "clip-1",
		surfaceTrackingId: "surface-1",
		seedPtsUs: 1_000_000,
		seedTargetQuad: validSidecar().seed.quad,
		lostBehavior: "hold",
	};
}

function issueCodes({ value }: { value: unknown }): string[] {
	const result = validatePlanarTrackingSidecar({ value });
	return result.issues.map((issue) => issue.code);
}

describe("planar tracking sidecar validation", () => {
	it("accepts a complete V1 sidecar", () => {
		const sidecar = validSidecar();
		const result = validatePlanarTrackingSidecar({ value: sidecar });
		expect(result.valid).toBe(true);
		if (!result.valid) return;
		expect(result.value).toBe(sidecar);
	});

	it("rejects schema, coordinate, hash, and dimension corruption", () => {
		const sidecar = validSidecar();
		const result = validatePlanarTrackingSidecar({
			value: {
				...sidecar,
				schemaVersion: 2,
				coordinateSpace: "analysis-pixels",
				source: {
					...sidecar.source,
					contentSha256: "short",
					displayWidth: 0,
				},
			},
		});
		expect(result.valid).toBe(false);
		expect(result.issues.map((issue) => issue.path)).toEqual(
			expect.arrayContaining([
				"schemaVersion",
				"coordinateSpace",
				"source.contentSha256",
				"source.displayWidth",
			])
		);
	});

	it("rejects duplicate and decreasing source PTS", () => {
		const sidecar = validSidecar();
		const result = validatePlanarTrackingSidecar({
			value: {
				...sidecar,
				samples: [
					sidecar.samples[1],
					{ ...sidecar.samples[0], ptsUs: sidecar.samples[1].ptsUs },
				],
			},
		});
		expect(result.valid).toBe(false);
		expect(result.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "invalid-sample-order" }),
			])
		);
	});

	it("rejects invalid confidence, quad geometry, and diagnostics", () => {
		const sidecar = validSidecar();
		const result = validatePlanarTrackingSidecar({
			value: {
				...sidecar,
				samples: [
					{
						...sidecar.samples[0],
						confidence: 1.2,
						quad: {
							topLeft: { x: 0, y: 0 },
							topRight: { x: 1, y: 1 },
							bottomRight: { x: 1, y: 0 },
							bottomLeft: { x: 0, y: 1 },
						},
						diagnostics: {
							trackedPoints: 5,
							inliers: 6,
							inlierRatio: 1.1,
							medianSymmetricErrorPx: -1,
							coverage: 2,
						},
					},
					sidecar.samples[1],
				],
			},
		});
		expect(result.valid).toBe(false);
		expect(result.issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining([
				"invalid-number",
				"invalid-quad",
				"invalid-diagnostics",
			])
		);
	});

	it("requires the exact declared seed sample and quad", () => {
		const sidecar = validSidecar();
		expect(
			issueCodes({
				value: { ...sidecar, seed: { ...sidecar.seed, ptsUs: 2_000_000 } },
			})
		).toContain("invalid-seed-sample");
		expect(
			issueCodes({
				value: {
					...sidecar,
					seed: {
						...sidecar.seed,
						quad: {
							...sidecar.seed.quad,
							topLeft: { x: 0.11, y: 0.1 },
						},
					},
				},
			})
		).toContain("invalid-seed-sample");
	});
});

describe("planar tracking reference validation", () => {
	it("accepts a stored ready reference", () => {
		const reference = validReference();
		const result = validatePlanarTrackingReference({ value: reference });
		expect(result.valid).toBe(true);
		if (!result.valid) return;
		expect(result.value).toBe(reference);
	});

	it("rejects absolute, traversing, and foreign-scheme result URIs", () => {
		for (const resultUri of [
			"/tmp/result.json",
			"C:\\tracking\\result.json",
			"../tracking/result.json",
			"tracking/%2e%2e/result.json",
			"file:///tmp/result.json",
			"https://example.com/result.json",
		]) {
			const result = validatePlanarTrackingReference({
				value: { ...validReference(), resultUri },
			});
			expect(result.valid).toBe(false);
			expect(result.issues.map((issue) => issue.code)).toContain(
				"unsafe-result-uri"
			);
		}
	});

	it("enforces stored-result and error state invariants", () => {
		const reference = validReference();
		const missingHash = validatePlanarTrackingReference({
			value: { ...reference, resultSha256: undefined },
		});
		const emptyReady = validatePlanarTrackingReference({
			value: {
				...reference,
				resultUri: undefined,
				resultSha256: undefined,
				sampleCount: 0,
			},
		});
		const errorWithoutCode = validatePlanarTrackingReference({
			value: { ...reference, status: "error", errorCode: undefined },
		});
		for (const result of [missingHash, emptyReady, errorWithoutCode]) {
			expect(result.valid).toBe(false);
			expect(result.issues.map((issue) => issue.code)).toContain(
				"invalid-reference-state"
			);
		}
	});

	it("rejects reversed tracked ranges", () => {
		const result = validatePlanarTrackingReference({
			value: {
				...validReference(),
				trackedRange: { startPtsUs: 2_000_000, endPtsUs: 1_000_000 },
			},
		});
		expect(result.valid).toBe(false);
		expect(result.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "invalid-reference-state",
					path: "trackedRange",
				}),
			])
		);
	});

	it("requires tracked ranges to contain the seed PTS", () => {
		const result = validatePlanarTrackingReference({
			value: {
				...validReference(),
				trackedRange: { startPtsUs: 2_000_000, endPtsUs: 3_000_000 },
			},
		});
		expect(result.valid).toBe(false);
		expect(result.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "invalid-reference-state",
					message: "Tracked range must contain the seed PTS.",
				}),
			])
		);
	});
});

describe("sticker planar tracking validation", () => {
	it("accepts a complete planar sticker binding", () => {
		const binding = validStickerBinding();
		const result = validateStickerPlanarTracking({ value: binding });
		expect(result.valid).toBe(true);
		if (!result.valid) return;
		expect(result.value).toBe(binding);
	});

	it("rejects missing identities, unsafe PTS values, and invalid quads", () => {
		const binding = validStickerBinding();
		const result = validateStickerPlanarTracking({
			value: {
				...binding,
				sourceElementId: " ",
				surfaceTrackingId: null,
				seedPtsUs: Number.MAX_SAFE_INTEGER + 1,
				seedTargetQuad: {
					topLeft: { x: 0, y: 0 },
					topRight: { x: 1, y: 1 },
					bottomRight: { x: 1, y: 0 },
					bottomLeft: { x: 0, y: 1 },
				},
			},
		});

		expect(result.valid).toBe(false);
		expect(result.issues.map((issue) => issue.path)).toEqual(
			expect.arrayContaining([
				"sourceElementId",
				"surfaceTrackingId",
				"seedPtsUs",
				"seedTargetQuad",
			])
		);
	});

	it("rejects unsupported modes and lost behaviors", () => {
		const binding = validStickerBinding();
		const result = validateStickerPlanarTracking({
			value: {
				...binding,
				mode: "motion",
				lostBehavior: "drift",
			},
		});

		expect(result.valid).toBe(false);
		expect(result.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ path: "mode" }),
				expect.objectContaining({ path: "lostBehavior" }),
			])
		);
	});
});
