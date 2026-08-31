import type {
	PlanarTrackingReference,
	PlanarTrackingResultStore,
	PlanarTrackingSidecarV1,
	StickerPlanarTracking,
} from "@qcut/editor-core";
import { describe, expect, it, vi } from "vitest";
import { runPlanarTrackingJob } from "../planar-tracking-job";

const QUAD = {
	topLeft: { x: 0.2, y: 0.2 },
	topRight: { x: 0.8, y: 0.2 },
	bottomRight: { x: 0.8, y: 0.8 },
	bottomLeft: { x: 0.2, y: 0.8 },
} as const;

function sidecar(): PlanarTrackingSidecarV1 {
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
			version: "test-provider",
			parametersHash: "b".repeat(64),
		},
		seed: { ptsUs: 50, quad: QUAD },
		direction: "both",
		samples: [
			{ confidence: 0.8, ptsUs: 0, quad: QUAD, status: "tracked" },
			{ confidence: 1, ptsUs: 50, quad: QUAD, status: "corrected" },
			{ confidence: 0, ptsUs: 80, quad: QUAD, status: "lost" },
		],
	};
}

function resultStore({
	fail = false,
}: {
	fail?: boolean;
} = {}): PlanarTrackingResultStore {
	return {
		async read() {
			throw new Error("unused");
		},
		async remove() {},
		async write({ sidecar: value }) {
			if (fail) throw new Error("disk full");
			return {
				resultSha256: "c".repeat(64),
				resultUri: "project-tracking:track-1",
				sidecar: value,
			};
		},
	};
}

function options({ failWrite = false }: { failWrite?: boolean } = {}) {
	const references: PlanarTrackingReference[] = [];
	const bindings: StickerPlanarTracking[] = [];
	return {
		bindings,
		references,
		options: {
			analyze: vi.fn(async () => ({
				analysisHeight: 360,
				analysisWidth: 640,
				lostDirections: ["forward" as const],
				providerVersion: "test-provider",
				sidecar: sidecar(),
			})),
			direction: "both" as const,
			file: new File(["video"], "source.mp4"),
			lostBehavior: "hold" as const,
			onBinding: (binding: StickerPlanarTracking) => bindings.push(binding),
			onReference: (reference: PlanarTrackingReference) =>
				references.push(reference),
			projectId: "project-1",
			resultStore: resultStore({ fail: failWrite }),
			seedPtsUs: 52,
			seedQuad: QUAD,
			seedTargetQuad: QUAD,
			sourceDisplayHeight: 1080,
			sourceDisplayWidth: 1920,
			sourceElementId: "video-element-1",
			sourceMediaId: "media-1",
			trackingId: "track-1",
		},
	};
}

describe("planar tracking job", () => {
	it("persists the sidecar before publishing the ready reference and binding", async () => {
		const fixture = options();
		const result = await runPlanarTrackingJob(fixture.options);

		expect(fixture.references.map((reference) => reference.status)).toEqual([
			"processing",
			"partial",
		]);
		expect(fixture.references[1]).toMatchObject({
			analysisHeight: 360,
			analysisWidth: 640,
			resultSha256: "c".repeat(64),
			resultUri: "project-tracking:track-1",
			sampleCount: 3,
			seedPtsUs: 50,
			trackedRange: { endPtsUs: 80, startPtsUs: 0 },
		});
		expect(fixture.bindings).toEqual([result.binding]);
		expect(result.binding).toMatchObject({
			mode: "planar",
			seedPtsUs: 50,
			sourceElementId: "video-element-1",
			surfaceTrackingId: "track-1",
		});
	});

	it("records a write failure without publishing a binding", async () => {
		const fixture = options({ failWrite: true });
		await expect(runPlanarTrackingJob(fixture.options)).rejects.toThrow(
			"disk full"
		);
		expect(fixture.references.map((reference) => reference.status)).toEqual([
			"processing",
			"error",
		]);
		expect(fixture.references.at(-1)?.errorCode).toBe("result-write-failed");
		expect(fixture.bindings).toEqual([]);
	});

	it("records cancellation as a terminal error", async () => {
		const fixture = options();
		fixture.options.analyze = vi.fn(async () => {
			throw new DOMException("cancelled", "AbortError");
		});
		await expect(runPlanarTrackingJob(fixture.options)).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(fixture.references.at(-1)?.errorCode).toBe("cancelled");
	});
});
