import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverVideoFiles } from "../media-process.js";

describe("editorial media discovery", () => {
	it("recurses through video files while ignoring macOS AppleDouble metadata", async () => {
		const root = await fs.mkdtemp(resolve(tmpdir(), "qcut-media-discovery-"));
		const nested = resolve(root, "nested");
		await fs.mkdir(nested);
		await Promise.all([
			fs.writeFile(resolve(root, "visible.mp4"), ""),
			fs.writeFile(resolve(root, "._visible.mp4"), ""),
			fs.writeFile(resolve(root, ".hidden.mov"), ""),
			fs.writeFile(resolve(root, "notes.txt"), ""),
			fs.writeFile(resolve(nested, "second.mov"), ""),
		]);

		try {
			const recursive = await discoverVideoFiles({
				directory: root,
				recursive: true,
			});
			const direct = await discoverVideoFiles({
				directory: root,
				recursive: false,
			});

			expect(recursive.map((path) => path.replace(`${root}/`, ""))).toEqual([
				"nested/second.mov",
				"visible.mp4",
			]);
			expect(direct.map((path) => path.replace(`${root}/`, ""))).toEqual([
				"visible.mp4",
			]);
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
