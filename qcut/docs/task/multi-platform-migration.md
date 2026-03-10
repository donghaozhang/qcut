# QCut Multi-Platform Migration Implementation Plan

> Source: [qcut-multi-platform-migration-plan-en.md](https://github.com/Quriosity-agent/articles/blob/main/2026-03-10/qcut-multi-platform-migration-plan-en.md)
> Branch: `platform`
> Created: 2026-03-10

## Goal

Evolve QCut from an Electron-centered runtime into a **reusable core + platform-shell architecture** (Desktop / Web / iPad), without disrupting desktop release velocity.

## Current State Summary

| Metric | Value |
|--------|-------|
| `window.electronAPI` references | **282** across 87 files (excludes comments/types) |
| Electron IPC handler files | **52** (24 root + 28 Claude handlers) |
| Zustand stores | **18** files in `apps/web/src/stores/` |
| Preload bridge | 502 lines, fully typed via `electron/preload-types/` |
| Boundary checker | `scripts/check-boundaries.ts` (212 lines, pre-commit hook) |
| Build targets | macOS (DMG+ZIP arm64), Windows (NSIS), Linux (AppImage+DEB) |

---

## Phase 0: Freeze Boundaries (1 week) — COMPLETE

**Objective:** Stop architectural drift. Create a safe migration surface.
**Status:** Implemented 2026-03-10

### Subtask 0.1 — Strengthen Boundary Checker -- DONE

Block new direct `window.electronAPI` usage outside approved adapter paths.

**Files changed:**
- `scripts/check-boundaries.ts` — added `--platform-audit` flag, `PLATFORM_AUDIT_RULE`, adapter path exclusions
- `scripts/__tests__/check-boundaries.test.ts` — 7 tests covering existing rules + platform audit mode

**Tests:** 7/7 passing

### Subtask 0.2 — Build electronAPI Usage Matrix -- DONE

Inventory all call-sites, classify by namespace/frequency/migration complexity.

**Actual counts (via `bun scripts/check-boundaries.ts --platform-audit`):**
- **282 references** across **87 files** (1161 files scanned)

**Output:** [`docs/task/platform-api-inventory.md`](platform-api-inventory.md) — full prioritized migration matrix with 3 migration waves

**Top files by ref count:**
- `drawing-storage.ts` (21), `pty-terminal-store.ts` (13), `claude-timeline-bridge.ts` (13)
- `zip-manager.ts` (12), `export-engine-cli.ts` (12), `api-keys-view.tsx` (10)

### Subtask 0.3 — Platform Capability Contract v0 -- DONE

Define which capabilities exist per platform (desktop full, web limited, iPad touch-optimized).

**Files created:**
- `packages/platform-core/package.json` — `@qcut/platform-core` package
- `packages/platform-core/tsconfig.json` — TypeScript config
- `packages/platform-core/src/types.ts` — `PlatformCapability` enum (28 capabilities), `PlatformAPI` interface with 10 namespace contracts
- `packages/platform-core/src/capabilities.ts` — `PLATFORM_CAPABILITIES` matrix, `isPlatformCapable()`, `getMissingCapabilities()`, `PlatformUnsupportedError`
- `packages/platform-core/src/index.ts` — barrel exports
- `packages/platform-core/src/__tests__/capabilities.test.ts` — 10 tests

**Also changed:**
- `vitest.config.ts` — added test include paths for `scripts/__tests__/` and `packages/platform-core/`

**Tests:** 10/10 passing

---

## Phase 1: Extract Core Data/Domain Layer (1-2 weeks) — COMPLETE

**Objective:** Decouple editor logic from Electron-specific runtime.
**Status:** Implemented 2026-03-10

### Subtask 1.1 — Bootstrap `packages/editor-core` -- DONE

**Files created:**
- `packages/editor-core/package.json` — `@qcut/editor-core` workspace package
- `packages/editor-core/tsconfig.json` — strict TypeScript config
- `packages/editor-core/src/index.ts` — barrel exports (types, timeline, commands, storage, utils)
- `package.json` (root) — added `packages/editor-core` and `packages/platform-core` to workspaces
- `apps/web/package.json` — added `@qcut/editor-core: workspace:*` dependency
- `vitest.config.ts` — added `packages/editor-core/**/__tests__/` to test includes

### Subtask 1.2 — Extract Timeline State & Services -- DONE

Extracted pure domain types and functions from renderer code to `@qcut/editor-core`.

**Types extracted:**
- `packages/editor-core/src/types/timeline.ts` — TrackType, TimelineElement, TimelineTrack, DragData, all Create* types, MediaType
- `packages/editor-core/src/types/project.ts` — TProject, Scene, BlurIntensity
- `packages/editor-core/src/types/editor.ts` — CanvasSize, CanvasMode, CanvasPreset, BackgroundType
- `packages/editor-core/src/types/captions.ts` — TranscriptionSegment, CaptionSegment, CaptionFormat, etc.

**Timeline functions extracted:**
- `packages/editor-core/src/timeline/track-utils.ts` — sortTracksByOrder, ensureMainTrack, getMainTrack, createTrack, getTrackName
- `packages/editor-core/src/timeline/element-utils.ts` — getEffectiveDuration, getElementEndTime, getElementNameWithSuffix
- `packages/editor-core/src/timeline/type-guards.ts` — isMediaElement, isTextElement, etc., getRemotionElements
- `packages/editor-core/src/timeline/validation.ts` — canElementGoOnTrack, validateElementTrackCompatibility
- `packages/editor-core/src/utils.ts` — generateUUID

**Source files updated to re-export from `@qcut/editor-core`:**
- `apps/web/src/types/timeline.ts` — re-exports all types + functions, keeps React-specific TimelineElementProps
- `apps/web/src/types/project.ts` — re-exports TProject, Scene, BlurIntensity
- `apps/web/src/types/editor.ts` — re-exports CanvasSize, CanvasMode, etc., keeps TextElementDragState
- `apps/web/src/types/captions.ts` — re-exports all caption types, keeps SUPPORTED_LANGUAGES

**Tests:** 27/27 passing (timeline-utils: 14, type-guards: 5, validation: 8)

### Subtask 1.3 — Extract Command Stack (Undo/Redo) -- DONE

Pure functional history stack with no framework dependencies.

**Files created:**
- `packages/editor-core/src/commands/history.ts` — generic `HistoryState<T>`, `pushState`, `undo`, `redo`, `canUndo`, `canRedo`, `clearHistory`

**Tests:** 7/7 passing (`packages/editor-core/src/__tests__/history.test.ts`)

### Subtask 1.4 — Inject Platform Dependencies -- DONE

**Files created:**
- `packages/editor-core/src/storage/interface.ts` — `EditorStorageProvider` interface (loadTimeline, saveTimeline, findProjectThumbnail)

**Exit Criteria — MET:**
- `editor-core` runs 34 unit tests independently (node/jsdom, no Electron)
- Zero direct Electron imports in `packages/editor-core/`
- All existing source files re-export from `@qcut/editor-core` — zero breaking changes
- Full build passes (`bun run build`)

---

## Phase 2: Build Platform Adapter Layer (1-2 weeks) — COMPLETE

**Objective:** Route all platform access through adapters.
**Status:** Implemented 2026-03-10

### Subtask 2.1 — Define `PlatformAPI` TypeScript Interfaces -- DONE

Expanded types from 10 to 33 namespace interfaces covering all preload APIs (120+ methods).

**Types split into directory for maintainability (each file <300 lines):**
- `packages/platform-core/src/types/base.ts` — `PlatformCapability` enum (30 values), shared primitives (`ThemeSource`, `FileDialogFilter`, `FileInfo`, `SaveBlobResult`)
- `packages/platform-core/src/types/core-api.ts` — `PlatformFilesAPI`, `PlatformStorageAPI`, `PlatformThemeAPI`, `PlatformShellAPI`, `PlatformApiKeysAPI`, `PlatformLicenseAPI`
- `packages/platform-core/src/types/media-api.ts` — `PlatformSoundsAPI`, `PlatformAudioAPI`, `PlatformVideoAPI`, `PlatformScreenshotAPI`, `PlatformScreenRecordingAPI`, `PlatformFFmpegAPI`, `PlatformTranscriptionAPI`
- `packages/platform-core/src/types/integration-api.ts` — `PlatformFalAPI`, `PlatformGeminiChatAPI`, `PlatformGitHubAPI`, `PlatformYouTubeAPI`, `PlatformPtyAPI`, `PlatformMcpAPI`, `PlatformSkillsAPI`, `PlatformAIPipelineAPI`, `PlatformMediaImportAPI`, `PlatformProjectFolderAPI`, `PlatformProjectJsonAPI`, `PlatformRemotionFolderAPI`, `PlatformMoyinAPI`, `PlatformUpdatesAPI`, `PlatformFillerAnalysisAPI`
- `packages/platform-core/src/types/claude-api.ts` — 14 Claude sub-namespace interfaces (`PlatformClaudeMediaAPI`, `PlatformClaudeTimelineAPI`, `PlatformClaudeTransactionAPI`, etc.) + composite `PlatformClaudeAPI`
- `packages/platform-core/src/types/platform.ts` — root `PlatformAPI` interface (33 properties)
- `packages/platform-core/src/types/index.ts` — barrel exports
- `packages/platform-core/src/types.ts` — backward-compat re-export from `types/`

**Platform provider (singleton accessor):**
- `packages/platform-core/src/provider.ts` — `initPlatform(adapter)` + `platform()` accessor

**Tests:** 16/16 passing (capabilities: 10, provider: 3, type completeness: 3)

### Subtask 2.2 — Implement `platform-desktop` (Electron IPC Adapter) -- DONE

Thin wrapper delegating all calls to `window.electronAPI`.

**Files created:**
- `packages/platform-desktop/package.json` — `@qcut/platform-desktop` workspace package
- `packages/platform-desktop/tsconfig.json` — TypeScript config
- `packages/platform-desktop/src/index.ts` — `createDesktopAdapter()` function with all 33 namespace adapters as pass-through to `window.electronAPI`

**Key design:** Each namespace adapter is a plain object with arrow functions delegating to `api().namespace.method()`. Claude API uses `as unknown as PlatformClaudeAPI` cast since the electron types match the platform types.

### Subtask 2.3 — Implement `platform-web` (Browser Adapter) -- DONE

Browser-safe implementations for cross-platform capabilities, `PlatformUnsupportedError` for desktop-only features.

**Files created:**
- `packages/platform-web/package.json` — `@qcut/platform-web` workspace package
- `packages/platform-web/tsconfig.json` — TypeScript config with DOM lib
- `packages/platform-web/src/index.ts` — `createWebAdapter()` function

**Implemented capabilities:**
| Capability | Web Implementation |
|---|---|
| Storage | `localStorage` with `qcut:` prefix, JSON serialization |
| Theme | `localStorage` + `prefers-color-scheme` media query + `document.documentElement.classList.toggle("dark")` |
| Shell | `window.open()` for external links, no-op for `showItemInFolder` |
| Files | File System Access API for open dialogs, Blob download for save, `null` for path-based read/write |
| API Keys | `localStorage`-based with JSON persistence |

**Desktop-only stubs (Proxy-based):**
All unsupported namespaces use a generic `createUnsupportedNamespace<T>()` helper that returns a Proxy. Any method call returns `Promise.reject(new PlatformUnsupportedError(...))`.

**Tests:** 25/25 passing (`packages/platform-web/src/__tests__/adapter.test.ts`)

### Subtask 2.4 — Migrate Top Call-Sites -- DEFERRED

Call-site migration deferred to Phase 3 (Web Shell MVP) where it will be done as part of wiring `apps/web` to run with platform adapters. The adapter infrastructure is fully ready:
- `initPlatform()` / `platform()` singleton pattern ready for app entry point
- Desktop adapter covers all 282 `window.electronAPI` call-site patterns
- Web adapter provides browser implementations for core features

**Migration pattern (ready to apply):**
```typescript
// Before:
if (window.electronAPI?.storage?.save) {
  await window.electronAPI.storage.save(key, data);
} else {
  localStorage.setItem(key, JSON.stringify(data));
}

// After:
await platform().storage.save(key, data);
```

**Config files updated:**
- `package.json` (root) — added `packages/platform-desktop` and `packages/platform-web` to workspaces
- `vitest.config.ts` — added test include paths for `packages/platform-desktop/` and `packages/platform-web/`

**Exit Criteria — MET:**
- Full PlatformAPI contract covering all 120+ preload methods across 33 namespaces
- Desktop adapter delegates every call to `window.electronAPI`
- Web adapter implements 5 cross-platform capabilities, stubs 20+ desktop-only ones
- 41 platform tests passing (platform-core: 16, platform-web: 25)
- Full build passes (`bun run build`)
- All 287 test files passing (3990+ tests)

---

## Phase 3: Ship Web Shell MVP — QCut Lite (2-4 weeks) — COMPLETE

**Objective:** Validate architecture with a constrained but usable web product.
**Status:** Implemented 2026-03-10

### Subtask 3.1 — Web Shell Bootstrap -- DONE

Wire `apps/web` to run with `platform-web` adapter.

**Files created:**
- `apps/web/src/platform-init.ts` — async `setupPlatform()` that detects Electron vs browser environment, loads correct adapter via `initPlatform()`

**Files updated:**
- `apps/web/src/routeTree.gen.ts` / root route — calls `setupPlatform()` on app startup
- `apps/web/package.json` — added `@qcut/platform-core`, `@qcut/platform-desktop`, `@qcut/platform-web` dependencies

### Subtask 3.2 — Define QCut Lite Feature Scope -- DONE

**In scope (core edit):**
- Timeline editing, preview playback
- Media import (drag & drop, File System Access API)
- Captions, effects, stickers
- FFmpeg WASM operations (trim, merge, basic export)
- AI features via direct API calls
- Project save/load (IndexedDB + download/upload)

**Out of scope (desktop-only):**
- Native file system project folders
- CLI export pipeline
- PTY terminal / native CLI skills
- Screen recording (partial — MediaRecorder where available)
- Auto-updates
- Native file associations (`.qcut` protocol)

### Subtask 3.3 — Graceful Degradation & Capability Guards -- DONE

**Files created:**
- `apps/web/src/hooks/use-platform-capability.ts` — `usePlatformCapability()`, `useIsDesktop()`, `usePlatformId()` React hooks for capability-gated UI

**Tests created:**
- `apps/web/src/__tests__/platform-init.test.ts` — 3 tests (setup callable, detects web env, accessible after init)
- `apps/web/src/__tests__/use-platform-capability.test.ts` — 6 tests (hook exports, enum completeness, desktop-only capabilities)

### Subtask 3.4 — Migrate Top Call-Sites to Platform Adapters -- DONE

Migrated 5 high-traffic files from `window.electronAPI` to `platform()` pattern:

| File | Refs Migrated | Type |
|------|--------------|------|
| `stores/pty-terminal-store.ts` | 13 | Desktop-only (PTY) |
| `lib/claude-bridge/claude-timeline-bridge.ts` | 13 | Desktop-only (Claude) |
| `lib/export/export-engine-cli.ts` | 12 | Desktop-only (FFmpeg CLI) |
| `components/editor/properties-panel/api-keys-view.tsx` | 10 | Cross-platform |
| `components/update-notification.tsx` | 6 | Desktop-only (updates) |

**Migration pattern applied:**
```typescript
// Before:
if (window.electronAPI?.namespace) {
  await window.electronAPI.namespace.method(args);
}
// After:
await platform().namespace.method(args);
```

**Type strategy for desktop adapter:** `api()` returns `any` to avoid type friction between `PlatformAPI` interfaces and Electron preload types. The outer `createDesktopAdapter()` return is cast to `PlatformAPI`. Runtime behavior is identical — purely a type-level concern.

**Claude bridge:** Updated `ClaudeTimelineBridgeAPI` type alias from `window.electronAPI.claude.timeline` to `PlatformClaudeTimelineAPI`. Callback parameters use `any` since platform types use `unknown` for IPC data.

### Subtask 3.5 — Browser Compatibility & Performance -- DEFERRED

Browser-specific WASM loading and cross-browser testing deferred to Phase 3.5.

**Files (future):**
- `apps/web/vite.config.ts` — WASM chunk loading without Electron
- `apps/web/src/lib/ffmpeg/environment.ts` — web-specific path resolution
- Cross-browser manual testing (Chrome, Firefox, Safari, Edge)

**Exit Criteria — MET:**
- Platform adapters wired into app entry point via `setupPlatform()`
- 54 `window.electronAPI` references migrated across 5 files to `platform()` pattern
- Capability guard hooks (`usePlatformCapability`, `useIsDesktop`) available for UI gating
- Desktop adapter (`platform-desktop`) fully covers all Electron preload APIs
- Web adapter (`platform-web`) provides browser implementations + graceful stubs
- Full build passes (`bun run build`)
- All 289 test files passing (4000 tests)

---

## Phase 3.5: Complete Call-Site Migration & Browser Smoke Test (1-2 days)

**Objective:** Migrate remaining `window.electronAPI` refs in core edit flows so QCut Lite actually loads in a standalone browser.

**Current state:** 250 `window.electronAPI` refs across 99 files (54 migrated in Phase 3.4). After excluding test files and desktop-only features, **~30 source files** in core edit flows still need migration.

### Subtask 3.5.1 — Migrate Core Edit Flow Files (Wave 1 — Must-Have)

Files reachable from browser-based editing. Without migration these will crash at runtime on web.

| File | Refs | API Namespaces |
|------|------|----------------|
| `lib/project/zip-manager.ts` | 12 | `readFile`, `saveBlob`, `video` |
| `hooks/media/use-elevenlabs-transcription.ts` | 10 | `transcribe`, `ffmpeg` |
| `hooks/use-ai-pipeline.ts` | 9 | `aiPipeline.*` |
| `components/editor/media-panel/views/word-timeline/drop-zone.tsx` | 8 | `getPathForFile`, `files` |
| `components/editor/media-panel/views/captions.tsx` | 8 | `ffmpeg`, `gemini` detection |
| `stores/stickers-overlay-store.ts` | 6 | persistence checks |
| `hooks/use-project-folder.ts` | 6 | `projectFolder.*` |
| `hooks/auth/useLogin.ts` | 6 | `license.*` |
| `hooks/auth/useSignUp.ts` | 6 | `license.*` |
| `lib/ai-video/core/fal-upload.ts` | 4 | `video.*` |
| `lib/export/export-engine-cli-audio.ts` | 3 | `ffmpeg`, `video` |
| `lib/export/export-engine-cli-utils.ts` | 3 | `video`, `ffmpeg` |
| `lib/ai-clients/fal-ai-client.ts` | 3 | detection only |
| `lib/export/export-engine-cli-ffmpeg.ts` | 2 | `ffmpeg.*` |
| `lib/export/export-engine-factory.ts` | 2 | detection only |
| `lib/ai-video/generators/image.ts` | 2 | detection only |
| `lib/ai-video/generators/kling-generators.ts` | 2 | detection only |
| `lib/ai-clients/sam3-client.ts` | 2 | detection only |
| `lib/media/media-processing.ts` | 2 | detection only |
| `lib/export-cli/sources/video-sources.ts` | 4 | `video.*` |
| `lib/export-cli/sources/image-sources.ts` | 2 | `video.*` |
| `lib/export-cli/sources/sticker-sources.ts` | 1 | `ffmpeg.*` |
| `lib/export-cli/filters/font-resolver.ts` | 2 | `ffmpeg.*` |
| `stores/project-store.ts` | 1 | `projectJson.*` |
| `hooks/use-project-json-sync.ts` | 1 | `projectJson.*` |
| `lib/media/bulk-import.ts` | 1 | detection only |
| `lib/ffmpeg/environment.ts` | 1 | detection only |
| `routes/editor.$project_id.lazy.tsx` | 1 | detection only |
| `components/editor-provider.tsx` | 1 | detection only |
| `lib/api-adapter.ts` | 3 | detection adapters |

**Pattern for detection-only refs:**
```typescript
// Before: if (window.electronAPI?.namespace) { ... }
// After:  if (platform().hasCapability(PlatformCapability.Namespace)) { ... }
```

### Subtask 3.5.2 — Desktop-Only Files (Wave 2 — Defer)

43 files in desktop-only features that won't be reached in QCut Lite. Can migrate incrementally.

| Category | Files | Refs | Reason to Defer |
|----------|-------|------|-----------------|
| Claude agent bridges | 10 | ~18 | Requires local Claude infrastructure |
| Moyin/storyboarding | 6 | ~13 | Requires PTY parsing pipeline |
| Native skills | 5 | ~14 | Requires native skill runtime |
| Gemini terminal | 2 | ~9 | Requires agent bridging |
| PTY terminal UI | 2 | ~4 | Desktop CLI integration |
| Screen recording & Remotion | 4 | ~7 | OS capture / desktop rendering |
| Misc (GitHub stars, debug, blog) | 5 | ~8 | Non-critical UI |

### Subtask 3.5.3 — Browser Smoke Test

Manual verification that QCut Lite loads in a standalone browser (no Electron).

**Steps:**
1. `bun dev` → open `http://localhost:5173` in Chrome (no Electron wrapper)
2. Verify: app loads without console errors from missing `window.electronAPI`
3. Verify: project list / create project works (IndexedDB storage)
4. Verify: editor route loads, timeline renders
5. Verify: desktop-only UI (PTY tab, screen recording, updates) is hidden via capability guards

**Exit Criteria:**
- Zero `window.electronAPI` refs in core edit flow files (~30 files migrated)
- QCut Lite loads in Chrome without runtime crashes
- Desktop-only features gracefully hidden (not erroring)
- Build passes, all tests pass

---

## Phase 4: iPad Optimization (1-2 weeks)

**Objective:** Touch-first UX on top of web shell.

### Subtask 4.1 — Touch Gesture Integration

**Files:**
- `apps/web/src/components/editor/` — timeline drag, clip resize, scrubbing
- `apps/web/src/hooks/` — new touch-specific hooks or adapt existing drag hooks
- `apps/web/src/routes/editor.$project_id.tsx` — touch event handlers

### Subtask 4.2 — Hit Target & Layout Optimization

**Files:**
- `apps/web/src/components/` — increase touch targets (min 44px)
- Tailwind config — responsive breakpoints for tablet
- Panel layout — adapt `react-resizable-panels` for touch drag

### Subtask 4.3 — iPad Safari Performance

**Files:**
- `apps/web/src/lib/ffmpeg/` — memory management for Safari WASM limits
- `apps/web/vite.config.ts` — chunk splitting optimized for mobile bandwidth

**Tests:**
- Manual: iPad Safari, iPad Chrome
- Performance profiling: memory, frame rate on timeline scrub

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Desktop release cadence disrupted | Dual-track delivery, feature flags, weekly release health gate |
| 324 call-site migration balloons | Value-first sequencing (high-frequency first), defer long-tail |
| Behavior divergence Desktop vs Web | Shared `PlatformAPI` contract tests + critical-path E2E |
| Team interprets as Electron rewrite | Enforce messaging: **adapterization, not rewrite** |
| iPad expectations exceed web capability | Define QCut Lite scope early, communicate non-goals |

## Non-Negotiable Guardrails

1. Keep desktop release train stable
2. Make small, reversible, observable changes
3. No radical Electron rewrite — adapterize incrementally
4. Position web as **QCut Lite** first, then expand

---

## Timeline Summary

| Phase | Duration | Key Deliverable | Status |
|-------|----------|----------------|--------|
| Phase 0: Freeze Boundaries | 1 week | Usage matrix, strengthened checker, capability contract | COMPLETE |
| Phase 1: Extract Core | 1-2 weeks | `packages/editor-core` with independent tests | COMPLETE |
| Phase 2: Platform Adapters | 1-2 weeks | `platform-desktop` + `platform-web` + provider | COMPLETE |
| Phase 3: Web Shell MVP | 2-4 weeks | Adapter wiring, capability guards, top 5 file migration | COMPLETE |
| Phase 3.5: Full Migration | 1-2 days | Migrate ~30 core edit files, browser smoke test | TODO |
| Phase 4: iPad | 1-2 weeks | Touch-optimized QCut Lite on iPad | TODO |
| **Total** | **7-11 weeks** | | |
