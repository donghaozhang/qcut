import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { withCleanStagingDirectory } from "./cache-private-runtime";

describe("private tracking runtime staging", () => {
	test("removes the staging directory when a build fails", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "qcut-runtime-staging-"));
		const stagingPath = path.join(root, ".staging-test");
		try {
			await expect(
				withCleanStagingDirectory({
					stagingPath,
					build: async () => {
						await writeFile(path.join(stagingPath, "partial"), "partial");
						throw new Error("copy failed");
					},
				})
			).rejects.toThrow("copy failed");
			await expect(access(stagingPath)).rejects.toThrow();
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
