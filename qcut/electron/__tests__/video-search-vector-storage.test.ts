/**
 * Tests for vector storage (save/load/delete).
 *
 * Uses temp directories for isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
	saveEmbeddings,
	loadMediaEmbeddings,
	loadAllEmbeddings,
	listIndexedMedia,
	deleteEmbeddings,
	type MediaEmbeddingFile,
} from "../video-search/vector-storage";

function makeTestFile(mediaId: string, numChunks = 3): MediaEmbeddingFile {
	return {
		version: 1,
		mediaId,
		mediaName: `${mediaId}.mp4`,
		provider: "test-provider",
		dimensions: 3,
		chunkDuration: 5,
		totalChunks: numChunks,
		totalDuration: numChunks * 5,
		createdAt: Date.now(),
		embeddings: Array.from({ length: numChunks }, (_, i) => ({
			mediaId,
			mediaName: `${mediaId}.mp4`,
			chunkIndex: i,
			startTime: i * 5,
			endTime: (i + 1) * 5,
			vector: [i * 0.1, i * 0.2, i * 0.3],
			dimensions: 3,
			provider: "test-provider",
			createdAt: Date.now(),
		})),
	};
}

describe("vector-storage", () => {
	let projectDir: string;

	beforeEach(() => {
		projectDir = mkdtempSync(join(tmpdir(), "qcut-vs-test-"));
	});

	afterEach(() => {
		rmSync(projectDir, { recursive: true, force: true });
	});

	it("save and load round-trip", async () => {
		const data = makeTestFile("media-1");
		await saveEmbeddings(projectDir, data);
		const loaded = await loadMediaEmbeddings(projectDir, "media-1");
		expect(loaded).not.toBeNull();
		expect(loaded!.mediaId).toBe("media-1");
		expect(loaded!.embeddings).toHaveLength(3);
		expect(loaded!.embeddings[0].vector).toEqual([0, 0, 0]);
	});

	it("loadAllEmbeddings aggregates across media", async () => {
		await saveEmbeddings(projectDir, makeTestFile("media-1", 3));
		await saveEmbeddings(projectDir, makeTestFile("media-2", 5));
		const all = await loadAllEmbeddings(projectDir);
		expect(all).toHaveLength(8);
	});

	it("listIndexedMedia returns correct IDs", async () => {
		await saveEmbeddings(projectDir, makeTestFile("media-1"));
		await saveEmbeddings(projectDir, makeTestFile("media-2"));
		const ids = await listIndexedMedia(projectDir);
		expect(ids.sort()).toEqual(["media-1", "media-2"]);
	});

	it("deleteEmbeddings removes file", async () => {
		await saveEmbeddings(projectDir, makeTestFile("media-1"));
		await deleteEmbeddings(projectDir, "media-1");
		const loaded = await loadMediaEmbeddings(projectDir, "media-1");
		expect(loaded).toBeNull();
	});

	it("returns null/empty for missing data", async () => {
		expect(await loadMediaEmbeddings(projectDir, "nope")).toBeNull();
		expect(await loadAllEmbeddings(projectDir)).toEqual([]);
		expect(await listIndexedMedia(projectDir)).toEqual([]);
	});

	it("overwrites existing embeddings on re-save", async () => {
		await saveEmbeddings(projectDir, makeTestFile("media-1", 3));
		await saveEmbeddings(projectDir, makeTestFile("media-1", 10));
		const loaded = await loadMediaEmbeddings(projectDir, "media-1");
		expect(loaded!.totalChunks).toBe(10);
		expect(loaded!.embeddings).toHaveLength(10);
	});
});
