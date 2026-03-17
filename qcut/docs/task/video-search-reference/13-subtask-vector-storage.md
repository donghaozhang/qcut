# Subtask 3: Vector Storage Layer

## Goal

Store and retrieve embedding vectors per project. Simple JSON files — no external DB dependency for a desktop app.

## Files to Create

### `electron/video-search/vector-storage.ts`

```typescript
export interface StoredEmbedding {
  mediaId: string;
  mediaName: string;
  chunkIndex: number;
  startTime: number;    // Seconds
  endTime: number;      // Seconds
  vector: number[];     // 768-dim float array
  dimensions: number;
  provider: string;     // "gemini-embedding-2", "imagebind", etc.
  createdAt: number;    // Unix timestamp ms
}

export interface MediaEmbeddingFile {
  version: 1;
  mediaId: string;
  mediaName: string;
  provider: string;
  dimensions: number;
  chunkDuration: number;
  totalChunks: number;
  totalDuration: number;
  createdAt: number;
  embeddings: StoredEmbedding[];
}

/**
 * Save embeddings for a media item.
 * Writes to: projectDir/embeddings/{mediaId}.embeddings.json
 */
export async function saveEmbeddings(
  projectDir: string,
  data: MediaEmbeddingFile
): Promise<void>;

/**
 * Load embeddings for a single media item.
 */
export async function loadMediaEmbeddings(
  projectDir: string,
  mediaId: string
): Promise<MediaEmbeddingFile | null>;

/**
 * Load ALL embeddings for a project (for search).
 * Returns flat array of StoredEmbedding from all media files.
 */
export async function loadAllEmbeddings(
  projectDir: string
): Promise<StoredEmbedding[]>;

/**
 * Delete embeddings for a media item.
 */
export async function deleteEmbeddings(
  projectDir: string,
  mediaId: string
): Promise<void>;

/**
 * List which media items have been indexed.
 */
export async function listIndexedMedia(
  projectDir: string
): Promise<string[]>;  // mediaId[]
```

## Storage Format

```
~/Documents/QCut/Projects/{projectId}/
└── embeddings/
    ├── {mediaId-1}.embeddings.json
    ├── {mediaId-2}.embeddings.json
    └── ...
```

Each file:
```json
{
  "version": 1,
  "mediaId": "abc123",
  "mediaName": "interview.mp4",
  "provider": "gemini-embedding-2",
  "dimensions": 768,
  "chunkDuration": 5,
  "totalChunks": 24,
  "totalDuration": 120,
  "createdAt": 1710600000000,
  "embeddings": [
    {
      "mediaId": "abc123",
      "mediaName": "interview.mp4",
      "chunkIndex": 0,
      "startTime": 0,
      "endTime": 5,
      "vector": [0.0123, -0.0456, ...],
      "dimensions": 768,
      "provider": "gemini-embedding-2",
      "createdAt": 1710600000000
    }
  ]
}
```

## Files to Reference

| File | Why |
|------|-----|
| `electron/claude/http/claude-http-search-routes.ts` | Pattern for project-scoped file storage (transcriptions) |
| `apps/web/src/lib/storage/storage-service.ts` | Storage adapter pattern |
| `electron/claude/handlers/claude-media-handler.ts` | Project directory resolution |

## Implementation Notes

- **Why JSON, not SQLite?**: Simpler, no native dependency, project-portable (copy folder = copy project). For typical projects (<50 media items, <1000 chunks), JSON is fast enough.
- **Loading strategy**: `loadAllEmbeddings()` reads all files in `embeddings/` dir. Cache in memory for duration of search session. Invalidate on new indexing.
- **File size**: 768 floats × 8 bytes × ~24 chunks per 2-min video ≈ 150KB per media item. Manageable.
- **Version field**: For future migration if storage format changes.
- **Provider tracking**: If user switches providers, old embeddings are incompatible. Detect and prompt re-index.
- **Atomic writes**: Write to `.tmp` then rename, to avoid corrupt files on crash.

## Tests

| Test | File |
|------|------|
| Save and load round-trip | `tests/unit/video-search/vector-storage.test.ts` |
| loadAllEmbeddings aggregates across media | Same file |
| listIndexedMedia returns correct IDs | Same file |
| deleteEmbeddings removes file | Same file |
| Missing embeddings dir returns empty | Same file |
| Provider mismatch detection | Same file |
