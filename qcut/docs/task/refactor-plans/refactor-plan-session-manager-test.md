# Refactor Plan: session-manager.test.ts

**File**: `packages/qagent/packages/core/src/__tests__/session-manager.test.ts`
**Current size**: 1515 lines
**Goal**: Split into focused test files, each under 800 lines

## Current Structure Analysis

The file tests `createSessionManager` with these top-level `describe` blocks:

| Lines | Describe Block | Test Count |
|-------|---------------|------------|
| 1-39 | Top-level setup (imports, mocks, `beforeEach`) | - |
| 40-483 | `spawn` | 10 tests |
| 485-721 | `list` | 8 tests |
| 724-782 | `get` | 3 tests |
| 784-833 | `kill` | 3 tests |
| 835-922 | `cleanup` | 3 tests |
| 924-964 | `send` | 3 tests |
| 966-1092 | `spawnOrchestrator` | 8 tests |
| 1094-1458 | `restore` | 12 tests |
| 1460-1515 | `PluginRegistry.loadBuiltins importFn` | 2 tests |

Shared setup (~100 lines): imports, `tmpDir`/`configPath`/`sessionsDir` creation, mock factories (`mockRuntime`, `mockAgent`, `mockWorkspace`, `mockRegistry`, `config`), `makeHandle` helper, `beforeEach`.

## Proposed Split

### 1. `__tests__/session-manager-setup.ts` (~100 lines) — shared test utilities
- All imports, mock factories, `makeHandle`, `beforeEach` setup
- Exported as reusable fixtures for other test files
- Not a test file itself — just shared setup

### 2. `__tests__/session-manager-spawn.test.ts` (~490 lines)
- `spawn` describe block (10 tests, ~440 lines)
- `spawnOrchestrator` describe block (8 tests, ~126 lines) — closely related
- Imports shared setup from `session-manager-setup.ts`

### 3. `__tests__/session-manager-lifecycle.test.ts` (~530 lines)
- `list` describe block (8 tests, ~237 lines)
- `get` describe block (3 tests, ~59 lines)
- `kill` describe block (3 tests, ~50 lines)
- `cleanup` describe block (3 tests, ~88 lines)
- `send` describe block (3 tests, ~41 lines)

### 4. `__tests__/session-manager-restore.test.ts` (~420 lines)
- `restore` describe block (12 tests, ~365 lines)
- `PluginRegistry.loadBuiltins importFn` describe block (2 tests, ~56 lines) — kept here as it's the smallest remaining group

## Estimated Line Counts

| File | Lines |
|------|-------|
| `session-manager-setup.ts` | ~100 |
| `session-manager-spawn.test.ts` | ~490 |
| `session-manager-lifecycle.test.ts` | ~530 |
| `session-manager-restore.test.ts` | ~420 |

## Barrel Re-export Strategy

No barrel needed. The shared setup file (`session-manager-setup.ts`) exports:
- `createTestEnvironment()` — returns `{ tmpDir, configPath, sessionsDir, mockRuntime, mockAgent, mockWorkspace, mockRegistry, config }`
- `makeHandle(id: string)` helper
- All type imports re-exported for convenience

Each test file imports from `./session-manager-setup` and calls `createTestEnvironment()` in its own `beforeEach`.
