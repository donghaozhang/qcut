// @vitest-environment node

import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlanarTrackingSidecarV1 } from "@qcut/editor-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectFilePlanarTrackingResultStore } from "../planar-tracking-storage/result-store.js";

const temporaryDirectories: string[] = [];

function createSidecar({
	lastX = 0.8,
}: {
	lastX?: number;
} = {}): PlanarTrackingSidecarV1 {
	const seedQuad = {
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
		seed: { ptsUs: 0, quad: seedQuad },
		direction: "forward",
		samples: [
			{ ptsUs: 0, quad: seedQuad, status: "corrected", confidence: 1 },
			{
				ptsUs: 33_333,
				quad: {
					...seedQuad,
					topRight: { x: lastX, y: 0.1 },
				},
				status: "tracked",
				confidence: 0.9,
			},
		],
	};
}

async function createStore(): Promise<{
	projectRoot: string;
	store: ProjectFilePlanarTrackingResultStore;
}> {
	const projectRoot = await mkdtemp(join(tmpdir(), "qcut-planar-store-"));
	temporaryDirectories.push(projectRoot);
	return {
		projectRoot,
		store: new ProjectFilePlanarTrackingResultStore({
			resolveProjectRoot: async () => projectRoot,
		}),
	};
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("project file planar tracking result store", () => {
	it("atomically writes and verifies a sidecar", async () => {
		const { projectRoot, store } = await createStore();
		const stored = await store.write({
			projectId: "project-1",
			trackingId: "surface-1",
			sidecar: createSidecar(),
		});
		const resultDirectory = join(projectRoot, "tracking", "planar");
		expect(await readdir(resultDirectory)).toEqual(["surface-1.json"]);
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

	it("replaces an existing result without leaving pending files", async () => {
		const { projectRoot, store } = await createStore();
		const first = await store.write({
			projectId: "project-1",
			trackingId: "surface-1",
			sidecar: createSidecar(),
		});
		const second = await store.write({
			projectId: "project-1",
			trackingId: "surface-1",
			sidecar: createSidecar({ lastX: 0.82 }),
		});

		expect(second.resultSha256).not.toBe(first.resultSha256);
		expect(await readdir(join(projectRoot, "tracking", "planar"))).toEqual([
			"surface-1.json",
		]);
		await expect(
			store.read({
				expectedSha256: second.resultSha256,
				projectId: "project-1",
				resultUri: second.resultUri,
			})
		).resolves.toEqual(second);
	});

	it("detects changed bytes before parsing the sidecar", async () => {
		const { projectRoot, store } = await createStore();
		const stored = await store.write({
			projectId: "project-1",
			trackingId: "surface-1",
			sidecar: createSidecar(),
		});
		const filePath = join(projectRoot, "tracking", "planar", "surface-1.json");
		await writeFile(filePath, `${await readFile(filePath, "utf8")} `, "utf8");

		await expect(
			store.read({
				expectedSha256: stored.resultSha256,
				projectId: "project-1",
				resultUri: stored.resultUri,
			})
		).rejects.toThrow("SHA-256 mismatch");
	});

	it("rejects schema-invalid content even when its hash matches", async () => {
		const { projectRoot, store } = await createStore();
		const resultDirectory = join(projectRoot, "tracking", "planar");
		await store.write({
			projectId: "project-1",
			trackingId: "surface-1",
			sidecar: createSidecar(),
		});
		const serialized = '{"schemaVersion":2}\n';
		await writeFile(
			join(resultDirectory, "surface-1.json"),
			serialized,
			"utf8"
		);
		const expectedSha256 = createHash("sha256")
			.update(serialized, "utf8")
			.digest("hex");

		await expect(
			store.read({
				expectedSha256,
				projectId: "project-1",
				resultUri: "project-tracking:surface-1",
			})
		).rejects.toThrow("Invalid planar tracking sidecar");
	});

	it("rejects traversal ids before resolving a project path", async () => {
		const resolveProjectRoot = vi.fn(async () => "/unused");
		const store = new ProjectFilePlanarTrackingResultStore({
			resolveProjectRoot,
		});

		await expect(
			store.write({
				projectId: "project-1",
				trackingId: "../escape",
				sidecar: createSidecar(),
			})
		).rejects.toThrow("Invalid planar tracking storage id");
		expect(resolveProjectRoot).not.toHaveBeenCalled();
	});

	it("removes results idempotently", async () => {
		const { projectRoot, store } = await createStore();
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
		expect(await readdir(join(projectRoot, "tracking", "planar"))).toEqual([]);
	});
});
