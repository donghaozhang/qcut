import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { jianyingRuntimeDiscoveryTestUtils } from "../jianying-transition/runtime-discovery.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("Jianying transition package discovery", () => {
	it("indexes flat and resource-scoped package layouts", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "qcut-package-index-"));
		temporaryDirectories.push(root);
		const flatHash = "a".repeat(32);
		const scopedHash = "b".repeat(32);
		const flatPath = path.join(root, flatHash);
		const scopedPath = path.join(root, "resource-1", scopedHash);
		await Promise.all([
			mkdir(flatPath, { recursive: true }),
			mkdir(scopedPath, { recursive: true }),
		]);
		await Promise.all([
			writeFile(path.join(flatPath, "config.json"), "{}"),
			writeFile(path.join(scopedPath, "config.json"), "{}"),
		]);

		const index = await jianyingRuntimeDiscoveryTestUtils.indexPackageRoot({
			root,
			targetHashes: new Set([flatHash, scopedHash]),
		});

		expect(index.get(flatHash)).toBe(flatPath);
		expect(index.get(scopedHash)).toBe(scopedPath);
	});
});
