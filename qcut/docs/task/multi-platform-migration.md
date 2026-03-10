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

## Phase 3: Ship Web Shell MVP — QCut Lite (2-4 weeks)

**Objective:** Validate architecture with a constrained but usable web product.

### Subtask 3.1 — Web Shell Bootstrap

Wire `apps/web` to run with `platform-web` adapter.

**Files:**
- `apps/web/vite.config.ts` — add web-only build mode (no Electron globals)
- New: `apps/web/src/platform-init.ts` — detect environment, load correct adapter
- `apps/web/src/main.tsx` or router entry — initialize platform provider

### Subtask 3.2 — Define QCut Lite Feature Scope

Clearly define what's in and out for web.

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

### Subtask 3.3 — Graceful Degradation

Implement capability checks so UI hides/disables unavailable features.

**Files:**
- `apps/web/src/hooks/use-platform-capability.ts` — React hook for capability checks
- Components using desktop-only features — wrap with capability guards

**Tests:**
- `apps/web/src/__tests__/platform-capability.test.ts`
- E2E: web shell loads and core edit flows work in browser

### Subtask 3.4 — Browser Compatibility & Performance

**Files:**
- `apps/web/vite.config.ts` — ensure WASM chunks load correctly without Electron
- `apps/web/src/lib/ffmpeg/environment.ts` — web-specific path resolution
- `apps/web/src/lib/ffmpeg/ffmpeg-loader.ts` — verify WASM loading in browser context

**Tests:**
- Manual: Chrome, Firefox, Safari, Edge
- `bun run test:e2e` — adapted for browser target

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

| Phase | Duration | Key Deliverable |
|-------|----------|----------------|
| Phase 0: Freeze Boundaries | 1 week | Usage matrix, strengthened checker, capability contract |
| Phase 1: Extract Core | 1-2 weeks | `packages/editor-core` with independent tests |
| Phase 2: Platform Adapters | 1-2 weeks | `platform-desktop` + `platform-web` + 30%+ migration |
| Phase 3: Web Shell MVP | 2-4 weeks | QCut Lite running in browser |
| Phase 4: iPad | 1-2 weeks | Touch-optimized QCut Lite on iPad |
| **Total** | **7-11 weeks** | |
