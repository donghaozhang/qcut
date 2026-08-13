// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listJianyingResourceDatabasePaths } from "../jianying-resource-database.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying resource databases", () => {
	it("finds the master database and account database candidates", async () => {
		const root = await mkdtemp(joinTemporaryPath());
		temporaryDirectories.push(root);
		await Promise.all([
			mkdir(path.join(root, "account-one")),
			writeFile(path.join(root, "rp_master.db"), ""),
			writeFile(path.join(root, "ignored.db"), ""),
		]);

		await expect(
			listJianyingResourceDatabasePaths({ databaseRoot: root })
		).resolves.toEqual([
			path.join(root, "account-one", "rp.db"),
			path.join(root, "rp_master.db"),
		]);
	});

	it("returns no candidates when the cache root is absent", async () => {
		const root = await mkdtemp(joinTemporaryPath());
		temporaryDirectories.push(root);
		await expect(
			listJianyingResourceDatabasePaths({
				databaseRoot: path.join(root, "missing"),
			})
		).resolves.toEqual([]);
	});
});

function joinTemporaryPath() {
	return path.join(tmpdir(), "qcut-jianying-resource-databases-");
}
