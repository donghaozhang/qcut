# Search Feature — Implementation Plan

> **Status:** Draft  
> **Created:** 2026-03-11  
> **Estimated Total Time:** ~3–4 hours (broken into 7 subtasks)

## Overview

Enable users to search video content by word/phrase, powered by transcription data. Users can:

1. Transcribe a video (reusing existing ElevenLabs/Gemini transcription)
2. Search by word or phrase across transcription text
3. View matching timestamps as a results list
4. Click a result to seek the timeline/player to that timestamp

The feature supports both single-video search and cross-video search within a project.

---

## Architecture Decisions

### Transcription Storage Strategy

Currently, transcription results live only in-memory (the `transcribeJobs` Map in `claude-transcribe-handler.ts` and the `word-timeline-store` in the frontend). For search to work efficiently across sessions and multiple videos, **transcription data must be persisted per-project**.

**Decision:** Store transcription JSON files alongside project data using the existing storage adapter pattern. Each media item gets a `.transcription.json` sidecar file keyed by `mediaId`.

**Format (per media item):**
```json
{
  "mediaId": "abc123",
  "language": "en",
  "duration": 120.5,
  "provider": "elevenlabs",
  "createdAt": 1709150400000,
  "words": [
    { "text": "Hello", "start": 0.5, "end": 0.8, "type": "word" },
    { "text": " ", "start": 0.8, "end": 0.85, "type": "spacing" },
    ...
  ],
  "segments": [
    { "text": "Hello world", "start": 0.5, "end": 1.5 },
    ...
  ]
}
```

### Search Algorithm

Phase 1: Simple substring/word matching on segment text (case-insensitive). This is sufficient for typical project sizes (< 100 segments per video, < 50 videos per project).

Phase 2 (future): Full-text search with fuzzy matching if needed.

### UI Location

Add a **Search panel tab** in the existing right-side media panel (`apps/web/src/components/editor/media-panel/`), alongside existing tabs (Media, AI, etc.). This follows the established UI pattern and keeps the feature discoverable without cluttering the timeline.

---

## Subtask Breakdown

### Subtask 1: Transcription Persistence Layer (~30 min)

**Goal:** Save and load transcription data per media item, per project.

**Files to create/modify:**
- `packages/editor-core/src/types/transcription.ts` — New file. Define `PersistedTranscription` type
- `packages/editor-core/src/storage/interface.ts` — Extend `EditorStorageProvider` with `saveTranscription()` / `loadTranscription()` / `listTranscriptions()`
- `packages/editor-core/src/storage/index.ts` — Re-export new types
- `apps/web/src/lib/storage/` — Implement storage adapter methods (IndexedDB for web, IPC for desktop)

**Desktop (Electron) storage:**
- `electron/claude/handlers/claude-transcribe-handler.ts` — After transcription completes, auto-persist result to disk
- Store at: `<projectDir>/transcriptions/<mediaId>.transcription.json`

**Key considerations:**
- Transcription is idempotent — if a transcription already exists for a mediaId, skip re-transcription unless forced
- Include a `version` field in the JSON for future schema migrations

**Test file:** `packages/editor-core/src/__tests__/transcription-storage.test.ts`
- Test save/load round-trip
- Test listing all transcriptions for a project
- Test idempotency (save twice, load once)
- Test missing transcription returns null

---

### Subtask 2: Search Engine Core (~30 min)

**Goal:** Pure logic module that matches search queries against transcription data and returns timestamped results.

**Files to create:**
- `packages/editor-core/src/search/search-engine.ts` — New file. Core search logic:
  ```ts
  interface SearchResult {
    mediaId: string;
    mediaName: string;
    segmentText: string;
    matchStart: number;    // char index in segment text
    matchEnd: number;      // char index in segment text  
    timestamp: number;     // seconds — start of the matching segment
    timestampEnd: number;  // seconds — end of the matching segment
    wordTimestamp?: number; // seconds — precise word-level timestamp if available
  }
  
  interface SearchOptions {
    query: string;
    caseSensitive?: boolean;
    wholeWord?: boolean;
    maxResults?: number;
  }
  
  function searchTranscriptions(
    transcriptions: PersistedTranscription[],
    options: SearchOptions
  ): SearchResult[]
  ```
- `packages/editor-core/src/search/index.ts` — Re-export
- `packages/editor-core/src/index.ts` — Add search exports

**Key logic:**
- For each transcription → for each segment → find all occurrences of the query string
- If word-level data exists, refine the timestamp to the exact word match
- Sort results by: (1) media order, (2) timestamp ascending
- Support highlighting by returning match char offsets

**Test file:** `packages/editor-core/src/__tests__/search-engine.test.ts`
- Test basic substring match
- Test case-insensitive search
- Test whole-word matching
- Test multi-segment matches within one transcription
- Test cross-transcription (multi-video) search
- Test empty query returns empty
- Test no match returns empty
- Test maxResults limit
- Test word-level timestamp precision

---

### Subtask 3: Search Zustand Store (Frontend) (~25 min)

**Goal:** Manage search state — query, results, loading status, selected result.

**Files to create:**
- `apps/web/src/stores/search-store.ts` — New Zustand store:
  ```ts
  interface SearchState {
    query: string;
    results: SearchResult[];
    isSearching: boolean;
    selectedResultIndex: number | null;
    transcriptionStatus: Map<string, 'none' | 'loading' | 'ready' | 'error'>;
  }
  
  interface SearchActions {
    setQuery: (query: string) => void;
    search: (projectId: string) => Promise<void>;
    selectResult: (index: number) => void;
    navigateToResult: (index: number) => void;
    transcribeMedia: (projectId: string, mediaId: string) => Promise<void>;
    transcribeAll: (projectId: string) => Promise<void>;
    clearSearch: () => void;
  }
  ```

**Integration points:**
- `apps/web/src/stores/editor/playback-store.ts` — Use `setCurrentTime()` to seek to result timestamp
- `apps/web/src/stores/timeline/timeline-store.ts` — Read current project's media items
- `apps/web/src/stores/media/media-store.ts` — Get media metadata (names, durations)

**Test file:** `apps/web/src/stores/__tests__/search-store.test.ts`
- Test query updates
- Test search executes and populates results
- Test navigateToResult calls setCurrentTime
- Test clearSearch resets state
- Test transcription status tracking

---

### Subtask 4: Search Panel UI (~40 min)

**Goal:** Build the search UI as a new panel view in the media panel.

**Files to create:**
- `apps/web/src/components/editor/media-panel/views/search/SearchPanel.tsx` — Main search panel component:
  - Search input with debounced query
  - "Transcribe All" button (for untranscribed media)
  - Results list with: media name, timestamp, highlighted text snippet
  - Click-to-seek on each result
  - Empty state: "No results" / "Enter a search term"
  - Loading state during transcription
- `apps/web/src/components/editor/media-panel/views/search/SearchResultItem.tsx` — Individual result row
- `apps/web/src/components/editor/media-panel/views/search/search-panel.css` — Styles (if not using Tailwind)

**Files to modify:**
- `apps/web/src/components/editor/media-panel/` — Register the Search tab/view in the panel navigation
  - Check existing panel tab pattern (look at how AI, Media, Moyin tabs are registered)
  - Add a 🔍 icon tab for Search

**Key UX:**
- Debounce search input by 300ms
- Show transcription progress per video (✓ transcribed, ⏳ in progress, ✗ not yet)
- Keyboard shortcut: `Cmd+F` / `Ctrl+F` to focus search (if not conflicting)
- `Enter` to jump to next result, `Shift+Enter` for previous
- Highlight the current result in the timeline (optional, Phase 2)

**Test file:** `apps/web/src/components/editor/media-panel/views/search/__tests__/SearchPanel.test.tsx`
- Test renders search input
- Test typing triggers debounced search
- Test result list renders correct items
- Test clicking result navigates to timestamp

---

### Subtask 5: CLI Commands — `editor:search:*` (~30 min)

**Goal:** Expose search via the CLI pipeline for programmatic/agent access.

**Files to create:**
- `electron/native-pipeline/editor/editor-handlers-search.ts` — New handler module:
  ```
  editor:search:query    — Search transcriptions by text
  editor:search:status   — List transcription status for all media in a project  
  editor:search:index    — Trigger transcription for all untranscribed media
  ```

**Files to modify:**
- `electron/native-pipeline/cli/command-registry-editor.ts` — Register `editor:search:*` commands with flags:
  - `--query` (string, required for `editor:search:query`)
  - `--project-id` (string, required)
  - `--case-sensitive` (boolean)
  - `--whole-word` (boolean)
  - `--max-results` (number)
  - `--media-id` (string, optional — scope to single media)
- `electron/native-pipeline/cli/cli.ts` — Add `editor:search:*` to help text
- `electron/claude/handlers/claude-command-registry.ts` — Register new commands

**HTTP API routes:**
- `electron/claude/http/claude-http-analysis-routes.ts` — Add endpoints:
  - `GET /api/claude/search/:projectId?q=<query>&caseSensitive=&wholeWord=&maxResults=`
  - `GET /api/claude/search/:projectId/status` — Transcription status per media
  - `POST /api/claude/search/:projectId/index` — Trigger batch transcription

**Test file:** `electron/__tests__/editor-search-handler.test.ts`
- Test query returns matching results
- Test empty query error handling
- Test status endpoint returns per-media transcription state
- Test index endpoint triggers transcription jobs

---

### Subtask 6: Timeline Integration — Seek + Highlight (~20 min)

**Goal:** When a user clicks a search result, seek the playhead to that timestamp and optionally highlight the region.

**Files to modify:**
- `apps/web/src/stores/editor/playback-store.ts` — Ensure `setCurrentTime()` works from search context
- `apps/web/src/stores/timeline/timeline-store.ts` — If the matching media is on the timeline, scroll the timeline view to show the relevant element

**Files to create (optional, Phase 2):**
- `apps/web/src/components/editor/timeline/SearchHighlight.tsx` — Visual overlay on the timeline showing search match regions

**Behavior:**
1. Click result → `playbackStore.setCurrentTime(result.timestamp)`
2. If the matching media exists as a timeline element, scroll the timeline horizontally to center that element
3. If the matching media is NOT on the timeline (standalone search), switch to preview mode for that media file

**Test file:** `apps/web/src/stores/__tests__/search-navigation.test.ts`
- Test seek to timestamp on result click
- Test timeline scroll to element

---

### Subtask 7: Integration Testing + Polish (~25 min)

**Goal:** End-to-end testing, edge cases, and documentation.

**Files to create:**
- `electron/__tests__/search-integration.test.ts` — Full pipeline test:
  1. Create project with media
  2. Transcribe media
  3. Search for a phrase
  4. Verify results include correct timestamps
- `docs/reference/search-feature.md` — User-facing docs for the Search feature

**Edge cases to test:**
- Search with no transcriptions available → prompt to transcribe
- Search with partial transcriptions (some media transcribed, some not)
- Very long videos (> 1 hour) — ensure search performance is acceptable
- Special characters in search query (regex-safe)
- Multi-language transcriptions (CJK text matching)
- Empty segments in transcription data
- Concurrent transcription + search

**Files to update:**
- `electron/native-pipeline/cli/cli.ts` — Update help text
- `README.md` or equivalent — Mention Search feature

---

## Data Flow Diagram

```
User types query
       │
       ▼
[SearchPanel.tsx]  ──debounce──▶  [search-store.ts]
                                       │
                                       ▼
                              Load persisted transcriptions
                              from storage (per project)
                                       │
                                       ▼
                              [search-engine.ts]
                              Match query against segments
                                       │
                                       ▼
                              Return SearchResult[]
                                       │
                                       ▼
                              Render results in SearchPanel
                                       │
                              User clicks a result
                                       │
                                       ▼
                              [playback-store.ts].setCurrentTime()
                              Timeline scrolls to element
```

## CLI / Agent Flow

```
qcut-pipeline editor:search:query --project-id <id> --query "hello world" --json
       │
       ▼
[editor-handlers-search.ts]
       │
       ▼
HTTP GET /api/claude/search/:projectId?q=hello+world
       │
       ▼
[claude-http-analysis-routes.ts]
       │
       ▼
Load transcriptions from disk → search-engine → return JSON results
```

---

## File Index (all new/modified files)

| File | Action | Subtask |
|------|--------|---------|
| `packages/editor-core/src/types/transcription.ts` | **Create** | 1 |
| `packages/editor-core/src/storage/interface.ts` | Modify | 1 |
| `packages/editor-core/src/storage/index.ts` | Modify | 1 |
| `packages/editor-core/src/__tests__/transcription-storage.test.ts` | **Create** | 1 |
| `packages/editor-core/src/search/search-engine.ts` | **Create** | 2 |
| `packages/editor-core/src/search/index.ts` | **Create** | 2 |
| `packages/editor-core/src/index.ts` | Modify | 2 |
| `packages/editor-core/src/__tests__/search-engine.test.ts` | **Create** | 2 |
| `apps/web/src/stores/search-store.ts` | **Create** | 3 |
| `apps/web/src/stores/__tests__/search-store.test.ts` | **Create** | 3 |
| `apps/web/src/components/editor/media-panel/views/search/SearchPanel.tsx` | **Create** | 4 |
| `apps/web/src/components/editor/media-panel/views/search/SearchResultItem.tsx` | **Create** | 4 |
| `apps/web/src/components/editor/media-panel/views/search/__tests__/SearchPanel.test.tsx` | **Create** | 4 |
| `electron/native-pipeline/editor/editor-handlers-search.ts` | **Create** | 5 |
| `electron/native-pipeline/cli/command-registry-editor.ts` | Modify | 5 |
| `electron/native-pipeline/cli/cli.ts` | Modify | 5 |
| `electron/claude/handlers/claude-command-registry.ts` | Modify | 5 |
| `electron/claude/http/claude-http-analysis-routes.ts` | Modify | 5 |
| `electron/__tests__/editor-search-handler.test.ts` | **Create** | 5 |
| `apps/web/src/stores/editor/playback-store.ts` | Modify | 6 |
| `apps/web/src/stores/__tests__/search-navigation.test.ts` | **Create** | 6 |
| `electron/__tests__/search-integration.test.ts` | **Create** | 7 |
| `docs/reference/search-feature.md` | **Create** | 7 |

---

## Future Enhancements (out of scope for v1)

- **Fuzzy search** — Levenshtein distance matching for typos
- **Semantic search** — Embed transcription segments and search by meaning
- **Timeline visual highlighting** — Show colored markers on timeline at match positions
- **Search & Replace** — Edit transcription text (useful for caption editing)
- **Saved searches** — Bookmark frequent queries
- **Search in captions** — Extend search to caption tracks, not just raw transcription
- **Real-time search** — Update results as new transcriptions complete
