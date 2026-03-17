# Subtask 7: Settings & Provider Config

## Goal

Let users configure which embedding provider to use and adjust search parameters. Integrate with existing API key management.

## Files to Create/Modify

### New: `electron/video-search/provider-config.ts`

```typescript
export interface VideoSearchConfig {
  provider: "gemini-embedding-2" | "imagebind" | "cosmos-embed1";
  dimensions: number;           // 768 default
  chunkDuration: number;        // 5 default
  topK: number;                 // 20 default
  minScore: number;             // 0.1 default
  autoIndex: boolean;           // false default — index on import?
}

const DEFAULT_CONFIG: VideoSearchConfig = {
  provider: "gemini-embedding-2",
  dimensions: 768,
  chunkDuration: 5,
  topK: 20,
  minScore: 0.1,
  autoIndex: false,
};

/**
 * Load config from: ~/Documents/QCut/video-search-config.json
 * Falls back to defaults.
 */
export async function loadConfig(): Promise<VideoSearchConfig>;

/**
 * Save config. Merges with defaults for missing fields.
 */
export async function saveConfig(partial: Partial<VideoSearchConfig>): Promise<void>;
```

### IPC Channels (add to `video-search-handler.ts`)

```typescript
"video-search:get-config"      // Get current config
"video-search:set-config"      // Update config
"video-search:available-providers" // List providers + availability
```

### Available Providers Check

```typescript
async function getAvailableProviders(): Promise<ProviderInfo[]> {
  return [
    {
      id: "gemini-embedding-2",
      name: "Gemini Embedding 2",
      description: "Cloud API — video, audio, image, text (recommended)",
      available: await geminiProvider.isAvailable(), // checks GEMINI_API_KEY
      requiresGPU: false,
      modalities: ["video", "audio", "image", "text"],
    },
    // Future: ImageBind, Cosmos entries
  ];
}
```

## Files to Reference

| File | Why |
|------|-----|
| `electron/api-key-handler.ts` | API key management, `getDecryptedApiKeys()` |
| `apps/web/src/stores/project-store.ts` | Settings persistence pattern |
| `electron/native-pipeline/infra/api-caller.ts` | Multi-provider config pattern |

## Implementation Notes

- **Config scope**: Global (not per-project), stored in QCut app data directory
- **Provider switching**: If user changes provider, warn that existing embeddings become incompatible and offer to re-index
- **MVP**: Only Gemini Embedding 2 for v1. ImageBind/Cosmos are future providers behind the same interface.
- **Auto-index**: Off by default. When on, index media automatically on import (can be slow for large files).
- **API key validation**: On config save, verify the selected provider's key works with a test embed call

## Tests

| Test | File |
|------|------|
| loadConfig returns defaults when no file | `tests/unit/video-search/provider-config.test.ts` |
| saveConfig merges with defaults | Same file |
| Provider availability check | Same file |
