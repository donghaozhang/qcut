import { describe, expect, it } from "vitest";
import type { PlanarTrackingSidecarV1 } from "../planar-types.js";
import {
	createPlanarTrackingResultUri,
	isPlanarTrackingStorageId,
	parsePlanarTrackingResultUri,
} from "../planar-result-storage.js";
import {
	parsePlanarTrackingSidecar,
	PlanarTrackingSidecarValidationError,
	serializePlanarTrackingSidecar,
} from "../planar-sidecar-serialization.js";

function createSidecar(): PlanarTrackingSidecarV1 {
	const quad = {
		topLeft: { x: 0.1, y: 0.1 },
		topRight: { x: 0.8, y: 0.1 },
		bottomRight: { x: 0.8, y: 0.8 },
		bottomLeft: { x: 0.1, y: 0.8 },
	};
	return {
		schemaVersion: 1,
		coordinateSpace: "source-display-normalized",
		timebase: "microseconds",
		source: {
			mediaId: "media-1",
			contentSha256: "a".repeat(64),
			displayWidth: 1920,
			displayHeight: 1080,
		},
		provider: {
			id: "opencv-wasm",
			version: "4.12.0-qcut.1",
			parametersHash: "b".repeat(64),
		},
		seed: { ptsUs: 0, quad },
		direction: "forward",
		samples: [{ ptsUs: 0, quad, status: "corrected", confidence: 1 }],
	};
}

describe("planar tracking result URI", () => {
	it("round-trips safe storage ids", () => {
		const trackingId = "track_A-1.2";
		const resultUri = createPlanarTrackingResultUri({ trackingId });
		expect(resultUri).toBe("project-tracking:track_A-1.2");
		expect(parsePlanarTrackingResultUri({ resultUri })).toBe(trackingId);
	});

	it.each([
		"",
		".hidden",
		"../escape",
		"a/b",
		"a:b",
		"a".repeat(129),
	])("rejects unsafe storage id %s", (trackingId) => {
		expect(isPlanarTrackingStorageId({ trackingId })).toBe(false);
		expect(() => createPlanarTrackingResultUri({ trackingId })).toThrow();
	});

	it.each([
		"tracking:one",
		"project-tracking:",
		"project-tracking:../x",
	])("rejects malformed result URI %s", (resultUri) => {
		expect(() => parsePlanarTrackingResultUri({ resultUri })).toThrow();
	});
});

describe("planar tracking sidecar serialization", () => {
	it("validates and round-trips a sidecar", () => {
		const sidecar = createSidecar();
		const serialized = serializePlanarTrackingSidecar({ sidecar });
		expect(serialized.endsWith("\n")).toBe(true);
		expect(parsePlanarTrackingSidecar({ serialized })).toEqual(sidecar);
	});

	it("rejects invalid JSON and invalid sidecar data", () => {
		expect(() =>
			parsePlanarTrackingSidecar({ serialized: "not-json" })
		).toThrow("not valid JSON");
		expect(() =>
			serializePlanarTrackingSidecar({
				sidecar: { ...createSidecar(), samples: [] },
			})
		).toThrow(PlanarTrackingSidecarValidationError);
	});
});
