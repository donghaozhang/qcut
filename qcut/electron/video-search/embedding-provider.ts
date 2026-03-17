/**
 * Embedding provider abstraction for video semantic search.
 * Allows swapping between Gemini, ImageBind, Cosmos, etc.
 */

export interface EmbeddingResult {
	vector: number[];
	dimensions: number;
}

export interface EmbeddingProvider {
	/** Provider identifier (e.g. "gemini-embedding-2") */
	name: string;

	/** Embed a text query (for search) */
	embedText(text: string): Promise<EmbeddingResult>;

	/** Embed a video chunk file (for indexing) */
	embedVideo(videoPath: string): Promise<EmbeddingResult>;

	/** Check if provider is available (API key exists, etc.) */
	isAvailable(): Promise<boolean>;
}
