import type { PlanarTrackingSidecarV1 } from "@qcut/editor-core";
import { describe, expect, it } from "vitest";
import { BrowserPlanarTrackingResultStore } from "../browser-planar-result-store";
import type {
	PlanarTrackingResultEntry,
	PlanarTrackingResultEntryStorage,
} from "../indexeddb-planar-result-entry-storage";

class MemoryEntryStorage implements PlanarTrackingResultEntryStorage {
	readonly entries = new Map<string, PlanarTrackingResultEntry>();

	async get({
		key,
	}: {
		key: string;
	}): Promise<PlanarTrackingResultEntry | null> {
		return this.entries.get(key) ?? null;
	}

	async put({ entry }: { entry: PlanarTrackingResultEntry }): Promise<void> {
		this.entries.set(entry.key, structuredClone(entry));
	}

	async remove({ key }: { key: string }): Promise<void> {
		this.entries.delete(key);
	}
}

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

describe("browser planar tracking result store", () => {
	it("writes and verifies a sidecar", async () => {
		const storage = new MemoryEntryStorage();
		const store = new BrowserPlanarTrackingResultStore({ storage });
		const stored = await store.write({
			projectId: "project-1",
			trackingId: "surface-1",
			sidecar: createSidecar(),
		});

		expect(stored.resultUri).toBe("project-tracking:surface-1");
		expect(stored.resultSha256).toMatch(/^[a-f\d]{64}$/);
		await expect(
			store.read({
				expectedSha256: stored.resultSha256,
				projectId: "project-1",
				resultUri: stored.resultUri,
			})
		).resolves.toEqual(stored);
	});

	it("namespaces identical tracking ids by project", async () => {
		const storage = new MemoryEntryStorage();
		const store = new BrowserPlanarTrackingResultStore({ storage });
		const first = await store.write({
			projectId: "project-1",
			trackingId: "surface-1",
			sidecar: createSidecar(),
		});
		await store.write({
			projectId: "project-2",
			trackingId: "surface-1",
			sidecar: createSidecar(),
		});

		expect(storage.entries.size).toBe(2);
		await expect(
			store.read({
				expectedSha256: first.resultSha256,
				projectId: "project-1",
				resultUri: first.resultUri,
			})
		).resolves.toEqual(first);
	});

	it("detects mutated serialized data and stored hashes", async () => {
		const storage = new MemoryEntryStorage();
		const store = new BrowserPlanarTrackingResultStore({ storage });
		const stored = await store.write({
			projectId: "project-1",
			trackingId: "surface-1",
			sidecar: createSidecar(),
		});
		const entry = [...storage.entries.values()][0];
		if (!entry) throw new Error("Expected a stored test entry.");
		entry.serialized = `${entry.serialized} `;

		await expect(
			store.read({
				expectedSha256: stored.resultSha256,
				projectId: "project-1",
				resultUri: stored.resultUri,
			})
		).rejects.toThrow("SHA-256 mismatch");

		entry.serialized = JSON.stringify(createSidecar());
		entry.resultSha256 = "0".repeat(64);
		await expect(
			store.read({
				expectedSha256: stored.resultSha256,
				projectId: "project-1",
				resultUri: stored.resultUri,
			})
		).rejects.toThrow("SHA-256 mismatch");
	});

	it("keeps failed project lookups isolated", async () => {
		const storage = new MemoryEntryStorage();
		const store = new BrowserPlanarTrackingResultStore({ storage });
		const stored = await store.write({
			projectId: "project-1",
			trackingId: "surface-1",
			sidecar: createSidecar(),
		});

		await expect(
			store.read({
				expectedSha256: stored.resultSha256,
				projectId: "project-2",
				resultUri: stored.resultUri,
			})
		).rejects.toThrow("not found");
	});

	it("removes results idempotently", async () => {
		const storage = new MemoryEntryStorage();
		const store = new BrowserPlanarTrackingResultStore({ storage });
		const stored = await store.write({
			projectId: "project-1",
			trackingId: "surface-1",
			sidecar: createSidecar(),
		});

		await store.remove({
			projectId: "project-1",
			resultUri: stored.resultUri,
		});
		await store.remove({
			projectId: "project-1",
			resultUri: stored.resultUri,
		});
		expect(storage.entries.size).toBe(0);
	});
});
