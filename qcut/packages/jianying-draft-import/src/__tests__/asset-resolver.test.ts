import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InteropResource } from "@qcut/editor-core/draft-interop";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveImportAssets } from "../asset-resolver.js";

/**
 * JYI-008 acceptance: hash priority, same-name conflicts, missing/relink,
 * the licensing action, and bounded concurrency.
 */

let draftRoot: string;

beforeEach(async () => {
	draftRoot = await mkdtemp(join(tmpdir(), "qcut-assets-test-"));
});

afterEach(async () => {
	await rm(draftRoot, { recursive: true, force: true });
});

function sha256Of(content: string): string {
	return createHash("sha256").update(content).digest("hex");
}

function createResource({
	id = "res-1",
	name,
	sha256,
	originHint = "local-media",
}: {
	id?: string;
	name?: string;
	sha256?: string;
	originHint?: InteropResource["originHint"];
}): InteropResource {
	return {
		id,
		kind: "video",
		...(name === undefined ? {} : { name }),
		...(sha256 === undefined ? {} : { sha256 }),
		originHint,
		status: "pending",
		capability: "exact",
	};
}

describe("resolveImportAssets", () => {
	it("resolves a declared path whose bytes match the expected hash", async () => {
		const declaredPath = join(draftRoot, "clip.mp4");
		await writeFile(declaredPath, "video-bytes");
		const { assets, resolvedResources } = await resolveImportAssets({
			resources: [
				createResource({ name: "clip.mp4", sha256: sha256Of("video-bytes") }),
			],
			restrictedSourcePathsByResourceId: { "res-1": declaredPath },
			rootRealPath: draftRoot,
		});
		expect(assets[0]).toMatchObject({
			status: "resolved",
			method: "declared-path",
			sha256: sha256Of("video-bytes"),
			restrictedAbsolutePath: declaredPath,
		});
		expect(resolvedResources[0]).toMatchObject({
			status: "resolved",
			sha256: sha256Of("video-bytes"),
			byteLength: 11,
		});
	});

	it("resolves a CapCut portable placeholder inside the draft root", async () => {
		const fileName = "resource-id-qcut-proof.mp4";
		const assetDirectory = join(draftRoot, "assets", "video");
		await mkdir(assetDirectory, { recursive: true });
		const assetPath = join(assetDirectory, fileName);
		await writeFile(assetPath, "portable-video");
		const placeholderPath = `##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##/assets/video/${fileName}`;
		const { assets } = await resolveImportAssets({
			resources: [createResource({ name: fileName })],
			restrictedSourcePathsByResourceId: { "res-1": placeholderPath },
			rootRealPath: draftRoot,
		});
		expect(assets[0]).toMatchObject({
			status: "resolved",
			method: "draft-placeholder",
			sha256: sha256Of("portable-video"),
			restrictedAbsolutePath: assetPath,
		});
	});

	it("lets hash evidence outrank a mismatching declared path", async () => {
		const declaredPath = join(draftRoot, "stale", "clip.mp4");
		await mkdir(join(draftRoot, "stale"));
		await writeFile(declaredPath, "WRONG bytes");
		await mkdir(join(draftRoot, "assets"));
		await writeFile(join(draftRoot, "assets", "clip.mp4"), "right bytes");

		const { assets } = await resolveImportAssets({
			resources: [
				createResource({ name: "clip.mp4", sha256: sha256Of("right bytes") }),
			],
			restrictedSourcePathsByResourceId: { "res-1": declaredPath },
			rootRealPath: draftRoot,
		});
		expect(assets[0].status).toBe("resolved");
		expect(assets[0].method).toBe("hash-search");
		expect(assets[0].restrictedAbsolutePath).toBe(
			join(draftRoot, "assets", "clip.mp4")
		);
		// The declared-path mismatch is reported, not hidden.
		expect(
			assets[0].issues.some((issue) => issue.code === "RESOURCE_MISSING")
		).toBe(true);
	});

	it("marks a mismatching declared path with no alternative as relink-required", async () => {
		const declaredPath = join(draftRoot, "clip.mp4");
		await writeFile(declaredPath, "WRONG bytes");
		const { assets, resolvedResources } = await resolveImportAssets({
			resources: [
				createResource({ name: "clip.mp4", sha256: sha256Of("right bytes") }),
			],
			restrictedSourcePathsByResourceId: { "res-1": declaredPath },
			rootRealPath: draftRoot,
		});
		// The declared file itself is the only name candidate and its hash
		// does not match, so this needs a user relink, not a silent pick.
		expect(assets[0].status).toBe("relink-required");
		expect(resolvedResources[0].status).toBe("pending");
	});

	it("reports same-name conflicts without a hash as ambiguous", async () => {
		await mkdir(join(draftRoot, "a"));
		await mkdir(join(draftRoot, "b"));
		await writeFile(join(draftRoot, "a", "clip.mp4"), "one");
		await writeFile(join(draftRoot, "b", "clip.mp4"), "two");
		const { assets, resolvedResources } = await resolveImportAssets({
			resources: [createResource({ name: "clip.mp4" })],
			restrictedSourcePathsByResourceId: {},
			rootRealPath: draftRoot,
		});
		expect(assets[0].status).toBe("ambiguous");
		expect(assets[0].issues[0].code).toBe("RESOURCE_AMBIGUOUS");
		expect(resolvedResources[0].status).toBe("pending");
	});

	it("resolves a unique name candidate when no hash is known", async () => {
		await mkdir(join(draftRoot, "assets"));
		await writeFile(join(draftRoot, "assets", "song.mp3"), "audio");
		const { assets } = await resolveImportAssets({
			resources: [createResource({ name: "song.mp3" })],
			restrictedSourcePathsByResourceId: {},
			rootRealPath: draftRoot,
		});
		expect(assets[0]).toMatchObject({
			status: "resolved",
			method: "name-search",
			sha256: sha256Of("audio"),
		});
	});

	it("builds one filename index for distinct name searches", async () => {
		await mkdir(join(draftRoot, "assets"));
		await Promise.all([
			writeFile(join(draftRoot, "assets", "first.mp4"), "first"),
			writeFile(join(draftRoot, "assets", "second.mp4"), "second"),
		]);
		let indexBuilds = 0;
		const result = await resolveImportAssets({
			resources: [
				createResource({ id: "first", name: "first.mp4" }),
				createResource({ id: "second", name: "second.mp4" }),
			],
			restrictedSourcePathsByResourceId: {},
			rootRealPath: draftRoot,
			instrumentation: {
				onNameIndexBuild: () => {
					indexBuilds += 1;
				},
			},
		});

		expect(result.assets.every((asset) => asset.status === "resolved")).toBe(
			true
		);
		expect(indexBuilds).toBe(1);
		expect(result.cacheMetrics.nameSearchMisses).toBe(2);
	});

	it("reports missing when nothing is found", async () => {
		const { assets, resolvedResources } = await resolveImportAssets({
			resources: [createResource({ name: "ghost.mp4" })],
			restrictedSourcePathsByResourceId: {},
			rootRealPath: draftRoot,
		});
		expect(assets[0].status).toBe("missing");
		expect(assets[0].issues[0]).toMatchObject({
			code: "RESOURCE_MISSING",
			severity: "error",
		});
		expect(resolvedResources[0].status).toBe("missing");
	});

	it("never probes app-owned resources (JYR-008 gate)", async () => {
		let probes = 0;
		const { assets, resolvedResources } = await resolveImportAssets({
			resources: [
				createResource({
					id: "fx-1",
					name: "fancy.lut",
					originHint: "app-resource",
				}),
			],
			restrictedSourcePathsByResourceId: { "fx-1": join(draftRoot, "x") },
			rootRealPath: draftRoot,
			instrumentation: {
				onProbeStart: () => {
					probes += 1;
				},
			},
		});
		expect(assets[0].status).toBe("license-restricted");
		expect(assets[0].issues[0].code).toBe("RESOURCE_LICENSE_RESTRICTED");
		expect(resolvedResources[0].status).toBe("opaque");
		expect(assets[0].restrictedAbsolutePath).toBeUndefined();
		// One pool slot ran, but license-restricted returns before any fs probe:
		// there must be no resolved bytes and no hash.
		expect(assets[0].sha256).toBeUndefined();
		expect(probes).toBe(1);
	});

	it("never follows symlinked name candidates", async () => {
		await writeFile(join(draftRoot, "real.mp4"), "bytes");
		await symlink(join(draftRoot, "real.mp4"), join(draftRoot, "clip.mp4"));
		const { assets } = await resolveImportAssets({
			resources: [createResource({ name: "clip.mp4" })],
			restrictedSourcePathsByResourceId: {},
			rootRealPath: draftRoot,
		});
		expect(assets[0].status).toBe("missing");
	});

	it("caps concurrency at the pool size and keeps input order", async () => {
		const resources: InteropResource[] = [];
		const paths: Record<string, string> = {};
		for (let index = 0; index < 12; index += 1) {
			const id = `res-${index}`;
			const filePath = join(draftRoot, `file-${index}.mp4`);
			await writeFile(filePath, `bytes-${index}`);
			resources.push(createResource({ id, name: `file-${index}.mp4` }));
			paths[id] = filePath;
		}
		let inFlight = 0;
		let peak = 0;
		const { assets } = await resolveImportAssets({
			resources,
			restrictedSourcePathsByResourceId: paths,
			rootRealPath: draftRoot,
			maxConcurrentProbes: 3,
			instrumentation: {
				onProbeStart: () => {
					inFlight += 1;
					peak = Math.max(peak, inFlight);
				},
				onProbeEnd: () => {
					inFlight -= 1;
				},
			},
		});
		expect(peak).toBeLessThanOrEqual(3);
		expect(assets).toHaveLength(12);
		expect(assets.map((asset) => asset.resourceId)).toEqual(
			resources.map((resource) => resource.id)
		);
		for (const asset of assets) {
			expect(asset.status).toBe("resolved");
		}
	});

	it("deduplicates shared file probes and reports hashed bytes", async () => {
		const sharedPath = join(draftRoot, "shared.mp4");
		await writeFile(sharedPath, "shared-bytes");
		const resources = Array.from({ length: 4 }, (_, index) =>
			createResource({ id: `res-${index}`, name: "shared.mp4" })
		);
		const paths = Object.fromEntries(
			resources.map((resource) => [resource.id, sharedPath])
		);

		const result = await resolveImportAssets({
			resources,
			restrictedSourcePathsByResourceId: paths,
			rootRealPath: draftRoot,
		});

		expect(result.assets.every((asset) => asset.status === "resolved")).toBe(
			true
		);
		expect(result.cacheMetrics).toEqual({
			schemaVersion: 1,
			fileProbeHits: 3,
			fileProbeMisses: 1,
			nameSearchHits: 0,
			nameSearchMisses: 0,
			evictions: 0,
			hashedBytes: 12,
		});
	});

	it("deduplicates file hashing across 5000 resource references", async () => {
		const sharedPath = join(draftRoot, "shared.mp4");
		await writeFile(sharedPath, "shared-bytes");
		const resources = Array.from({ length: 5000 }, (_, index) =>
			createResource({ id: `res-${index}`, name: "shared.mp4" })
		);
		const paths = Object.fromEntries(
			resources.map((resource) => [resource.id, sharedPath])
		);

		const result = await resolveImportAssets({
			resources,
			restrictedSourcePathsByResourceId: paths,
			rootRealPath: draftRoot,
			maxConcurrentProbes: 8,
		});

		expect(result.assets).toHaveLength(5000);
		expect(result.assets.every((asset) => asset.status === "resolved")).toBe(
			true
		);
		expect(result.cacheMetrics).toMatchObject({
			fileProbeHits: 4999,
			fileProbeMisses: 1,
			hashedBytes: 12,
		});
	});

	it("deduplicates shared name searches and candidate probes", async () => {
		await mkdir(join(draftRoot, "assets"));
		await writeFile(join(draftRoot, "assets", "shared.wav"), "audio");
		const resources = Array.from({ length: 4 }, (_, index) =>
			createResource({ id: `res-${index}`, name: "shared.wav" })
		);

		const result = await resolveImportAssets({
			resources,
			restrictedSourcePathsByResourceId: {},
			rootRealPath: draftRoot,
		});

		expect(result.assets.every((asset) => asset.status === "resolved")).toBe(
			true
		);
		expect(result.cacheMetrics).toEqual({
			schemaVersion: 1,
			fileProbeHits: 3,
			fileProbeMisses: 1,
			nameSearchHits: 3,
			nameSearchMisses: 1,
			evictions: 0,
			hashedBytes: 5,
		});
	});

	it("bounds cache entries and reports deterministic evictions", async () => {
		const resources: InteropResource[] = [];
		const paths: Record<string, string> = {};
		for (let index = 0; index < 3; index += 1) {
			const id = `res-${index}`;
			const filePath = join(draftRoot, `${id}.mp4`);
			await writeFile(filePath, `bytes-${index}`);
			resources.push(createResource({ id, name: `${id}.mp4` }));
			paths[id] = filePath;
		}

		const result = await resolveImportAssets({
			resources,
			restrictedSourcePathsByResourceId: paths,
			rootRealPath: draftRoot,
			maxCacheEntries: 1,
			maxConcurrentProbes: 1,
		});

		expect(result.cacheMetrics).toMatchObject({
			fileProbeHits: 0,
			fileProbeMisses: 3,
			evictions: 2,
			hashedBytes: 21,
		});
	});

	it("rejects an out-of-range pool size", async () => {
		await expect(
			resolveImportAssets({
				resources: [],
				restrictedSourcePathsByResourceId: {},
				rootRealPath: draftRoot,
				maxConcurrentProbes: 99,
			})
		).rejects.toThrow(/maxConcurrentProbes/);
	});

	it("rejects an out-of-range cache size", async () => {
		await expect(
			resolveImportAssets({
				resources: [],
				restrictedSourcePathsByResourceId: {},
				rootRealPath: draftRoot,
				maxCacheEntries: 0,
			})
		).rejects.toThrow(/cache entries/iu);
	});
});
