# Refactor Plan: editor-cli-integration.test.ts

**File**: `electron/__tests__/editor-cli-integration.test.ts`
**Current size**: 1187 lines
**Goal**: Split by feature area, each under 800 lines

## Current Structure Analysis

The file tests CLI handler functions with a shared mock HTTP server. Structure:

| Lines | Section | Test Count |
|-------|---------|------------|
| 1-86 | Shared setup: mock HTTP server, `mockRoute`, `clearRoutes`, `installFetchMock`, `makeOpts`, `noopProgress` | - |
| 93-276 | `handleEditorCommand dispatcher` | 10 tests |
| 282-498 | `Media handlers — uncovered actions` | 11 tests |
| 504-606 | `Project handlers — uncovered actions` | 5 tests |
| 612-781 | `Timeline handlers — uncovered actions` | 8 tests |
| 787-859 | `Editing handlers — uncovered actions` | 3 tests |
| 865-1018 | `Generate handlers — uncovered actions` | 8 tests |
| 1025-1112 | `Analysis handlers — edge cases` | 5 tests |
| 1118-1187 | `EditorApiClient — error edge cases` | 4 tests |

Shared mock infrastructure (~86 lines): `routes` Map, `mockRoute()`, `clearRoutes()`, `installFetchMock()`, `makeOpts()`, `noopProgress`.

## Proposed Split

### 1. `__tests__/editor-cli-test-setup.ts` (~90 lines) — shared mock infrastructure
- Mock HTTP server (`routes`, `mockRoute`, `clearRoutes`, `installFetchMock`)
- `makeOpts()` helper
- `noopProgress` constant
- All imports re-exported

### 2. `__tests__/editor-cli-dispatcher.test.ts` (~250 lines)
- `handleEditorCommand dispatcher` (10 tests)
- `EditorApiClient — error edge cases` (4 tests) — closely related

### 3. `__tests__/editor-cli-media-project.test.ts` (~350 lines)
- `Media handlers — uncovered actions` (11 tests)
- `Project handlers — uncovered actions` (5 tests)

### 4. `__tests__/editor-cli-timeline.test.ts` (~320 lines)
- `Timeline handlers — uncovered actions` (8 tests)
- `Editing handlers — uncovered actions` (3 tests)

### 5. `__tests__/editor-cli-generate-analysis.test.ts` (~300 lines)
- `Generate handlers — uncovered actions` (8 tests)
- `Analysis handlers — edge cases` (5 tests)

## Estimated Line Counts

| File | Lines |
|------|-------|
| `editor-cli-test-setup.ts` | ~90 |
| `editor-cli-dispatcher.test.ts` | ~250 |
| `editor-cli-media-project.test.ts` | ~350 |
| `editor-cli-timeline.test.ts` | ~320 |
| `editor-cli-generate-analysis.test.ts` | ~300 |

## Barrel Re-export Strategy

No barrel needed. Each test file imports from `./editor-cli-test-setup`:
```ts
import { mockRoute, clearRoutes, installFetchMock, makeOpts, noopProgress, BASE_URL } from './editor-cli-test-setup';
```

Each test file manages its own `beforeAll`/`afterAll` for `installFetchMock`/`originalFetch` and its own `EditorApiClient` instances.
