# Subtask 5: Search IPC Handler

## Status

**COMPLETED** — Implemented in `electron/video-search/cosine-search.ts` with `cosineSimilarity()` and `searchEmbeddings()` functions supporting `topK`, `minScore`, and `mediaFilter` options. Search IPC channel integrated into `electron/video-search-handler.ts`. 13 tests passing in `electron/__tests__/video-search-cosine.test.ts`. The implementation matches the plan closely. Deviation: test file location is `electron/__tests__/` rather than `tests/unit/video-search/`.

## Goal

Handle semantic search queries: embed the query text, cosine-compare against stored vectors, return ranked results with thumbnails.

## Files to Create

### `electron/video-search/cosine-search.ts`

```typescript
export interface SearchResult {
  mediaId: string;
  mediaName: string;
  chunkIndex: number;
  startTime: number;
  endTime: number;
  score: number;         // Cosine similarity [-1, 1]
  thumbnailPath?: string; // Generated on-demand
}

export interface SearchOptions {
  topK?: number;          // Default: 20
  minScore?: number;      // Default: 0.1 (filter noise)
  mediaFilter?: string[]; // Limit to specific media IDs
}

/**
 * Cosine similarity between two vectors.
 * From NVIDIA VSS: score normalization pattern.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * KNN search: query vector vs all stored embeddings.
 */
export function searchEmbeddings(
  queryVector: number[],
  embeddings: StoredEmbedding[],
  options?: SearchOptions
): SearchResult[] {
  const topK = options?.topK ?? 20;
  const minScore = options?.minScore ?? 0.1;

  const scored = embeddings
    .map(emb => ({
      ...emb,
      score: cosineSimilarity(queryVector, emb.vector),
    }))
    .filter(r => r.score >= minScore);

  // Optional: filter by media
  const filtered = options?.mediaFilter
    ? scored.filter(r => options.mediaFilter!.includes(r.mediaId))
    : scored;

  // Sort descending by score, take top K
  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ vector, ...rest }) => rest); // Strip vectors from results
}
```

### Search IPC (in `electron/video-search-handler.ts`)

```typescript
ipcMain.handle("video-search:search", async (_, projectId, query, options) => {
  const projectDir = resolveProjectDir(projectId);
  const provider = getEmbeddingProvider();

  // 1. Embed query text
  const queryResult = await provider.embedText(query);

  // 2. Load all project embeddings (cached in memory)
  const embeddings = await loadAllEmbeddings(projectDir);
  if (embeddings.length === 0) {
    return { results: [], message: "No media indexed yet" };
  }

  // 3. KNN cosine search
  const results = searchEmbeddings(queryResult.vector, embeddings, options);

  // 4. Generate thumbnails for top results
  for (const result of results) {
    const midpoint = (result.startTime + result.endTime) / 2;
    result.thumbnailPath = await generateSearchThumbnail(
      projectDir, result.mediaId, midpoint
    );
  }

  return { results };
});
```

### Thumbnail Generation

```typescript
/**
 * Generate a thumbnail at a specific timestamp for search results.
 * Reuses FFmpeg frame extraction already in codebase.
 * Caches to: projectDir/cache/search-thumbs/{mediaId}_{time}.jpg
 */
async function generateSearchThumbnail(
  projectDir: string,
  mediaId: string,
  timeSeconds: number
): Promise<string> {
  const cachePath = path.join(
    projectDir, "cache", "search-thumbs",
    `${mediaId}_${Math.floor(timeSeconds)}.jpg`
  );

  // Return cached if exists
  if (existsSync(cachePath)) return cachePath;

  // Find media file path
  const mediaPath = await resolveMediaPath(projectDir, mediaId);

  // FFmpeg single frame extraction (320x180)
  await extractFrame(mediaPath, timeSeconds, cachePath, { width: 320, height: 180 });

  return cachePath;
}
```

## Files to Reference

| File | Why |
|------|-----|
| `electron/video-search/vector-storage.ts` | `loadAllEmbeddings()` |
| `electron/ffmpeg-basic-handlers.ts` | Frame extraction patterns |
| `electron/claude/http/claude-http-search-routes.ts` | Existing search handler pattern |
| `source-files/embed_search.py` | NVIDIA VSS score normalization reference |
| `source-files/search.py` | NVIDIA VSS fusion reranking (future Phase 3) |

## Implementation Notes

- **Embedding cache**: Cache `loadAllEmbeddings()` result in memory. Invalidate when new media is indexed. For a project with 50 media × 24 chunks = 1200 embeddings × 768 dims = ~3.7MB in memory. Fine.
- **Thumbnail cache**: Store in `projectDir/cache/search-thumbs/`. Survives across sessions. Clean up when embeddings are deleted.
- **Performance**: Pure cosine similarity over 1200 embeddings is <1ms. No need for approximate KNN or vector DB.
- **Future: Fusion search**: When transcription search exists alongside semantic search, combine scores using weighted linear fusion from NVIDIA VSS (see `source-files/search.py`):
  ```
  final_score = 0.55 * semantic_score + 0.45 * transcript_score
  ```

## Tests

| Test | File |
|------|------|
| cosineSimilarity correctness | `tests/unit/video-search/cosine-search.test.ts` |
| searchEmbeddings returns top K sorted | Same file |
| minScore filters low-quality results | Same file |
| mediaFilter limits scope | Same file |
| Empty embeddings returns empty | Same file |
