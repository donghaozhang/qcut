# Search Feature — User Guide

> **Status:** Implemented
> **Updated:** 2026-03-14

## Overview

Search video content by word or phrase using transcription data. Two access methods:

1. **Smart Speech UI** — inline word search inside the Word Timeline panel
2. **CLI / Agent** — `editor:search:*` commands for programmatic access

---

## Smart Speech UI (Editor)

Search is built into the **Smart Speech (Word Timeline)** panel. You must have transcription data loaded to search.

### Step-by-step

1. Open the editor, go to **Edit > AI Assist > Word Timeline**
2. Load transcription data:
   - Drag & drop a video/audio file to transcribe it
   - Or drag & drop a JSON transcription file
3. Click the **search icon** in the header bar
4. Type a word or phrase in the search bar
5. Matching words highlight **yellow**; the active match gets a **yellow ring**
6. **Enter** — jump to next match (seeks playback to that word's timestamp)
7. **Shift+Enter** — jump to previous match
8. **Escape** — close search

### Auto-persistence

When you transcribe media through Smart Speech, the transcription is automatically saved to disk at `<projectDir>/transcriptions/<mediaId>.transcription.json`. This means:

- Transcriptions persist across sessions
- CLI search can find them
- No need to re-transcribe

---

## CLI Usage

### Transcribe media first

```bash
# Transcribe a single media item (ElevenLabs, default)
bun run pipeline editor:transcribe:run --project-id <id> --media-id <id> --json

# Transcribe from file path
bun run pipeline editor:transcribe:run --project-id <id> --source path:/path/to/video.mp4 --json

# Use Gemini provider
bun run pipeline editor:transcribe:run --project-id <id> --media-id <id> --model gemini --json

# Async transcription (non-blocking, poll for completion)
bun run pipeline editor:transcribe:start --project-id <id> --media-id <id> --poll
```

Transcription results are automatically saved to disk for search.

### Search transcriptions

```bash
# Basic search
bun run pipeline editor:search:query --project-id <id> --query "hello world" --json

# Case-sensitive search
bun run pipeline editor:search:query --project-id <id> --query "Hello" --case-sensitive --json

# Whole-word match only
bun run pipeline editor:search:query --project-id <id> --query "the" --whole-word --json

# Limit results
bun run pipeline editor:search:query --project-id <id> --query "um" --max-results 10 --json

# Scope to a single media item
bun run pipeline editor:search:query --project-id <id> --query "hello" --media-id <mediaId> --json
```

### Check transcription status

```bash
# See which media items have transcriptions
bun run pipeline editor:search:status --project-id <id> --json
```

### Index (info about what needs transcription)

```bash
bun run pipeline editor:search:index --project-id <id> --json
```

---

## HTTP API

For direct HTTP access (used by CLI handlers internally):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/claude/search/:projectId?q=<query>` | Search transcriptions |
| GET | `/api/claude/search/:projectId/status` | Transcription status per media |
| POST | `/api/claude/search/:projectId/index` | Check what needs transcription |

### Query parameters for search

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | required | Search query |
| `caseSensitive` | boolean | false | Case-sensitive matching |
| `wholeWord` | boolean | false | Match whole words only |
| `maxResults` | number | unlimited | Limit number of results |
| `mediaId` | string | all | Scope to specific media |

### Search response format

```json
{
  "query": "hello",
  "totalTranscriptions": 3,
  "totalResults": 5,
  "results": [
    {
      "mediaId": "abc123",
      "mediaName": "interview.mp4",
      "segmentText": "Hello and welcome to the show",
      "matchStart": 0,
      "matchEnd": 5,
      "timestamp": 1.2,
      "timestampEnd": 4.5,
      "wordTimestamp": 1.2
    }
  ]
}
```

---

## Architecture

### Data flow

```
Transcribe (Smart Speech or CLI)
       |
       v
Auto-save to <projectDir>/transcriptions/<mediaId>.transcription.json
       |
       +---> Smart Speech UI: word-search highlights + seek
       |
       +---> CLI: editor:search:query reads from disk, runs search engine
```

### Key files

| File | Purpose |
|------|---------|
| `packages/editor-core/src/search/search-engine.ts` | Core search algorithm |
| `packages/editor-core/src/types/transcription.ts` | PersistedTranscription type |
| `apps/web/src/components/editor/media-panel/views/word-timeline/word-search.tsx` | UI search bar in Smart Speech |
| `apps/web/src/stores/search-store.ts` | Search state management (Zustand) |
| `electron/claude/http/claude-http-search-routes.ts` | HTTP API + disk persistence |
| `electron/native-pipeline/editor/editor-handlers-search.ts` | CLI handler |

### Transcription storage format

```json
{
  "version": 1,
  "mediaId": "abc123",
  "mediaName": "video.mp4",
  "language": "en",
  "duration": 120.5,
  "provider": "elevenlabs",
  "createdAt": 1709150400000,
  "text": "Full transcript text...",
  "words": [
    { "text": "Hello", "start": 0.5, "end": 0.8, "type": "word" }
  ],
  "segments": [
    { "text": "Hello world", "start": 0.5, "end": 1.5 }
  ]
}
```

---

## Future Enhancements

- **Fuzzy search** — Levenshtein distance matching for typos
- **Semantic search** — Embed transcription segments and search by meaning
- **Timeline visual highlighting** — Show colored markers on timeline at match positions
- **Search & Replace** — Edit transcription text (useful for caption editing)
- **Batch transcribe-all** — Single command to transcribe all untranscribed media in a project
