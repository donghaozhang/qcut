import type {
	PlanarTrackingReference,
	PlanarTrackingResultStore,
	PlanarTrackingSidecarV1,
	StoredPlanarTrackingResult,
} from "@qcut/editor-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearPlanarTrackingSidecarCache,
	loadPlanarTrackingSidecar,
} from "../planar-tracking-result-loader";

const sidecar = {
	coordinateSpace: "source-display-normalized",
	direction: "both",
	provider: {
		id: "opencv-wasm",
		parametersHash: "a".repeat(64),
		version: "test",
	},
	samples: [],
	schemaVersion: 1,
	seed: {
		ptsUs: 0,
		quad: {
			topLeft: { x: 0.2, y: 0.2 },
			topRight: { x: 0.8, y: 0.2 },
			bottomRight: { x: 0.8, y: 0.8 },
			bottomLeft: { x: 0.2, y: 0.8 },
		},
	},
	source: {
		contentSha256: "b".repeat(64),
		displayHeight: 1080,
		displayWidth: 1920,
		mediaId: "media",
	},
	timebase: "microseconds",
} satisfies PlanarTrackingSidecarV1;

const reference = {
	analysisHeight: 540,
	analysisWidth: 960,
	direction: "both",
	id: "surface",
	provider: "opencv-wasm",
	providerVersion: "test",
	resultSha256: "c".repeat(64),
	resultUri: "project-tracking:surface",
	schemaVersion: 1,
	seedPtsUs: 0,
	seedQuad: sidecar.seed.quad,
	sourceMediaId: "media",
	status: "ready",
} satisfies PlanarTrackingReference;

function result(): StoredPlanarTrackingResult {
	return {
		resultSha256: reference.resultSha256,
		resultUri: reference.resultUri,
		sidecar,
	};
}

function store({
	read,
}: {
	read: PlanarTrackingResultStore["read"];
}): PlanarTrackingResultStore {
	return {
		read,
		remove: vi.fn(async () => undefined),
		write: vi.fn(async () => result()),
	};
}

describe("planar tracking result loader", () => {
	beforeEach(() => clearPlanarTrackingSidecarCache());

	it("deduplicates in-flight reads and evicts the fulfilled promise", async () => {
		const read = vi.fn(async () => result());
		const resultStore = store({ read });
		const first = loadPlanarTrackingSidecar({
			projectId: "project",
			reference,
			resultStore,
		});
		const second = loadPlanarTrackingSidecar({
			projectId: "project",
			reference,
			resultStore,
		});
		expect(first).toBe(second);
		await expect(first).resolves.toBe(sidecar);
		expect(read).toHaveBeenCalledOnce();

		await expect(
			loadPlanarTrackingSidecar({
				projectId: "project",
				reference,
				resultStore,
			})
		).resolves.toBe(sidecar);
		expect(read).toHaveBeenCalledTimes(2);
	});

	it("evicts failed reads so a repaired sidecar can be retried", async () => {
		const read = vi
			.fn<PlanarTrackingResultStore["read"]>()
			.mockRejectedValueOnce(new Error("corrupt"))
			.mockResolvedValueOnce(result());
		const resultStore = store({ read });
		await expect(
			loadPlanarTrackingSidecar({
				projectId: "project",
				reference,
				resultStore,
			})
		).rejects.toThrow("corrupt");
		await expect(
			loadPlanarTrackingSidecar({
				projectId: "project",
				reference,
				resultStore,
			})
		).resolves.toBe(sidecar);
		expect(read).toHaveBeenCalledTimes(2);
	});
});
