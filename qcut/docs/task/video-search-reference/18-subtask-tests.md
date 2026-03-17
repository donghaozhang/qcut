# Subtask 8: Tests

## Goal

Unit tests for all new modules. Follow existing Vitest + @testing-library/react patterns.

## Test File Map

| Module | Test File | Type |
|--------|-----------|------|
| Cosine similarity + KNN search | `tests/unit/video-search/cosine-search.test.ts` | Unit |
| Vector storage (save/load/delete) | `tests/unit/video-search/vector-storage.test.ts` | Unit |
| Video chunker (timestamp math) | `tests/unit/video-search/video-chunker.test.ts` | Unit |
| Provider config | `tests/unit/video-search/provider-config.test.ts` | Unit |
| Embedding provider interface | `tests/unit/video-search/embedding-provider.test.ts` | Unit |
| Video search store (Zustand) | `tests/unit/video-search/video-search-store.test.ts` | Unit |
| SemanticSearchPanel component | `tests/unit/components/SemanticSearchPanel.test.tsx` | Component |
| E2E: index + search flow | `tests/e2e/video-search.spec.ts` | E2E |

## Priority Tests (implement first)

### 1. `cosine-search.test.ts` — Pure math, no mocks needed

```typescript
import { describe, it, expect } from "vitest";
import { cosineSimilarity, searchEmbeddings } from "../../../electron/video-search/cosine-search";

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
});

describe("searchEmbeddings", () => {
  const embeddings = [
    { mediaId: "a", chunkIndex: 0, startTime: 0, endTime: 5, vector: [1, 0, 0], /* ... */ },
    { mediaId: "a", chunkIndex: 1, startTime: 5, endTime: 10, vector: [0, 1, 0], /* ... */ },
    { mediaId: "b", chunkIndex: 0, startTime: 0, endTime: 5, vector: [0.9, 0.1, 0], /* ... */ },
  ];

  it("returns results sorted by score descending", () => {
    const results = searchEmbeddings([1, 0, 0], embeddings);
    expect(results[0].mediaId).toBe("a");
    expect(results[0].chunkIndex).toBe(0);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("respects topK limit", () => {
    const results = searchEmbeddings([1, 0, 0], embeddings, { topK: 1 });
    expect(results).toHaveLength(1);
  });

  it("filters by minScore", () => {
    const results = searchEmbeddings([1, 0, 0], embeddings, { minScore: 0.5 });
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("filters by mediaFilter", () => {
    const results = searchEmbeddings([1, 0, 0], embeddings, { mediaFilter: ["b"] });
    for (const r of results) {
      expect(r.mediaId).toBe("b");
    }
  });

  it("returns empty for no embeddings", () => {
    expect(searchEmbeddings([1, 0, 0], [])).toEqual([]);
  });

  it("strips vectors from results", () => {
    const results = searchEmbeddings([1, 0, 0], embeddings);
    for (const r of results) {
      expect(r).not.toHaveProperty("vector");
    }
  });
});
```

### 2. `vector-storage.test.ts` — File I/O with temp dirs

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { saveEmbeddings, loadMediaEmbeddings, loadAllEmbeddings, listIndexedMedia, deleteEmbeddings } from "...";

describe("vector-storage", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "qcut-test-"));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("save and load round-trip", async () => {
    const data = makeTestEmbeddingFile("media-1");
    await saveEmbeddings(projectDir, data);
    const loaded = await loadMediaEmbeddings(projectDir, "media-1");
    expect(loaded).toEqual(data);
  });

  it("loadAllEmbeddings aggregates across media", async () => {
    await saveEmbeddings(projectDir, makeTestEmbeddingFile("media-1", 3));
    await saveEmbeddings(projectDir, makeTestEmbeddingFile("media-2", 5));
    const all = await loadAllEmbeddings(projectDir);
    expect(all).toHaveLength(8);
  });

  it("listIndexedMedia returns correct IDs", async () => {
    await saveEmbeddings(projectDir, makeTestEmbeddingFile("media-1"));
    await saveEmbeddings(projectDir, makeTestEmbeddingFile("media-2"));
    const ids = await listIndexedMedia(projectDir);
    expect(ids.sort()).toEqual(["media-1", "media-2"]);
  });

  it("deleteEmbeddings removes file", async () => {
    await saveEmbeddings(projectDir, makeTestEmbeddingFile("media-1"));
    await deleteEmbeddings(projectDir, "media-1");
    const loaded = await loadMediaEmbeddings(projectDir, "media-1");
    expect(loaded).toBeNull();
  });

  it("returns null/empty for missing data", async () => {
    expect(await loadMediaEmbeddings(projectDir, "nope")).toBeNull();
    expect(await loadAllEmbeddings(projectDir)).toEqual([]);
    expect(await listIndexedMedia(projectDir)).toEqual([]);
  });
});
```

### 3. `video-chunker.test.ts` — Timestamp math (mock FFmpeg)

```typescript
describe("chunk timestamp calculation", () => {
  it("15s video → 3 chunks with correct boundaries", () => {
    const chunks = calculateChunkBoundaries(15, 5);
    expect(chunks).toEqual([
      { index: 0, startTime: 0, endTime: 5, duration: 5 },
      { index: 1, startTime: 5, endTime: 10, duration: 5 },
      { index: 2, startTime: 10, endTime: 15, duration: 5 },
    ]);
  });

  it("7s video → 2 chunks, last one shorter", () => {
    const chunks = calculateChunkBoundaries(7, 5);
    expect(chunks).toEqual([
      { index: 0, startTime: 0, endTime: 5, duration: 5 },
      { index: 1, startTime: 5, endTime: 7, duration: 2 },
    ]);
  });

  it("3s video → 1 chunk", () => {
    const chunks = calculateChunkBoundaries(3, 5);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].duration).toBe(3);
  });
});
```

## E2E Test (Future)

### `tests/e2e/video-search.spec.ts`

```typescript
// Requires: test video file, Gemini API key in env
test("index video and search returns results", async ({ page }) => {
  // 1. Open test project with a video
  // 2. Navigate to Search panel → Visual tab
  // 3. Click "Index All"
  // 4. Wait for indexing to complete (progress bar)
  // 5. Type search query
  // 6. Verify results appear with thumbnails
  // 7. Click result → verify playback seeks to correct time
});
```

## Running Tests

```bash
# All video search tests
bun run test -- --grep "video-search"

# Specific file
bun run test tests/unit/video-search/cosine-search.test.ts

# E2E (requires electron + API key)
bun run test:e2e tests/e2e/video-search.spec.ts
```

## Files to Reference

| File | Why |
|------|-----|
| `apps/web/src/__tests__/` | Existing test patterns |
| `tests/e2e/` | E2E test patterns |
| `docs/reference/testing-guide.md` | Project testing conventions |
