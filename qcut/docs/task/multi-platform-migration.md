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

## Phase 3.5: Complete Call-Site Migration & Browser Smoke Test (1-2 days) — COMPLETE

**Objective:** Migrate remaining `window.electronAPI` refs so QCut Lite can load in a standalone browser.
**Status:** Implemented 2026-03-10

### Subtask 3.5.1 — Migrate All Source Files -- DONE

Migrated **all 82 remaining non-test source files** (250 refs) from `window.electronAPI` to `platform()`. Zero `window.electronAPI` references remain in production source code.

**Wave 1 — Core Edit Flows (30 files, ~110 refs):**
- `zip-manager.ts` (12), `use-elevenlabs-transcription.ts` (10), `use-ai-pipeline.ts` (9)
- `drop-zone.tsx` (8), `captions.tsx` (8), `stickers-overlay-store.ts` (6)
- `use-project-folder.ts` (6), `useLogin.ts` (6), `useSignUp.ts` (6), `skills-store.ts` (6)
- `moyin-store.ts` (5), export CLI files (15 combined), AI client files (10 combined)
- Plus 15 more files with 1-4 refs each

**Wave 2 — Desktop-Only Features (43 files, ~73 refs):**
- Claude bridges (10 files), Moyin stores (6 files), Gemini terminal (2 files)
- PTY terminal, screen recording, Remotion, skills, debug utilities
- All migrated for consistency — not deferred

**Wave 3 — Remaining (9 files, ~17 refs):**
- Blog route, editor provider, preview panel, screenshot control
- User avatar, media item card, sounds panel, word-timeline view
- Project folder view, remotion folder dialog, skill card

**Migration patterns applied:**
```typescript
// Direct API calls:
window.electronAPI?.namespace.method(args) → platform().namespace.method(args)

// Detection checks:
if (window.electronAPI?.namespace) → platform().hasCapability() or platform().isElectron

// Boolean checks:
!!window.electronAPI → platform().isElectron
```

**Source code fixes required during migration:**
- `useLogin.ts` / `useSignUp.ts` — wrapped `platform().license.onActivationToken` in try-catch (web adapter proxy returns truthy for license namespace)
- `moyin-store.ts` — wrapped module-level `platform().moyin.onParsed?.()` in try-catch (prevents crash during test imports)

### Subtask 3.5.2 — Update Test Files -- DONE

Updated **21 test files** to initialize platform adapters after mocking `window.electronAPI`.

**Pattern applied:**
```typescript
import { initPlatform } from "@qcut/platform-core";
import { createDesktopAdapter } from "@qcut/platform-desktop";
// In beforeEach, after window.electronAPI mock:
initPlatform(createDesktopAdapter());
```

**Tests checking "unavailable API" scenarios** updated to use `initPlatform(createWebAdapter())` instead of `window.electronAPI = undefined`.

**Test files updated:**
- `use-ai-pipeline.test.ts`, `useLogin.test.ts`, `useSignUp.test.ts`
- `gemini-terminal-store.test.ts`, `moyin-calibration.test.ts`, `skills-store.test.ts`
- `word-timeline-store.test.ts`, `remotion-export-wiring.test.ts`, `pre-renderer.test.ts`
- `seeddream45.test.ts`, `vidu-q3.test.ts`, `bulk-import.test.ts`
- `credit-guard.test.ts`, `pty-session-cleanup.test.ts`, `project-skills-sync.test.ts`
- `use-project-folder.test.ts`, `project-create.test.ts`
- `sounds-api.test.ts`, `blog.test.tsx`, `component-browser.test.tsx`
- `model-handlers-routing.test.ts`, `adapter.test.ts` (platform-web)

### Subtask 3.5.3 — Browser Smoke Test -- PENDING

Manual verification still needed. Steps defined in Phase 3 plan.

**Exit Criteria — MET (except smoke test):**
- **Zero** `window.electronAPI` refs in production source code (82 files migrated)
- Full build passes (`bun run build`)
- All 289 test files passing (4000 tests)
- Desktop-only features use platform adapter (graceful web stubs available)

---

## Phase 3.6: Web Runtime Readiness (3-5 days) — COMPLETE

**Objective:** Make QCut Lite actually load and run in a browser without Electron. Validates Phase 3/3.5 migration before building iPad touch interactions.
**Status:** Core infrastructure implemented 2026-03-10

### Subtask 3.6.1 — Browser Smoke Test -- DONE

Verified QCut Lite loads at `localhost:5173` via `bun dev:web`. All pages tested:

| Page | Status |
|------|--------|
| Landing page (`/`) | Renders fully: hero, nav, footer, 0 errors |
| Projects page (`/#/projects`) | Lists projects, thumbnails load, templates shown, 0 errors |
| Editor (`/#/editor/:id`) | Full editor UI: toolbar, panels, timeline, preview, export settings, 0 errors |

**Runtime issues found and fixed:**
- `ScreenRecordingControl` — crashed reading `.recording` from null (graceful stub returns null for `getStatus()`). Fixed with optional chaining on `status?.recording` and `status?.startedAt`.
- `projectJson.write` — threw `PlatformUnsupportedError` during project load. Fixed by making `projectJson` a graceful stub instead of throwing.

**Files changed:**
- `apps/web/src/components/editor/screen-recording-control.tsx` — added null-safe `status?.recording` / `status?.startedAt` (7 occurrences)
- `packages/platform-web/src/index.ts` — changed `projectJson` from throwing stub to graceful no-op

### Subtask 3.6.2 — Web Adapter Real Implementations -- DONE

Upgraded web adapter from crash-on-call Proxy stubs to a two-tier system:

**Fully implemented (8 namespaces):**
| Capability | Implementation |
|---|---|
| `storage` | localStorage with `qcut:` prefix |
| `files` | File System Access API (open/save), Blob download |
| `theme` | CSS media queries + localStorage |
| `shell` | `window.open()` for external links |
| `apiKeys` | localStorage-based |
| `license` | Free tier defaults (no-op auth, no credits) |
| `github` | Direct `fetch` to GitHub API |
| `aiPipeline` | Returns `{ available: false }` gracefully |

**Graceful stubs (10 namespaces):** Return safe defaults (null/no-op) instead of throwing:
`sounds`, `audio`, `video`, `screenshot`, `screenRecording`, `ffmpeg`, `transcription`, `fal`, `geminiChat`, `mediaImport`

**Throwing stubs (9 namespaces):** Desktop-only, calling code must gate on `isElectron`:
`youtube`, `pty`, `mcp`, `skills`, `projectFolder`, `projectJson`, `remotionFolder`, `moyin`, `updates`

**Files changed:**
- `packages/platform-web/src/index.ts` — expanded from 380→430 lines with real license adapter, GitHub adapter, aiPipeline adapter, `createGracefulNamespace()` helper, `getPathForFile` via `URL.createObjectURL`, `analyzeFillers` returns empty array
- `packages/platform-core/src/index.ts` — added `LicenseInfo`, `LicenseCreditBalance`, `LicenseUserProfile` exports

**Tests:** 43/43 passing (`packages/platform-web/src/__tests__/adapter.test.ts`)

### Subtask 3.6.3 — Web-Only Build Configuration -- DONE

Added `dev:web` and `build:web` scripts that set `VITE_BUILD_TARGET=web`. Existing `vite.config.ts` already handles web vs electron base path switching.

**Files changed:**
- `apps/web/package.json` — added `dev:web`, `build:web` scripts
- `package.json` (root) — added `dev:web`, `build:web` convenience scripts

**Usage:** `bun dev:web` starts web-only dev server at `localhost:5173`

### Subtask 3.6.4 — Graceful Fallback UI -- DONE

Created `DesktopOnly` and `WebUnavailable` UI components for capability gating.

**Files created:**
- `apps/web/src/components/ui/desktop-only.tsx` — `DesktopOnly` wrapper (hides children on web, optional fallback), `WebUnavailable` banner
- `apps/web/src/components/ui/__tests__/desktop-only.test.tsx` — 4 tests

**Existing infrastructure:**
- `apps/web/src/hooks/use-platform-capability.ts` — `usePlatformCapability()`, `useIsDesktop()`, `usePlatformId()` already available

### Subtask 3.6.5 — Runtime Error Audit -- DONE

Ran `bun dev:web`, navigated to all major pages via Playwright. Fixed 2 runtime crashes (see 3.6.1). Editor loads with **0 console errors**.

**Known web limitations (not errors):**
- Terminal/PTY panel shows "Capability 'pty' is not supported" (expected — desktop-only)
- Claude Code agent start button shows error state (expected — no Electron IPC)
- Export engine uses Standard/WebM format (CLI export not available on web)

**Test updates (3 files):**
- `apps/web/src/hooks/auth/__tests__/useLogin.test.ts` — updated 2 assertions for graceful license adapter (no longer throws)
- `apps/web/src/hooks/auth/__tests__/useSignUp.test.ts` — updated 2 assertions for graceful license adapter
- `apps/web/src/lib/__tests__/seeddream45.test.ts` — updated 1 assertion for graceful fal adapter

**Exit Criteria — MET:**
- [x] `dev:web` script starts a web-only dev server
- [x] All 290 test files passing (4022 tests)
- [x] Full build passes (`bun run build`)
- [x] Desktop-only features have `DesktopOnly`/`WebUnavailable` components ready
- [x] QCut Lite loads in Chrome with 0 console errors (landing, projects, editor)
- [x] Core editor UI renders: toolbar, panels, timeline, preview, export settings

---

## Phase 4: iPad Optimization (1-2 weeks) — TODO

**Objective:** Touch-first UX on top of web shell.

> Detailed plan: [`docs/task/ipad-optimization.md`](ipad-optimization.md)

### Subtask 4.1 — Pointer Events Migration
Replace all `mouse*` events with `pointer*` events (mouse + touch + stylus).

### Subtask 4.2 — Touch-Friendly Hit Areas
Increase all interactive targets to 44px minimum (Apple HIG).

### Subtask 4.3 — Pinch-to-Zoom for Timeline
Two-finger pinch gesture for timeline zoom.

### Subtask 4.4 — Media Drag-to-Timeline Touch Support
Custom touch drag (HTML5 Drag API doesn't work on iOS Safari).

### Subtask 4.5 — iPad Layout Adaptation
Responsive panels, safe areas, compact toolbar.

### Subtask 4.6 — Virtual Keyboard Handling
iOS virtual keyboard detection and layout adjustment.

### Subtask 4.7 — Safari/WebKit Compatibility Audit
Fix WebKit-specific rendering and API issues.

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
| Phase 3.5: Full Migration | 1-2 days | All 82 source files migrated, 21 test files updated | COMPLETE |
| Phase 3.6: Web Runtime | 3-5 days | QCut Lite loads in browser, core flows work | COMPLETE |
| Phase 4: iPad | 1-2 weeks | Touch-optimized QCut Lite on iPad | TODO |
| **Total** | **8-13 weeks** | | |
