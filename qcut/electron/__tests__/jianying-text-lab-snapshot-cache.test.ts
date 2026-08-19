// @vitest-environment node
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
	computeJianyingTextLabFingerprint,
	JIANYING_TEXT_LAB_SNAPSHOT_SCHEMA_VERSION,
	readJianyingTextLabSnapshot,
	writeJianyingTextLabSnapshot,
	type JianyingTextLabSnapshot,
} from "../jianying-text-lab-snapshot-cache.js";

const RESOURCE_ID = "7405879107424111910";
const PACKAGE_HASH = "a".repeat(32);

function createSnapshot({
	fingerprint,
}: {
	fingerprint: string;
}): JianyingTextLabSnapshot {
	return {
		schemaVersion: JIANYING_TEXT_LAB_SNAPSHOT_SCHEMA_VERSION,
		fingerprint,
		styles: {
			catalog: { entries: [], packageCount: 0, invalidPackageCount: 0 },
			metadataEntries: [],
			ownershipEntries: [],
		},
		animations: {
			count: 0,
			animations: [],
			catalogCount: 0,
			packageCount: 0,
			missingPackageCount: 0,
			invalidPackageCount: 0,
		},
	};
}

describe("computeJianyingTextLabFingerprint", () => {
	let styleRoot = "";
	let animationPackageRoot = "";

	beforeEach(async () => {
		const workspace = await mkdtemp(join(tmpdir(), "text-lab-snapshot-"));
		styleRoot = join(workspace, "artistEffect");
		animationPackageRoot = join(workspace, "effect");
		await mkdir(join(styleRoot, RESOURCE_ID, PACKAGE_HASH), {
			recursive: true,
		});
		await mkdir(join(animationPackageRoot, RESOURCE_ID, PACKAGE_HASH), {
			recursive: true,
		});
	});

	it("is stable while the package directories are unchanged", async () => {
		const first = await computeJianyingTextLabFingerprint({
			styleRoot,
			animationPackageRoot,
		});
		const second = await computeJianyingTextLabFingerprint({
			styleRoot,
			animationPackageRoot,
		});
		expect(first).toBe(second);
	});

	it("changes when a package directory appears", async () => {
		const before = await computeJianyingTextLabFingerprint({
			styleRoot,
			animationPackageRoot,
		});
		await mkdir(join(styleRoot, RESOURCE_ID, "b".repeat(32)), {
			recursive: true,
		});
		const after = await computeJianyingTextLabFingerprint({
			styleRoot,
			animationPackageRoot,
		});
		expect(after).not.toBe(before);
	});

	it("ignores directories that are not content-addressed packages", async () => {
		const before = await computeJianyingTextLabFingerprint({
			styleRoot,
			animationPackageRoot,
		});
		await mkdir(join(styleRoot, "not-a-resource", "not-a-hash"), {
			recursive: true,
		});
		const after = await computeJianyingTextLabFingerprint({
			styleRoot,
			animationPackageRoot,
		});
		expect(after).toBe(before);
	});
});

describe("snapshot read/write", () => {
	let cacheFilePath = "";

	beforeEach(async () => {
		const workspace = await mkdtemp(join(tmpdir(), "text-lab-snapshot-"));
		cacheFilePath = join(workspace, "nested", "snapshot.json");
	});

	it("round-trips a snapshot with a matching fingerprint", async () => {
		const snapshot = createSnapshot({ fingerprint: "print-1" });
		await writeJianyingTextLabSnapshot({ cacheFilePath, snapshot });
		const restored = await readJianyingTextLabSnapshot({
			cacheFilePath,
			fingerprint: "print-1",
		});
		expect(restored).toEqual(snapshot);
	});

	it("rejects a snapshot whose fingerprint no longer matches", async () => {
		await writeJianyingTextLabSnapshot({
			cacheFilePath,
			snapshot: createSnapshot({ fingerprint: "print-1" }),
		});
		const restored = await readJianyingTextLabSnapshot({
			cacheFilePath,
			fingerprint: "print-2",
		});
		expect(restored).toBeNull();
	});

	it("rejects corrupt or missing snapshot files", async () => {
		expect(
			await readJianyingTextLabSnapshot({ cacheFilePath, fingerprint: "any" })
		).toBeNull();
		await mkdir(join(cacheFilePath, ".."), { recursive: true });
		await writeFile(cacheFilePath, "{ not json", "utf8");
		expect(
			await readJianyingTextLabSnapshot({ cacheFilePath, fingerprint: "any" })
		).toBeNull();
	});

	it("rejects a snapshot from a different schema version", async () => {
		const snapshot = createSnapshot({ fingerprint: "print-1" });
		await writeJianyingTextLabSnapshot({ cacheFilePath, snapshot });
		const raw = JSON.parse(await readFile(cacheFilePath, "utf8"));
		raw.schemaVersion = 999;
		await writeFile(cacheFilePath, JSON.stringify(raw), "utf8");
		expect(
			await readJianyingTextLabSnapshot({
				cacheFilePath,
				fingerprint: "print-1",
			})
		).toBeNull();
	});
});
