# Subtask 1: Embedding Provider Abstraction + Gemini Implementation

## Goal

Create a provider interface so QCut can swap embedding backends. Implement Gemini Embedding 2 as the default.

## Files to Create

### `electron/video-search/embedding-provider.ts`
```typescript
export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
}

export interface EmbeddingProvider {
  name: string;

  /** Embed a text query (for search) */
  embedText(text: string): Promise<EmbeddingResult>;

  /** Embed a video chunk file (for indexing) */
  embedVideo(videoPath: string): Promise<EmbeddingResult>;

  /** Check if provider is available (API key exists, GPU present, etc.) */
  isAvailable(): Promise<boolean>;
}
```

### `electron/video-search/gemini-embedding-provider.ts`

```typescript
import type { EmbeddingProvider, EmbeddingResult } from "./embedding-provider";

const DIMENSIONS = 768; // Gemini supports 128–3072, 768 is good balance
const MODEL = "gemini-embedding-2-preview";

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  name = "gemini-embedding-2";

  async embedText(text: string): Promise<EmbeddingResult> {
    // Use @google/genai client (already a dependency)
    // client.models.embed_content({ model: MODEL, contents: [text], outputDimensionality: DIMENSIONS })
  }

  async embedVideo(videoPath: string): Promise<EmbeddingResult> {
    // 1. Upload video chunk via client.files.upload({ file: videoPath })
    // 2. Embed: client.models.embed_content({ model: MODEL, contents: [fileRef], outputDimensionality: DIMENSIONS })
    // 3. Return { vector, dimensions: DIMENSIONS }
  }

  async isAvailable(): Promise<boolean> {
    // Check GEMINI_API_KEY exists via getDecryptedApiKeys()
  }
}
```

## Files to Reference

| File | Why |
|------|-----|
| `electron/gemini-transcribe-handler.ts` | Existing Gemini API usage pattern, key management |
| `electron/api-key-handler.ts` | `getDecryptedApiKeys()` for secure key access |
| `electron/native-pipeline/infra/api-caller.ts` | Provider abstraction pattern used in native pipeline |

## Implementation Notes

- **Gemini Embedding 2 limits**: 128s video per request. Our 5s chunks are well within this.
- **API key**: Reuse existing `GEMINI_API_KEY` from `getDecryptedApiKeys()`
- **Dynamic import**: Follow pattern from `gemini-transcribe-handler.ts` for `@google/genai` import (supports packaged app)
- **Error handling**: Wrap API calls with retry (1 retry, exponential backoff). Return clear error if key missing.
- **Rate limiting**: Gemini has rate limits. Process chunks sequentially, not in parallel, to avoid 429s.

## Tests

| Test | File |
|------|------|
| Provider interface contract | `tests/unit/video-search/embedding-provider.test.ts` |
| Gemini provider returns correct dimensions | `tests/unit/video-search/gemini-embedding-provider.test.ts` |
| Handles missing API key gracefully | Same file |
| Mock: embedText returns 768-dim vector | Same file |
