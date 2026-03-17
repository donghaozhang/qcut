# Video Semantic Search — Implementation Overview

## Goal

Add semantic video search to QCut: users type a natural language query ("red car driving fast", "person laughing") and get back timestamped results with thumbnails from their project media, clickable to seek in timeline.

## What Already Exists

| Layer | Status | Location |
|-------|--------|----------|
| Transcription search | Done | `stores/search-store.ts`, `@qcut/editor-core/search/` |
| Word-level timestamps | Done | `PersistedTranscription.words[]` with timing |
| FFmpeg frame extraction | Done | `electron/ffmpeg-handler.ts`, `ffmpeg-basic-handlers.ts` |
| Gemini API integration | Done | `electron/gemini-transcribe-handler.ts`, `electron/api-key-handler.ts` |
| Media store + metadata | Done | `stores/media/`, `media-import-handler.ts` |
| IPC handler pattern | Done | `electron/main-ipc/index.ts`, typed in `types/electron/` |
| Project file storage | Done | `~/Documents/QCut/Projects/{id}/` structure |
| Search UI panel | Done | `components/editor/media-panel/views/search/SearchPanel.tsx` |

## What Needs Building

```
┌─────────────────────────────────────────────────────────┐
│                    Search UI (Panel)                     │
│  Query input → Results list → Thumbnail + Seek-on-click │
├─────────────────────────────────────────────────────────┤
│                  Search IPC Handler                      │
│  KNN cosine search → Score + rank → Return results      │
├─────────────────────────────────────────────────────────┤
│                  Vector Storage                          │
│  SQLite + cosine similarity (project-scoped)            │
├─────────────────────────────────────────────────────────┤
│               Embedding Pipeline                         │
│  Chunk video → Gemini Embedding 2 API → Store vectors   │
├─────────────────────────────────────────────────────────┤
│              Provider Abstraction                        │
│  GeminiEmbedding2 (default) │ ImageBind (local GPU)     │
└─────────────────────────────────────────────────────────┘
```

## Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Default embedding model | Gemini Embedding 2 | Already have API key, native video+audio, zero GPU |
| Vector storage | SQLite JSON file (flat cosine) | Desktop app, no server, project-scoped, simple |
| Chunk duration | 5 seconds | Matches NVIDIA VSS research, good granularity |
| Embedding dimensions | 768 | Balance of quality and storage (Gemini supports 128–3072) |
| Indexing trigger | On-demand (user clicks "Index") | Don't slow down import; indexing is expensive |
| Search scope | Per-project | Each project has its own embedding index |

## Subtask Breakdown

| # | Subtask | Est. | Doc |
|---|---------|------|-----|
| 1 | Embedding provider abstraction + Gemini implementation | 15 min | [11-subtask-embedding-provider.md](11-subtask-embedding-provider.md) |
| 2 | Video chunking pipeline (FFmpeg 5s splits) | 15 min | [12-subtask-video-chunking.md](12-subtask-video-chunking.md) |
| 3 | Vector storage layer (project-scoped) | 15 min | [13-subtask-vector-storage.md](13-subtask-vector-storage.md) |
| 4 | Indexing IPC handler (orchestrates chunk → embed → store) | 20 min | [14-subtask-indexing-handler.md](14-subtask-indexing-handler.md) |
| 5 | Search IPC handler (query → embed → KNN → results) | 15 min | [15-subtask-search-handler.md](15-subtask-search-handler.md) |
| 6 | Search UI (panel integration, results, thumbnails) | 20 min | [16-subtask-search-ui.md](16-subtask-search-ui.md) |
| 7 | Settings + provider config | 10 min | [17-subtask-settings.md](17-subtask-settings.md) |
| 8 | Tests | 15 min | [18-subtask-tests.md](18-subtask-tests.md) |

## Data Flow

### Indexing (background, per media item)
```
User clicks "Index Media" on a video
  → electron/video-search-handler.ts receives IPC call
  → FFmpeg splits video into 5s chunks (temp files)
  → For each chunk:
      → Upload to Gemini Embedding 2 API
      → Get 768-dim vector back
      → Store: { mediaId, chunkIndex, startTime, endTime, vector }
  → Save embeddings to projectDir/embeddings/{mediaId}.json
  → Clean up temp chunk files
  → Return indexing status to renderer
```

### Searching
```
User types query in Search Panel
  → electron/video-search-handler.ts receives IPC call
  → Gemini Embedding 2: embed query text → 768-dim vector
  → Load all embeddings for project from projectDir/embeddings/
  → Cosine similarity: query vector vs all chunk vectors
  → Sort by score, top K results
  → For each result: generate thumbnail at chunk midpoint (FFmpeg)
  → Return: [{ mediaId, mediaName, startTime, endTime, score, thumbnailUrl }]
  → UI displays results, click → seek playback to startTime
```

## File Structure (New Files)

```
electron/
├── video-search-handler.ts          # IPC handler (index + search)
├── video-search/
│   ├── embedding-provider.ts        # Provider abstraction interface
│   ├── gemini-embedding-provider.ts # Gemini Embedding 2 implementation
│   ├── vector-storage.ts            # Read/write embedding JSON files
│   ├── video-chunker.ts             # FFmpeg 5s chunk splitting
│   └── cosine-search.ts             # KNN cosine similarity search
apps/web/src/
├── types/electron/api-video-search.ts  # Type definitions
├── stores/video-search-store.ts        # Zustand store for search state
├── components/editor/media-panel/views/search/
│   └── SemanticSearchPanel.tsx         # New semantic search tab/section

Project storage:
~/Documents/QCut/Projects/{projectId}/
└── embeddings/
    └── {mediaId}.embeddings.json       # Per-media embedding vectors
```
