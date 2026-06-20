import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectCandidates } from "../image-collector.js";

function makeDir({ files }: { files: string[] }): string {
	const dir = mkdtempSync(path.join(os.tmpdir(), "qcut-collector-"));
	for (const name of files) {
		writeFileSync(path.join(dir, name), "x");
	}
	return dir;
}

describe("collectCandidates", () => {
	it("preserves --image order and assigns contiguous indexes", () => {
		const result = collectCandidates({
			images: ["a.png", "b.jpg", "c.webp"],
		});
		expect(result).toEqual([
			{ index: 0, path: "a.png" },
			{ index: 1, path: "b.jpg" },
			{ index: 2, path: "c.webp" },
		]);
	});

	it("sorts directory entries and filters by extension", () => {
		const dir = makeDir({
			files: ["b.png", "a.png", "notes.txt", "c.JPG"],
		});
		const result = collectCandidates({ dir });
		expect(result.map((candidate) => path.basename(candidate.path))).toEqual([
			"a.png",
			"b.png",
			"c.JPG",
		]);
	});

	it("dedupes repeated paths and re-indexes", () => {
		const result = collectCandidates({
			images: ["a.png", "a.png", "b.png"],
		});
		expect(result).toEqual([
			{ index: 0, path: "a.png" },
			{ index: 1, path: "b.png" },
		]);
	});

	it("passes through remote URLs and drops non-image local paths", () => {
		const result = collectCandidates({
			images: ["https://example.com/x", "skip.txt", "keep.png"],
		});
		expect(result.map((candidate) => candidate.path)).toEqual([
			"https://example.com/x",
			"keep.png",
		]);
	});

	it("throws when no candidate images are found", () => {
		expect(() => collectCandidates({ images: ["notes.txt"] })).toThrow(
			"No candidate images found"
		);
	});
});
