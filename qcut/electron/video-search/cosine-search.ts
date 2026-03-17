/**
 * KNN cosine similarity search over stored embeddings.
 * Adapted from NVIDIA VSS embed_search.py pattern.
 */

import type { StoredEmbedding } from "./vector-storage.js";

export interface SearchResult {
	mediaId: string;
	mediaName: string;
	chunkIndex: number;
	startTime: number;
	endTime: number;
	score: number;
}

export interface SearchOptions {
	topK?: number;
	minScore?: number;
	mediaFilter?: string[];
}

/** Cosine similarity between two vectors. Returns value in [-1, 1]. */
export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}

	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	if (denom === 0) return 0;
	return dot / denom;
}

/** KNN search: query vector vs all stored embeddings. */
export function searchEmbeddings(
	queryVector: number[],
	embeddings: StoredEmbedding[],
	options?: SearchOptions
): SearchResult[] {
	const topK = options?.topK ?? 20;
	const minScore = options?.minScore ?? 0.1;
	const mediaFilter = options?.mediaFilter;

	const results: SearchResult[] = [];

	for (const emb of embeddings) {
		if (mediaFilter && !mediaFilter.includes(emb.mediaId)) continue;

		const score = cosineSimilarity(queryVector, emb.vector);
		if (score < minScore) continue;

		results.push({
			mediaId: emb.mediaId,
			mediaName: emb.mediaName,
			chunkIndex: emb.chunkIndex,
			startTime: emb.startTime,
			endTime: emb.endTime,
			score,
		});
	}

	results.sort((a, b) => b.score - a.score);
	return results.slice(0, topK);
}
