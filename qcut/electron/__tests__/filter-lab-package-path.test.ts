// @vitest-environment node
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { selectJianyingFilterCacheRoot } from "../native-pipeline/filters/filter-lab-package-path.js";

describe("filter lab package path selection", () => {
	it("selects the first root that contains the complete package", async () => {
		const workspace = await mkdtemp(join(tmpdir(), "qcut-filter-roots-"));
		const primaryRoot = join(workspace, "primary");
		const managedRoot = join(workspace, "managed");
		const identity = {
			container: "artistEffect" as const,
			packageIdentifier: "filter-id",
			version: "v1",
		};
		try {
			await mkdir(
				join(
					managedRoot,
					identity.container,
					identity.packageIdentifier,
					identity.version
				),
				{ recursive: true }
			);

			expect(
				selectJianyingFilterCacheRoot({
					cacheRoots: [primaryRoot, managedRoot],
					identity,
				})
			).toBe(managedRoot);
		} finally {
			await rm(workspace, { recursive: true, force: true });
		}
	});

	it("rejects unsafe package identities", () => {
		expect(() =>
			selectJianyingFilterCacheRoot({
				cacheRoots: ["/cache"],
				identity: {
					container: "artistEffect",
					packageIdentifier: "../escape",
					version: "v1",
				},
			})
		).toThrow("Invalid local filter package identity");
	});
});
