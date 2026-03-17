# Subtask 6: Search UI

## Goal

Add a semantic search tab to the existing search panel. Results show thumbnails, timestamps, similarity scores. Click to seek in timeline.

## Files to Create/Modify

### New: `apps/web/src/stores/video-search-store.ts`

```typescript
import { create } from "zustand";

interface VideoSearchResult {
  mediaId: string;
  mediaName: string;
  chunkIndex: number;
  startTime: number;
  endTime: number;
  score: number;
  thumbnailPath?: string;
}

interface IndexingProgress {
  phase: "chunking" | "embedding" | "saving";
  current: number;
  total: number;
  mediaId?: string;
  mediaName?: string;
}

interface VideoSearchStore {
  // Search state
  query: string;
  results: VideoSearchResult[];
  isSearching: boolean;
  searchError: string | null;

  // Indexing state
  isIndexing: boolean;
  indexingProgress: IndexingProgress | null;
  indexedMediaIds: string[];

  // Actions
  setQuery: (query: string) => void;
  search: (projectId: string) => Promise<void>;
  indexMedia: (projectId: string, mediaId: string) => Promise<void>;
  indexAllMedia: (projectId: string) => Promise<void>;
  cancelIndexing: (projectId: string) => Promise<void>;
  loadIndexedStatus: (projectId: string) => Promise<void>;
  clearResults: () => void;
}
```

### New: `apps/web/src/components/editor/media-panel/views/search/SemanticSearchPanel.tsx`

```tsx
// UI Structure:
// ┌─────────────────────────────────────┐
// │ 🔍 [Search by meaning...]    [⚙️]  │  ← Query input + settings
// │ ─────────────────────────────────── │
// │ Index: 3/5 media indexed [Index All]│  ← Indexing status bar
// │ ─────────────────────────────────── │
// │ ┌─────┐ interview.mp4  0:15-0:20   │  ← Result card
// │ │thumb│ "person talking..." 92%     │
// │ └─────┘                             │
// │ ┌─────┐ b-roll.mp4     1:30-1:35   │
// │ │thumb│ "car driving..." 87%        │
// │ └─────┘                             │
// │ ...                                 │
// └─────────────────────────────────────┘
```

Key behaviors:
- **Debounced search**: 500ms after user stops typing (embedding API call is expensive)
- **Click result**: Seek playback to `startTime` via `usePlaybackStore.setState({ currentTime: startTime })`
- **Hover result**: Show preview tooltip with larger thumbnail
- **Index button**: Per-media or "Index All" for unindexed media
- **Progress bar**: Show during indexing with phase + chunk count

### Modify: `apps/web/src/components/editor/media-panel/views/search/SearchPanel.tsx`

Add a tab or toggle to switch between existing text search and new semantic search:

```tsx
// Add tab: "Text" | "Semantic"
// "Text" = existing transcription search
// "Semantic" = new SemanticSearchPanel
```

### New: `apps/web/src/types/electron/api-video-search.ts`

```typescript
export interface ElectronVideoSearchOps {
  videoSearch?: {
    search: (
      projectId: string,
      query: string,
      options?: { topK?: number; minScore?: number; mediaFilter?: string[] }
    ) => Promise<{ results: VideoSearchResult[] }>;

    indexMedia: (projectId: string, mediaId: string) => Promise<IndexResult>;
    indexProject: (projectId: string) => Promise<IndexResult[]>;
    cancelIndexing: (projectId: string) => Promise<void>;
    deleteIndex: (projectId: string, mediaId: string) => Promise<void>;
    indexStatus: (projectId: string) => Promise<{ indexedMediaIds: string[] }>;
  };
}
```

### Modify: `apps/web/src/types/electron/index.ts`

Add `ElectronVideoSearchOps` to the `ElectronAPI` intersection type.

## Files to Reference

| File | Why |
|------|-----|
| `apps/web/src/stores/search-store.ts` | Existing search store pattern (debounce, results, navigation) |
| `apps/web/src/components/editor/media-panel/views/search/SearchPanel.tsx` | Existing search UI to extend |
| `apps/web/src/stores/playback-store.ts` | Seek-on-click pattern (`currentTime` state) |
| `apps/web/src/stores/media/media-store.ts` | Media item access (names, thumbnails, durations) |
| `apps/web/src/types/electron/api-claude.ts` | ElectronAPI sub-interface pattern |
| `docs/technical/media-panel-reference.md` | All 20 editor panels documented |

## Implementation Notes

- **Tab approach**: Add "Text" / "Visual" tabs to SearchPanel. Text = existing. Visual = new semantic search.
- **Thumbnail display**: Convert file path from electron to `file://` URL or use IPC to read as base64. Follow pattern from existing thumbnail handling in media store.
- **Score display**: Show as percentage (e.g., "92%" not "0.92"). Color-code: green >80%, yellow >50%, red <50%.
- **Empty states**:
  - No media indexed → "Index your media to enable visual search"
  - No results → "No matches found. Try a different description."
  - Indexing in progress → Progress bar with cancel button
- **Accessibility**: Follow `docs/reference/accessibility-rules.md` — keyboard nav, aria labels, focus management

## Tests

| Test | File |
|------|------|
| Store: search updates results | `tests/unit/video-search/video-search-store.test.ts` |
| Store: indexing progress updates | Same file |
| Component: renders results with thumbnails | `tests/unit/components/SemanticSearchPanel.test.tsx` |
| Component: click result seeks playback | Same file |
| Component: shows indexing progress | Same file |
