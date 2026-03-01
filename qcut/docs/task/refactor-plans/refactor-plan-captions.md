# Refactor Plan: captions.tsx

**File**: `apps/web/src/components/editor/media-panel/views/captions.tsx`
**Current Lines**: 805
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Imports & config | 1-53 | React, UI, stores, constants, types |
| arrayBufferToBase64 helper | 55-63 | Deprecated helper (~9 lines) |
| TranscriptionState interface | 65-70 | Local type definition |
| **CaptionsView component** | **72-804** | **Main component (~733 lines)** |
| → State & refs | 73-82 | Language, transcription state, refs |
| → Store hooks | 84-93 | Timeline, captions stores, config check |
| → updateState callback | 95-97 | State setter |
| → addCaptionsToTimeline | 99-134 | Add segments to timeline (~36 lines) |
| → stopTranscription | 136-142 | Cancel handler |
| → getCachedTranscription | 145-171 | Cache retrieval (~27 lines) |
| → **startTranscription** | **173-517** | **Main logic (~345 lines — too large)** |
| → handleFileSelect | 519-572 | File selection handler (~54 lines) |
| → Drag-drop hook | 574-576 | useDragDrop integration |
| → JSX return | 580-804 | Config warning, upload area, results (~225 lines) |

---

## Proposed Split

The `startTranscription` callback at 345 lines is the main problem. Extract it and the UI into focused modules:

```text
media-panel/views/captions/
├── captions.tsx                        (~250 lines) Main component orchestrator
├── types.ts                            (~20 lines)  TranscriptionState interface
├── hooks/
│   ├── use-transcription.ts            (~220 lines) startTranscription logic + Gemini API
│   ├── use-caption-timeline.ts         (~50 lines)  addCaptionsToTimeline
│   └── use-transcription-cache.ts      (~40 lines)  getCachedTranscription
├── utils/
│   ├── error-messages.ts               (~80 lines)  Error handling & toast messages
│   ├── file-validation.ts              (~50 lines)  File type/size validation
│   └── audio-extraction.ts             (~60 lines)  Audio extraction from video via FFmpeg
├── components/
│   ├── transcription-upload-area.tsx    (~120 lines) Upload UI (loading, progress, success, error)
│   ├── transcription-result.tsx        (~80 lines)  Result display with segments
│   └── configuration-warning.tsx       (~40 lines)  Config missing warning banner
└── index.ts                            (~5 lines)   Barrel re-export
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `captions.tsx` (refactored) | 250 | Component shell, state, store hooks, compose hooks, drag-drop, JSX layout |
| `types.ts` | 20 | TranscriptionState, re-exports |
| `hooks/use-transcription.ts` | 220 | startTranscription, Gemini API integration, progress tracking |
| `hooks/use-caption-timeline.ts` | 50 | addCaptionsToTimeline, timeline store integration |
| `hooks/use-transcription-cache.ts` | 40 | getCachedTranscription, localStorage management |
| `utils/error-messages.ts` | 80 | Error condition handling, toast messages |
| `utils/file-validation.ts` | 50 | File type/size checks, constants (MAX_FILE_SIZE_MB) |
| `utils/audio-extraction.ts` | 60 | Audio extraction from video using FFmpeg |
| `components/transcription-upload-area.tsx` | 120 | Upload ready, loading skeleton, progress, success, error states |
| `components/transcription-result.tsx` | 80 | ScrollArea with segments, "Add to Timeline" button |
| `components/configuration-warning.tsx` | 40 | Warning banner for missing Gemini config |
| `index.ts` | 5 | Barrel re-export |
| **Total** | **~1,015** | Includes import/export overhead |

## Quick Win

Even just extracting `use-transcription.ts` (the 345-line `startTranscription` callback) would reduce the main file from 805 → ~460 lines, immediately resolving the violation.

## Migration Steps

1. Extract `types.ts` (no dependencies)
2. Extract `utils/error-messages.ts` (standalone error handling)
3. Extract `utils/file-validation.ts` (standalone validation)
4. Extract `utils/audio-extraction.ts` (FFmpeg dependency only)
5. Extract `hooks/use-transcription-cache.ts` (localStorage only)
6. Extract `hooks/use-caption-timeline.ts` (timeline store)
7. Extract `hooks/use-transcription.ts` (depends on utils + cache)
8. Extract UI components: upload-area, result, warning
9. Refactor `captions.tsx` to compose all modules
10. Create barrel `index.ts`
