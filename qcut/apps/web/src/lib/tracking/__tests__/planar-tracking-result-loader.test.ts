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

	it("deduplicates in-flight reads and keeps the fulfilled result", async () => {
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

		// A settled read is retained. Previously the entry was evicted here, so
		// every later caller re-read, re-hashed and re-parsed the sidecar; during
		// export that meant one full read per rendered frame.
		await expect(
			loadPlanarTrackingSidecar({
				projectId: "project",
				reference,
				resultStore,
			})
		).resolves.toBe(sidecar);
		expect(read).toHaveBeenCalledOnce();
	});

	it("serves many sequential callers from one read", async () => {
		const read = vi.fn(async () => result());
		const resultStore = store({ read });
		// Mirrors an export: each frame awaits the previous one, so the in-flight
		// window never spans two frames and only a real result cache can help.
		for (let frame = 0; frame < 60; frame += 1) {
			await expect(
				loadPlanarTrackingSidecar({
					projectId: "project",
					reference,
					resultStore,
				})
			).resolves.toBe(sidecar);
		}
		expect(read).toHaveBeenCalledOnce();
	});

	it("re-reads when the tracking result hash changes", async () => {
		const read = vi.fn(async () => result());
		const resultStore = store({ read });
		await loadPlanarTrackingSidecar({
			projectId: "project",
			reference,
			resultStore,
		});
		// A re-tracked surface writes a new sha256, which is part of the key, so
		// a cached entry can never be served for changed tracking data.
		await loadPlanarTrackingSidecar({
			projectId: "project",
			reference: { ...reference, resultSha256: "d".repeat(64) },
			resultStore,
		});
		expect(read).toHaveBeenCalledTimes(2);
	});

	it("keeps separate entries per project", async () => {
		const read = vi.fn(async () => result());
		const resultStore = store({ read });
		await loadPlanarTrackingSidecar({
			projectId: "project-a",
			reference,
			resultStore,
		});
		await loadPlanarTrackingSidecar({
			projectId: "project-b",
			reference,
			resultStore,
		});
		expect(read).toHaveBeenCalledTimes(2);
	});

	it("bounds how many sidecars it retains", async () => {
		const read = vi.fn(async () => result());
		const resultStore = store({ read });
		// Nine distinct results, one more than the retention bound.
		const keys = Array.from({ length: 9 }, (_, index) =>
			String(index).repeat(64).slice(0, 64)
		);
		for (const resultSha256 of keys) {
			await loadPlanarTrackingSidecar({
				projectId: "project",
				reference: { ...reference, resultSha256 },
				resultStore,
			});
		}
		expect(read).toHaveBeenCalledTimes(9);
		// The most recent entry is still cached.
		await loadPlanarTrackingSidecar({
			projectId: "project",
			reference: { ...reference, resultSha256: keys[8] },
			resultStore,
		});
		expect(read).toHaveBeenCalledTimes(9);
		// The oldest was dropped and must be re-read.
		await loadPlanarTrackingSidecar({
			projectId: "project",
			reference: { ...reference, resultSha256: keys[0] },
			resultStore,
		});
		expect(read).toHaveBeenCalledTimes(10);
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
