# Refactor Plan: ffmpeg-utils.ts

**File**: `apps/web/src/lib/ffmpeg/ffmpeg-utils.ts`
**Current Lines**: 904
**Target**: All files under 800 lines

---

## Current Structure

| Section | Lines | Description |
|---------|-------|-------------|
| Imports & setup | 1-32 | FFmpeg loader, debug, blob manager, globals |
| Environment detection | 34-89 | isElectron, isPackagedElectron, checkEnvironment |
| Resource resolution | 91-154 | getFFmpegResourceUrl with fallback strategies |
| Lifecycle management | 156-181 | scheduleFFmpegCleanup, updateLastUsed |
| **Initialization** | **183-488** | **initFFmpeg (~283 lines), isFFmpegReady, getFFmpegInstance** |
| Video utilities | 490-866 | generateThumbnail, trimVideo, getVideoInfo, convertToWebM, extractAudio |
| Cleanup functions | 868-904 | terminateFFmpeg, forceFFmpegCleanup |

---

## Proposed Split

```
lib/ffmpeg/
├── index.ts                (~40 lines)  Barrel re-export
├── state.ts                (~20 lines)  Shared mutable state (ffmpeg instance, flags)
├── environment.ts          (~100 lines) Environment detection & validation
├── resources.ts            (~100 lines) WASM resource URL resolution
├── lifecycle.ts            (~80 lines)  Cleanup scheduling & usage tracking
├── init.ts                 (~290 lines) FFmpeg initialization (largest, still under 800)
├── operations.ts           (~250 lines) Video processing operations + cleanup
└── [existing ffmpeg-utils.ts kept as re-export shim if needed]
```

## Estimated Line Counts

| New File | Lines | Content |
|----------|-------|---------|
| `index.ts` | 40 | Barrel re-exports |
| `state.ts` | 20 | Shared mutable state (ffmpeg instance, flags, blob error listener) |
| `environment.ts` | 100 | isElectron, isPackagedElectron, checkEnvironment |
| `resources.ts` | 100 | getFFmpegResourceUrl with app/HTTP/public fallbacks |
| `lifecycle.ts` | 80 | scheduleFFmpegCleanup, updateLastUsed, timer state |
| `init.ts` | 290 | initFFmpeg (complex init with timeout/retries), isFFmpegReady, getFFmpegInstance |
| `operations.ts` | 250 | generateThumbnail, trimVideo, getVideoInfo, convertToWebM, extractAudio, terminateFFmpeg, forceFFmpegCleanup |
| **Total** | **~870** | Includes import/export overhead |

## Dependency Chain

```text
environment.ts → (standalone)
resources.ts → environment.ts
state.ts → (standalone, mutable globals)
lifecycle.ts → state.ts
init.ts → environment.ts, resources.ts, lifecycle.ts, state.ts
operations.ts → init.ts (getFFmpegInstance)
index.ts → re-exports all, imports state.ts
```

## Migration Steps

1. Create `environment.ts` (no dependencies, easiest)
2. Create `resources.ts` (depends on environment)
3. Create `state.ts` (shared mutable state, no dependencies)
4. Create `lifecycle.ts` (depends on state.ts)
5. Create `init.ts` (depends on environment, resources, lifecycle)
6. Create `operations.ts` (depends on init for FFmpeg instance)
7. Create `index.ts` barrel re-export
8. Update imports throughout codebase
