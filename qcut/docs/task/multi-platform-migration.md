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

## Phase 1: Extract Core Data/Domain Layer (1-2 weeks)

**Objective:** Decouple editor logic from Electron-specific runtime.

### Subtask 1.1 — Bootstrap `packages/editor-core`

Create the package with build config and test harness.

**Files:**
- New: `packages/editor-core/package.json`
- New: `packages/editor-core/tsconfig.json`
- New: `packages/editor-core/src/index.ts`
- `package.json` (root) — add workspace reference
- `turbo.json` — add build pipeline entry

**Tests:**
- `packages/editor-core/src/__tests__/setup.test.ts` — verify package builds and tests independently

### Subtask 1.2 — Extract Timeline State & Services

Move timeline/document state and pure domain logic out of renderer stores.

**Files to extract from:**
- `apps/web/src/stores/timeline-store.ts` — core timeline state (separate Electron-dependent parts)
- `apps/web/src/stores/timeline/` — timeline sub-stores
- `apps/web/src/stores/project-store.ts` — project data model
- `apps/web/src/stores/captions-store.ts` — caption data model
- `apps/web/src/stores/effects-store.ts` — effects data model

**Extract to:**
- `packages/editor-core/src/timeline/` — pure timeline state, types, operations
- `packages/editor-core/src/project/` — project data model
- `packages/editor-core/src/types/` — shared type definitions

**Tests:**
- `packages/editor-core/src/timeline/__tests__/timeline-operations.test.ts`
- `packages/editor-core/src/project/__tests__/project-model.test.ts`

### Subtask 1.3 — Extract Command Stack (Undo/Redo)

Move command/history logic to editor-core.

**Files to audit:**
- `apps/web/src/stores/` — find undo/redo logic
- `apps/web/src/hooks/` — find command-related hooks

**Extract to:**
- `packages/editor-core/src/commands/` — command pattern, history stack

**Tests:**
- `packages/editor-core/src/commands/__tests__/command-stack.test.ts`

### Subtask 1.4 — Inject Platform Dependencies

Replace direct platform calls in extracted code with dependency-injected capabilities.

**Files:**
- `packages/editor-core/src/platform.ts` — `PlatformProvider` interface (injected at init)
- All extracted modules — replace `window.electronAPI.*` with injected provider calls

**Exit Criteria:**
- `editor-core` runs unit tests independently (node/jsdom, no Electron)
- Zero direct Electron imports in core modules

---

## Phase 2: Build Platform Adapter Layer (1-2 weeks)

**Objective:** Route all platform access through adapters.

### Subtask 2.1 — Define `PlatformAPI` TypeScript Interfaces

Full contract covering all 52 handler capabilities.

**Files:**
- New: `packages/platform-core/src/types.ts` — complete `PlatformAPI` interface
- New: `packages/platform-core/src/capabilities.ts` — capability detection helpers
- New: `packages/platform-core/package.json`

**Organize by namespace (matching preload structure):**
- `files` — open/save dialogs, read/write, file info
- `storage` — save/load/remove/list/clear
- `theme` — get/set/toggle
- `sounds` — search, download
- `audio` / `video` — temp file management
- `screenshot` / `screenRecording` — capture APIs
- `transcribe` — transcription services
- `ffmpeg` — export, health checks, frame saving
- `apiKeys` — key management
- `shell` — open external, show in folder
- `license` — activation, credits
- `ai` — pipeline, fal, gemini chat
- `pty` — terminal sessions
- `claude` — Claude integration (28 handlers)

**Tests:**
- `packages/platform-core/src/__tests__/type-completeness.test.ts` — verify all preload APIs are covered

### Subtask 2.2 — Implement `platform-desktop` (Electron IPC Adapter)

Wrap existing `window.electronAPI` calls in the new interface.

**Files:**
- New: `packages/platform-desktop/src/index.ts` — adapter implementation
- New: `packages/platform-desktop/src/adapters/` — one file per namespace
- New: `packages/platform-desktop/package.json`

**Key consideration:** This is largely a thin wrapper — the existing preload bridge already provides the abstraction. The adapter maps `PlatformAPI` calls to `window.electronAPI` calls.

**Tests:**
- `packages/platform-desktop/src/__tests__/adapter.test.ts` — mock `window.electronAPI`, verify delegation

### Subtask 2.3 — Implement `platform-web` (Browser Adapter)

Browser-safe implementations with graceful fallbacks.

**Files:**
- New: `packages/platform-web/src/index.ts` — adapter implementation
- New: `packages/platform-web/src/adapters/` — one file per namespace
- New: `packages/platform-web/package.json`

**Implementation strategy by capability:**

| Capability | Web Implementation |
|---|---|
| File dialogs | `<input type="file">` + File System Access API |
| Storage | IndexedDB + localStorage (already partially exists) |
| Theme | CSS media queries + localStorage |
| FFmpeg | WASM-only (already in `apps/web/src/lib/ffmpeg/`) |
| Transcription | Direct API calls (no IPC needed) |
| API keys | Secure cookie/session storage |
| Shell | `window.open()` for external links |
| Screenshot | Canvas API |
| Screen recording | MediaRecorder API |
| PTY / native CLI | Stub / not available (QCut Lite limitation) |
| License | Direct HTTP to license server |
| AI pipeline | Direct HTTP to provider APIs |

**Tests:**
- `packages/platform-web/src/__tests__/file-adapter.test.ts`
- `packages/platform-web/src/__tests__/storage-adapter.test.ts`
- `packages/platform-web/src/__tests__/capability-detection.test.ts`

### Subtask 2.4 — Migrate Top 100 Call-Sites

Replace direct `window.electronAPI` usage with adapter calls, starting with highest-traffic files.

**Files (priority order):**
1. `apps/web/src/components/editor/draw/utils/drawing-storage.ts` (21 refs)
2. `apps/web/src/stores/pty-terminal-store.ts` (13 refs)
3. `apps/web/src/lib/claude-bridge/claude-timeline-bridge.ts` (13 refs)
4. `apps/web/src/lib/export/export-engine-cli.ts` (12 refs)
5. `apps/web/src/lib/project/zip-manager.ts` (12 refs)
6. `apps/web/src/hooks/use-elevenlabs-transcription.ts` (10 refs)
7. `apps/web/src/hooks/use-ai-pipeline.ts` (9 refs)
8. `apps/web/src/stores/gemini-terminal-store.ts` (7 refs)
9. `apps/web/src/stores/skills-store.ts` (6 refs)
10. `apps/web/src/stores/stickers-overlay-store.ts` (6 refs)

**Pattern:** Replace `window.electronAPI.x.y()` with `platform.x.y()` where `platform` is injected via React context or module-level init.

**Tests:**
- Existing E2E tests must pass (`bun run test:e2e`)
- Desktop regression baseline preserved

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
