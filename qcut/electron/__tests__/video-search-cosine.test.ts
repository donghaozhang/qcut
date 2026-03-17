/**
 * Tests for cosine similarity search.
 *
 * Pure math — no mocks needed.
 */

import { describe, it, expect } from "vitest";
import {
	cosineSimilarity,
	searchEmbeddings,
} from "../video-search/cosine-search";
import type { StoredEmbedding } from "../video-search/vector-storage";

function makeEmbedding(
	mediaId: string,
	chunkIndex: number,
	vector: number[],
	startTime = chunkIndex * 5,
): StoredEmbedding {
	return {
		mediaId,
		mediaName: `${mediaId}.mp4`,
		chunkIndex,
		startTime,
		endTime: startTime + 5,
		vector,
		dimensions: vector.length,
		provider: "test",
		createdAt: Date.now(),
	};
}

describe("cosineSimilarity", () => {
	it("returns 1 for identical vectors", () => {
		const v = [1, 2, 3];
		expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
	});

	it("returns 0 for orthogonal vectors", () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
	});

	it("returns -1 for opposite vectors", () => {
		expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
	});

	it("handles zero vectors gracefully", () => {
		expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
	});

	it("is symmetric", () => {
		const a = [1, 2, 3];
		const b = [4, 5, 6];
		expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
	});

	it("works with high-dimensional vectors", () => {
		const dim = 768;
		const a = Array.from({ length: dim }, (_, i) => Math.sin(i));
		const b = Array.from({ length: dim }, (_, i) => Math.cos(i));
		const score = cosineSimilarity(a, b);
		expect(score).toBeGreaterThan(-1);
		expect(score).toBeLessThan(1);
	});
});

describe("searchEmbeddings", () => {
	const embeddings = [
		makeEmbedding("video-a", 0, [1, 0, 0]),
		makeEmbedding("video-a", 1, [0, 1, 0]),
		makeEmbedding("video-b", 0, [0.9, 0.1, 0]),
		makeEmbedding("video-b", 1, [0, 0, 1]),
	];

	it("returns results sorted by score descending", () => {
		const results = searchEmbeddings([1, 0, 0], embeddings);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].mediaId).toBe("video-a");
		expect(results[0].chunkIndex).toBe(0);
		expect(results[0].score).toBeCloseTo(1.0);

		for (let i = 1; i < results.length; i++) {
			expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
		}
	});

	it("respects topK limit", () => {
		const results = searchEmbeddings([1, 0, 0], embeddings, { topK: 2 });
		expect(results).toHaveLength(2);
	});

	it("filters by minScore", () => {
		const results = searchEmbeddings([1, 0, 0], embeddings, { minScore: 0.5 });
		for (const r of results) {
			expect(r.score).toBeGreaterThanOrEqual(0.5);
		}
	});

	it("filters by mediaFilter", () => {
		const results = searchEmbeddings([1, 0, 0], embeddings, {
			mediaFilter: ["video-b"],
		});
		for (const r of results) {
			expect(r.mediaId).toBe("video-b");
		}
	});

	it("returns empty for no embeddings", () => {
		expect(searchEmbeddings([1, 0, 0], [])).toEqual([]);
	});

	it("does not include vector in results", () => {
		const results = searchEmbeddings([1, 0, 0], embeddings);
		for (const r of results) {
			expect(r).not.toHaveProperty("vector");
		}
	});

	it("includes correct time ranges", () => {
		const results = searchEmbeddings([1, 0, 0], embeddings, { topK: 1 });
		expect(results[0].startTime).toBe(0);
		expect(results[0].endTime).toBe(5);
	});
});
