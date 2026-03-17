# Subtask 4: Indexing IPC Handler

## Goal

Orchestrate the full indexing pipeline: receive media item → chunk → embed → store. Expose via IPC for renderer to trigger.

## Files to Create

### `electron/video-search-handler.ts`

Main IPC handler file. Registers all video search channels.

```typescript
// IPC Channels:
"video-search:index-media"      // Index a single media item
"video-search:index-project"    // Index all unindexed media in project
"video-search:index-status"     // Get indexing status for project
"video-search:cancel-indexing"  // Cancel in-progress indexing
"video-search:search"           // Semantic search (see subtask 5)
"video-search:delete-index"     // Remove embeddings for a media item
```

### Indexing Flow

```typescript
async function indexMedia(
  projectDir: string,
  mediaId: string,
  mediaPath: string,
  mediaName: string,
  totalDuration: number,
  onProgress: (progress: IndexProgress) => void
): Promise<IndexResult> {
  // 1. Check if already indexed (same provider)
  const existing = await loadMediaEmbeddings(projectDir, mediaId);
  if (existing && existing.provider === provider.name) {
    return { status: "already-indexed", mediaId };
  }

  // 2. Chunk video
  onProgress({ phase: "chunking", current: 0, total: 1 });
  const chunks = await chunkVideo(mediaPath, totalDuration);

  try {
    // 3. Embed each chunk
    const embeddings: StoredEmbedding[] = [];
    for (let i = 0; i < chunks.length; i++) {
      onProgress({ phase: "embedding", current: i + 1, total: chunks.length });
      const result = await provider.embedVideo(chunks[i].path);
      embeddings.push({
        mediaId, mediaName,
        chunkIndex: i,
        startTime: chunks[i].startTime,
        endTime: chunks[i].endTime,
        vector: result.vector,
        dimensions: result.dimensions,
        provider: provider.name,
        createdAt: Date.now(),
      });
    }

    // 4. Save to disk
    onProgress({ phase: "saving", current: 1, total: 1 });
    await saveEmbeddings(projectDir, {
      version: 1,
      mediaId, mediaName,
      provider: provider.name,
      dimensions: embeddings[0].dimensions,
      chunkDuration: 5,
      totalChunks: chunks.length,
      totalDuration,
      createdAt: Date.now(),
      embeddings,
    });

    return { status: "indexed", mediaId, chunks: chunks.length };
  } finally {
    // 5. Always clean up temp chunks
    await cleanupChunks(chunks);
  }
}
```

### Progress Events

```typescript
export interface IndexProgress {
  phase: "chunking" | "embedding" | "saving";
  current: number;
  total: number;
  mediaId?: string;
  mediaName?: string;
}

// Send progress to renderer via webContents.send()
mainWindow.webContents.send("video-search:index-progress", progress);
```

### Cancellation

```typescript
// Use AbortController pattern
const abortControllers = new Map<string, AbortController>();

// On cancel:
ipcMain.handle("video-search:cancel-indexing", (_, projectId) => {
  abortControllers.get(projectId)?.abort();
});

// In indexing loop: check signal before each chunk
if (signal.aborted) {
  await cleanupChunks(chunks);
  return { status: "cancelled" };
}
```

## Files to Reference

| File | Why |
|------|-----|
| `electron/ffmpeg-handler.ts` | IPC handler registration pattern |
| `electron/gemini-transcribe-handler.ts` | Gemini API call + progress pattern |
| `electron/claude/handlers/claude-media-handler.ts` | Project dir resolution, media file access |
| `electron/native-pipeline/infra/stream-emitter.ts` | Progress event emission pattern |

## Implementation Notes

- **Project dir resolution**: Use same pattern as `claude-media-handler.ts` — resolve from `app.getPath("documents")` + project ID
- **Media path**: Get absolute path from media store or project media dir. Media files live in `projectDir/media/imported/`
- **Sequential processing**: Embed chunks one at a time to respect API rate limits
- **Error recovery**: If indexing fails mid-way, clean up chunks but don't save partial embeddings. User can retry.
- **Re-indexing**: If provider changed, delete old embeddings and re-index

## Tests

| Test | File |
|------|------|
| Full indexing pipeline (mocked provider) | `tests/unit/video-search/indexing-handler.test.ts` |
| Cancellation stops processing | Same file |
| Already-indexed skips re-processing | Same file |
| Cleanup runs even on error | Same file |
| Progress events fire correctly | Same file |
